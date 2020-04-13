package qmux

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
)

const (
	msgChannelOpen = iota + 100
	msgChannelOpenConfirm
	msgChannelOpenFailure
	msgChannelWindowAdjust
	msgChannelData
	msgChannelEOF
	msgChannelClose
)

const (
	minPacketLength = 9
	// channelMaxPacket contains the maximum number of bytes that will be
	// sent in a single packet. As per RFC 4253, section 6.1, 32k is also
	// the minimum.
	channelMaxPacket = 1 << 15
	// We follow OpenSSH here.
	channelWindowSize = 64 * channelMaxPacket
)

// chanSize sets the amount of buffering qmux connections. This is
// primarily for testing: setting chanSize=0 uncovers deadlocks more
// quickly.
const chanSize = 16

type channelDirection uint8

const (
	channelInbound channelDirection = iota
	channelOutbound
)

type channelOpenMsg struct {
	PeersID       uint32
	PeersWindow   uint32
	MaxPacketSize uint32
}

type channelOpenConfirmMsg struct {
	PeersID       uint32
	MyID          uint32
	MyWindow      uint32
	MaxPacketSize uint32
}

type channelOpenFailureMsg struct {
	PeersID uint32
}

type channelWindowAdjustMsg struct {
	PeersID         uint32
	AdditionalBytes uint32
}

type channelDataMsg struct {
	PeersID uint32
	Length  uint32
	Rest    []byte
}

type channelEOFMsg struct {
	PeersID uint32
}

type channelCloseMsg struct {
	PeersID uint32
}

type Session interface {
	Context() context.Context
	Open() (Channel, error)
	Accept() (Channel, error)
	Close() error
	LocalAddr() net.Addr
	RemoteAddr() net.Addr
	Wait() error
}

// A Channel is an ordered, reliable, flow-controlled, duplex stream
// that is multiplexed over a qmux connection.
type Channel interface {
	Context() context.Context

	// Read reads up to len(data) bytes from the channel.
	Read(data []byte) (int, error)

	// Write writes len(data) bytes to the channel.
	Write(data []byte) (int, error)

	// Close signals end of channel use. No data may be sent after this
	// call.
	Close() error

	// CloseWrite signals the end of sending in-band
	// data. Requests may still be sent, and the other side may
	// still send data
	CloseWrite() error

	ID() uint32
}

type session struct {
	ctx      context.Context
	conn     net.Conn
	chanList chanList

	incomingChannels chan Channel

	errCond *sync.Cond
	err     error
	closeCh chan bool
}

func WithContext(s Session, ctx context.Context) Session {
	ss, ok := s.(*session)
	if !ok {
		return s
	}
	ss.ctx = ctx
	return ss
}

// NewSession returns a session that runs over the given connection.
func NewSession(c net.Conn) Session {
	if c == nil {
		return nil
	}
	s := &session{
		conn:             c,
		incomingChannels: make(chan Channel, chanSize),
		errCond:          sync.NewCond(new(sync.Mutex)),
		closeCh:          make(chan bool, 1),
	}
	go s.loop()
	return s
}

func (s *session) sendMessage(msg interface{}) error {
	b, err := Marshal(msg)
	if err != nil {
		return err
	}
	_, err = s.conn.Write(b)
	return err
}

func (s *session) Context() context.Context {
	return s.ctx
}

func (s *session) Close() error {
	s.conn.Close()
	return nil
}

func (s *session) LocalAddr() net.Addr {
	return s.conn.LocalAddr()
}

func (s *session) RemoteAddr() net.Addr {
	return s.conn.RemoteAddr()
}

func (s *session) Wait() error {
	s.errCond.L.Lock()
	defer s.errCond.L.Unlock()
	for s.err == nil {
		s.errCond.Wait()
	}
	return s.err
}

// loop runs the connection machine. It will process packets until an
// error is encountered. To synchronize on loop exit, use session.Wait.
func (s *session) loop() {
	var err error
	for err == nil {
		err = s.onePacket()
	}

	for _, ch := range s.chanList.dropAll() {
		ch.close()
	}

	s.conn.Close()
	s.closeCh <- true

	s.errCond.L.Lock()
	s.err = err
	s.errCond.Broadcast()
	s.errCond.L.Unlock()
}

func readPacket(c net.Conn) ([]byte, error) {
	sizeMap := map[byte]int{
		msgChannelOpen:         12,
		msgChannelOpenConfirm:  16,
		msgChannelOpenFailure:  4,
		msgChannelWindowAdjust: 8,
		msgChannelData:         8,
		msgChannelEOF:          4,
		msgChannelClose:        4,
	}
	msgNum := make([]byte, 1)
	_, err := c.Read(msgNum)
	if err != nil {
		return nil, err
	}
	rest := make([]byte, sizeMap[msgNum[0]])
	_, err = c.Read(rest)
	if err != nil {
		return nil, err
	}
	packet := append(msgNum, rest...)
	if msgNum[0] == msgChannelData {
		dataSize := binary.BigEndian.Uint32(rest[4:8])
		data := make([]byte, dataSize)
		_, err := c.Read(data)
		if err != nil {
			return nil, err
		}
		packet = append(packet, data...)
	}
	return packet, nil
}

// onePacket reads and processes one packet.
func (s *session) onePacket() error {
	packet, err := readPacket(s.conn)
	if err != nil {
		return err
	}

	switch packet[0] {
	case msgChannelOpen:
		return s.handleChannelOpen(packet)
	}

	// assume a channel packet.
	if len(packet) < 5 {
		return parseError(packet[0])
	}
	id := binary.BigEndian.Uint32(packet[1:])
	ch := s.chanList.getChan(id)
	if ch == nil {
		return fmt.Errorf("qmux: invalid channel %d", id)
	}

	return ch.handlePacket(packet)
}

// handleChannelOpen schedules a channel to be Accept()ed.
func (s *session) handleChannelOpen(packet []byte) error {
	var msg channelOpenMsg
	if err := Unmarshal(packet, &msg); err != nil {
		return err
	}

	if msg.MaxPacketSize < minPacketLength || msg.MaxPacketSize > 1<<31 {
		return s.sendMessage(channelOpenFailureMsg{
			PeersID: msg.PeersID,
		})
	}

	c := s.newChannel(channelInbound)
	c.remoteId = msg.PeersID
	c.maxRemotePayload = msg.MaxPacketSize
	c.remoteWin.add(msg.PeersWindow)
	c.maxIncomingPayload = channelMaxPacket
	s.incomingChannels <- c
	return s.sendMessage(channelOpenConfirmMsg{
		PeersID:       c.remoteId,
		MyID:          c.localId,
		MyWindow:      c.myWindow,
		MaxPacketSize: c.maxIncomingPayload,
	})
}

func (s *session) Accept() (Channel, error) {
	select {
	case ch := <-s.incomingChannels:
		return ch, nil
	case <-s.closeCh:
		return nil, io.EOF
	}
}

func (s *session) Open() (Channel, error) {
	ch := s.newChannel(channelOutbound)

	ch.maxIncomingPayload = channelMaxPacket

	open := channelOpenMsg{
		PeersWindow:   ch.myWindow,
		MaxPacketSize: ch.maxIncomingPayload,
		PeersID:       ch.localId,
	}
	if err := s.sendMessage(open); err != nil {
		return nil, err
	}

	switch msg := (<-ch.msg).(type) {
	case *channelOpenConfirmMsg:
		return ch, nil
	case *channelOpenFailureMsg:
		return nil, fmt.Errorf("qmux: channel open failed on remote side")
	default:
		return nil, fmt.Errorf("qmux: unexpected packet in response to channel open: %T", msg)
	}
}

func (s *session) newChannel(direction channelDirection) *channel {
	ch := &channel{
		ctx:       s.ctx,
		remoteWin: window{Cond: sync.NewCond(new(sync.Mutex))},
		myWindow:  channelWindowSize,
		pending:   newBuffer(),
		direction: direction,
		msg:       make(chan interface{}, chanSize),
		session:   s,
		packetBuf: make([]byte, 0),
	}
	ch.localId = s.chanList.add(ch)
	return ch
}

// channel is an implementation of the Channel interface that works
// with the session class.
type channel struct {
	ctx context.Context

	// R/O after creation
	localId, remoteId uint32

	// maxIncomingPayload and maxRemotePayload are the maximum
	// payload sizes of normal and extended data packets for
	// receiving and sending, respectively. The wire packet will
	// be 9 or 13 bytes larger (excluding encryption overhead).
	maxIncomingPayload uint32
	maxRemotePayload   uint32

	session *session

	// direction contains either channelOutbound, for channels created
	// locally, or channelInbound, for channels created by the peer.
	direction channelDirection

	// Pending internal channel messages.
	msg chan interface{}

	sentEOF bool

	// thread-safe data
	remoteWin window
	pending   *buffer

	// windowMu protects myWindow, the flow-control window.
	windowMu sync.Mutex
	myWindow uint32

	// writeMu serializes calls to session.conn.Write() and
	// protects sentClose and packetPool. This mutex must be
	// different from windowMu, as writePacket can block if there
	// is a key exchange pending.
	writeMu   sync.Mutex
	sentClose bool

	// packet buffer for writing
	packetBuf []byte
}

func (ch *channel) ID() uint32 {
	return ch.localId
}

func (ch *channel) Context() context.Context {
	return ch.ctx
}

// writePacket sends a packet. If the packet is a channel close, it updates
// sentClose. This method takes the lock c.writeMu.
func (ch *channel) writePacket(packet []byte) error {
	ch.writeMu.Lock()
	if ch.sentClose {
		ch.writeMu.Unlock()
		return io.EOF
	}
	ch.sentClose = (packet[0] == msgChannelClose)
	_, err := ch.session.conn.Write(packet)
	ch.writeMu.Unlock()
	return err
}

func (ch *channel) sendMessage(msg interface{}) error {
	p, err := Marshal(msg)
	if err != nil {
		return err
	}
	binary.BigEndian.PutUint32(p[1:], ch.remoteId)
	return ch.writePacket(p)
}

func min(a uint32, b int) uint32 {
	if a < uint32(b) {
		return a
	}
	return uint32(b)
}

// Write writes len(data) bytes to the channel.
func (ch *channel) Write(data []byte) (n int, err error) {
	if ch.sentEOF {
		return 0, io.EOF
	}
	// 1 byte message type, 4 bytes remoteId, 4 bytes data length
	opCode := byte(msgChannelData)
	headerLength := uint32(9)

	ch.writeMu.Lock()
	packet := ch.packetBuf
	ch.writeMu.Unlock()

	for len(data) > 0 {
		space := min(ch.maxRemotePayload, len(data))
		if space, err = ch.remoteWin.reserve(space); err != nil {
			return n, err
		}
		if want := headerLength + space; uint32(cap(packet)) < want {
			packet = make([]byte, want)
		} else {
			packet = packet[:want]
		}

		todo := data[:space]

		packet[0] = opCode
		binary.BigEndian.PutUint32(packet[1:], ch.remoteId)
		binary.BigEndian.PutUint32(packet[headerLength-4:], uint32(len(todo)))
		copy(packet[headerLength:], todo)
		if err = ch.writePacket(packet); err != nil {
			return n, err
		}

		n += len(todo)
		data = data[len(todo):]
	}

	ch.writeMu.Lock()
	ch.packetBuf = packet
	ch.writeMu.Unlock()

	return n, err
}

func (ch *channel) handleData(packet []byte) error {
	headerLen := 9
	if len(packet) < headerLen {
		// malformed data packet
		return parseError(packet[0])
	}

	length := binary.BigEndian.Uint32(packet[headerLen-4 : headerLen])
	if length == 0 {
		return nil
	}
	if length > ch.maxIncomingPayload {
		// TODO(hanwen): should send Disconnect?
		return errors.New("qmux: incoming packet exceeds maximum payload size")
	}

	data := packet[headerLen:]
	if length != uint32(len(data)) {
		return errors.New("qmux: wrong packet length")
	}

	ch.windowMu.Lock()
	if ch.myWindow < length {
		ch.windowMu.Unlock()
		// TODO(hanwen): should send Disconnect with reason?
		return errors.New("qmux: remote side wrote too much")
	}
	ch.myWindow -= length
	ch.windowMu.Unlock()

	ch.pending.write(data)
	return nil
}

func (c *channel) adjustWindow(n uint32) error {
	c.windowMu.Lock()
	// Since myWindow is managed on our side, and can never exceed
	// the initial window setting, we don't worry about overflow.
	c.myWindow += uint32(n)
	c.windowMu.Unlock()
	return c.sendMessage(channelWindowAdjustMsg{
		AdditionalBytes: uint32(n),
	})
}

// Read reads up to len(data) bytes from the channel.
func (c *channel) Read(data []byte) (n int, err error) {
	n, err = c.pending.Read(data)

	if n > 0 {
		err = c.adjustWindow(uint32(n))
		// sendWindowAdjust can return io.EOF if the remote
		// peer has closed the connection, however we want to
		// defer forwarding io.EOF to the caller of Read until
		// the buffer has been drained.
		if n > 0 && err == io.EOF {
			err = nil
		}
	}
	return n, err
}

func (c *channel) close() {
	c.pending.eof()
	close(c.msg)
	c.writeMu.Lock()
	// This is not necessary for a normal channel teardown, but if
	// there was another error, it is.
	c.sentClose = true
	c.writeMu.Unlock()
	// Unblock writers.
	c.remoteWin.close()
}

// responseMessageReceived is called when a success or failure message is
// received on a channel to check that such a message is reasonable for the
// given channel.
func (ch *channel) responseMessageReceived() error {
	if ch.direction == channelInbound {
		return errors.New("qmux: channel response message received on inbound channel")
	}
	return nil
}

func (ch *channel) handlePacket(packet []byte) error {
	switch packet[0] {
	case msgChannelData:
		return ch.handleData(packet)
	case msgChannelClose:
		ch.sendMessage(channelCloseMsg{PeersID: ch.remoteId})
		ch.session.chanList.remove(ch.localId)
		ch.close()
		return nil
	case msgChannelEOF:
		ch.pending.eof()
		return nil
	}

	decoded, err := decode(packet)
	if err != nil {
		return err
	}

	switch msg := decoded.(type) {
	case *channelOpenFailureMsg:
		if err := ch.responseMessageReceived(); err != nil {
			return err
		}
		ch.session.chanList.remove(msg.PeersID)
		ch.msg <- msg
	case *channelOpenConfirmMsg:
		if err := ch.responseMessageReceived(); err != nil {
			return err
		}
		if msg.MaxPacketSize < minPacketLength || msg.MaxPacketSize > 1<<31 {
			return fmt.Errorf("qmux: invalid MaxPacketSize %d from peer", msg.MaxPacketSize)
		}
		ch.remoteId = msg.MyID
		ch.maxRemotePayload = msg.MaxPacketSize
		ch.remoteWin.add(msg.MyWindow)
		ch.msg <- msg
	case *channelWindowAdjustMsg:
		if !ch.remoteWin.add(msg.AdditionalBytes) {
			return fmt.Errorf("qmux: invalid window update for %d bytes", msg.AdditionalBytes)
		}
	default:
		ch.msg <- msg
	}
	return nil
}

func (ch *channel) CloseWrite() error {
	ch.sentEOF = true
	return ch.sendMessage(channelEOFMsg{
		PeersID: ch.remoteId})
}

func (ch *channel) Close() error {
	return ch.sendMessage(channelCloseMsg{
		PeersID: ch.remoteId})
}

// chanList is a thread safe channel list.
type chanList struct {
	// protects concurrent access to chans
	sync.Mutex

	// chans are indexed by the local id of the channel, which the
	// other side should send in the PeersId field.
	chans []*channel
}

// Assigns a channel ID to the given channel.
func (c *chanList) add(ch *channel) uint32 {
	c.Lock()
	defer c.Unlock()
	for i := range c.chans {
		if c.chans[i] == nil {
			c.chans[i] = ch
			return uint32(i)
		}
	}
	c.chans = append(c.chans, ch)
	return uint32(len(c.chans) - 1)
}

// getChan returns the channel for the given ID.
func (c *chanList) getChan(id uint32) *channel {
	c.Lock()
	defer c.Unlock()
	if id < uint32(len(c.chans)) {
		return c.chans[id]
	}
	return nil
}

func (c *chanList) remove(id uint32) {
	c.Lock()
	if id < uint32(len(c.chans)) {
		c.chans[id] = nil
	}
	c.Unlock()
}

// dropAll forgets all channels it knows, returning them in a slice.
func (c *chanList) dropAll() []*channel {
	c.Lock()
	defer c.Unlock()
	var r []*channel

	for _, ch := range c.chans {
		if ch == nil {
			continue
		}
		r = append(r, ch)
	}
	c.chans = nil
	return r
}

// buffer provides a linked list buffer for data exchange
// between producer and consumer. Theoretically the buffer is
// of unlimited capacity as it does no allocation of its own.
type buffer struct {
	// protects concurrent access to head, tail and closed
	*sync.Cond

	head *element // the buffer that will be read first
	tail *element // the buffer that will be read last

	closed bool
}

// An element represents a single link in a linked list.
type element struct {
	buf  []byte
	next *element
}

// newBuffer returns an empty buffer that is not closed.
func newBuffer() *buffer {
	e := new(element)
	b := &buffer{
		Cond: sync.NewCond(new(sync.Mutex)),
		head: e,
		tail: e,
	}
	return b
}

// write makes buf available for Read to receive.
// buf must not be modified after the call to write.
func (b *buffer) write(buf []byte) {
	b.Cond.L.Lock()
	e := &element{buf: buf}
	b.tail.next = e
	b.tail = e
	b.Cond.Signal()
	b.Cond.L.Unlock()
}

// eof closes the buffer. Reads from the buffer once all
// the data has been consumed will receive io.EOF.
func (b *buffer) eof() {
	b.Cond.L.Lock()
	b.closed = true
	b.Cond.Signal()
	b.Cond.L.Unlock()
}

// Read reads data from the internal buffer in buf.  Reads will block
// if no data is available, or until the buffer is closed.
func (b *buffer) Read(buf []byte) (n int, err error) {
	b.Cond.L.Lock()
	defer b.Cond.L.Unlock()

	for len(buf) > 0 {
		// if there is data in b.head, copy it
		if len(b.head.buf) > 0 {
			r := copy(buf, b.head.buf)
			buf, b.head.buf = buf[r:], b.head.buf[r:]
			n += r
			continue
		}
		// if there is a next buffer, make it the head
		if len(b.head.buf) == 0 && b.head != b.tail {
			b.head = b.head.next
			continue
		}

		// if at least one byte has been copied, return
		if n > 0 {
			break
		}

		// if nothing was read, and there is nothing outstanding
		// check to see if the buffer is closed.
		if b.closed {
			err = io.EOF
			break
		}
		// out of buffers, wait for producer
		b.Cond.Wait()
	}
	return
}

// window represents the buffer available to clients
// wishing to write to a channel.
type window struct {
	*sync.Cond
	win          uint32 // RFC 4254 5.2 says the window size can grow to 2^32-1
	writeWaiters int
	closed       bool
}

// add adds win to the amount of window available
// for consumers.
func (w *window) add(win uint32) bool {
	// a zero sized window adjust is a noop.
	if win == 0 {
		return true
	}
	w.L.Lock()
	if w.win+win < win {
		w.L.Unlock()
		return false
	}
	w.win += win
	// It is unusual that multiple goroutines would be attempting to reserve
	// window space, but not guaranteed. Use broadcast to notify all waiters
	// that additional window is available.
	w.Broadcast()
	w.L.Unlock()
	return true
}

// close sets the window to closed, so all reservations fail
// immediately.
func (w *window) close() {
	w.L.Lock()
	w.closed = true
	w.Broadcast()
	w.L.Unlock()
}

// reserve reserves win from the available window capacity.
// If no capacity remains, reserve will block. reserve may
// return less than requested.
func (w *window) reserve(win uint32) (uint32, error) {
	var err error
	w.L.Lock()
	w.writeWaiters++
	w.Broadcast()
	for w.win == 0 && !w.closed {
		w.Wait()
	}
	w.writeWaiters--
	if w.win < win {
		win = w.win
	}
	w.win -= win
	if w.closed {
		err = io.EOF
	}
	w.L.Unlock()
	return win, err
}

// waitWriterBlocked waits until some goroutine is blocked for further
// writes. It is used in tests only.
func (w *window) waitWriterBlocked() {
	w.Cond.L.Lock()
	for w.writeWaiters == 0 {
		w.Cond.Wait()
	}
	w.Cond.L.Unlock()
}

func parseError(tag uint8) error {
	return fmt.Errorf("qmux: parse error in message type %d", tag)
}

// unexpectedMessageError results when the SSH message that we received didn't
// match what we wanted.
func unexpectedMessageError(expected, got uint8) error {
	return fmt.Errorf("qmux: unexpected message type %d (expected %d)", got, expected)
}

// Decode a packet into its corresponding message.
func decode(packet []byte) (interface{}, error) {
	var msg interface{}
	switch packet[0] {
	case msgChannelOpen:
		msg = new(channelOpenMsg)
	case msgChannelData:
		msg = new(channelDataMsg)
	case msgChannelOpenConfirm:
		msg = new(channelOpenConfirmMsg)
	case msgChannelOpenFailure:
		msg = new(channelOpenFailureMsg)
	case msgChannelWindowAdjust:
		msg = new(channelWindowAdjustMsg)
	case msgChannelEOF:
		msg = new(channelEOFMsg)
	case msgChannelClose:
		msg = new(channelCloseMsg)
	default:
		return nil, unexpectedMessageError(0, packet[0])
	}
	if err := Unmarshal(packet, msg); err != nil {
		return nil, err
	}
	return msg, nil
}

func Marshal(v interface{}) ([]byte, error) {
	switch msg := v.(type) {
	case channelOpenMsg:
		packet := make([]byte, 13)
		packet[0] = msgChannelOpen
		binary.BigEndian.PutUint32(packet[1:5], msg.PeersID)
		binary.BigEndian.PutUint32(packet[5:9], msg.PeersWindow)
		binary.BigEndian.PutUint32(packet[9:13], msg.MaxPacketSize)
		return packet, nil
	case channelOpenConfirmMsg:
		packet := make([]byte, 17)
		packet[0] = msgChannelOpenConfirm
		binary.BigEndian.PutUint32(packet[1:5], msg.PeersID)
		binary.BigEndian.PutUint32(packet[5:9], msg.MyID)
		binary.BigEndian.PutUint32(packet[9:13], msg.MyWindow)
		binary.BigEndian.PutUint32(packet[13:17], msg.MaxPacketSize)
		return packet, nil
	case channelOpenFailureMsg:
		packet := make([]byte, 5)
		packet[0] = msgChannelOpenFailure
		binary.BigEndian.PutUint32(packet[1:5], msg.PeersID)
		return packet, nil
	case channelWindowAdjustMsg:
		packet := make([]byte, 9)
		packet[0] = msgChannelWindowAdjust
		binary.BigEndian.PutUint32(packet[1:5], msg.PeersID)
		binary.BigEndian.PutUint32(packet[5:9], msg.AdditionalBytes)
		return packet, nil
	case channelDataMsg:
		packet := make([]byte, 9)
		packet[0] = msgChannelData
		binary.BigEndian.PutUint32(packet[1:5], msg.PeersID)
		binary.BigEndian.PutUint32(packet[5:9], msg.Length)
		return append(packet, msg.Rest...), nil
	case channelEOFMsg:
		packet := make([]byte, 5)
		packet[0] = msgChannelEOF
		binary.BigEndian.PutUint32(packet[1:5], msg.PeersID)
		return packet, nil
	case channelCloseMsg:
		packet := make([]byte, 5)
		packet[0] = msgChannelClose
		binary.BigEndian.PutUint32(packet[1:5], msg.PeersID)
		return packet, nil
	default:
		return []byte{}, fmt.Errorf("qmux: unable to marshal type")
	}
}

func Unmarshal(b []byte, v interface{}) error {
	switch msg := v.(type) {
	case *channelOpenMsg:
		msg.PeersID = binary.BigEndian.Uint32(b[1:5])
		msg.PeersWindow = binary.BigEndian.Uint32(b[5:9])
		msg.MaxPacketSize = binary.BigEndian.Uint32(b[9:13])
		return nil
	case *channelOpenConfirmMsg:
		msg.PeersID = binary.BigEndian.Uint32(b[1:5])
		msg.MyID = binary.BigEndian.Uint32(b[5:9])
		msg.MyWindow = binary.BigEndian.Uint32(b[9:13])
		msg.MaxPacketSize = binary.BigEndian.Uint32(b[13:17])
		return nil
	case *channelOpenFailureMsg:
		msg.PeersID = binary.BigEndian.Uint32(b[1:5])
		return nil
	case *channelWindowAdjustMsg:
		msg.PeersID = binary.BigEndian.Uint32(b[1:5])
		msg.AdditionalBytes = binary.BigEndian.Uint32(b[5:9])
		return nil
	case *channelDataMsg:
		msg.PeersID = binary.BigEndian.Uint32(b[1:5])
		msg.Length = binary.BigEndian.Uint32(b[5:9])
		msg.Rest = b[9:msg.Length]
		return nil
	case *channelEOFMsg:
		msg.PeersID = binary.BigEndian.Uint32(b[1:5])
		return nil
	case *channelCloseMsg:
		msg.PeersID = binary.BigEndian.Uint32(b[1:5])
		return nil
	default:
		return fmt.Errorf("qmux: type not supported for value %#v", v)
	}
}
