package codec

import "fmt"

const (
	msgChannelOpen = iota + 100
	msgChannelOpenConfirm
	msgChannelOpenFailure
	msgChannelWindowAdjust
	msgChannelData
	msgChannelEOF
	msgChannelClose
)

var (
	payloadSizes = map[byte]int{
		msgChannelOpen:         12,
		msgChannelOpenConfirm:  16,
		msgChannelOpenFailure:  4,
		msgChannelWindowAdjust: 8,
		msgChannelData:         8,
		msgChannelEOF:          4,
		msgChannelClose:        4,
	}
)

type Message interface {
	Channel() (uint32, bool)
}

type OpenMessage struct {
	SenderID      uint32
	WindowSize    uint32
	MaxPacketSize uint32
}

func (msg OpenMessage) String() string {
	return fmt.Sprintf("{OpenMessage SenderID:%d WindowSize:%d MaxPacketSize:%d}",
		msg.SenderID, msg.WindowSize, msg.MaxPacketSize)
}

func (msg OpenMessage) Channel() (uint32, bool) {
	return 0, false
}

type OpenConfirmMessage struct {
	ChannelID     uint32
	SenderID      uint32
	WindowSize    uint32
	MaxPacketSize uint32
}

func (msg OpenConfirmMessage) String() string {
	return fmt.Sprintf("{OpenConfirmMessage ChannelID:%d SenderID:%d WindowSize:%d MaxPacketSize:%d}",
		msg.ChannelID, msg.SenderID, msg.WindowSize, msg.MaxPacketSize)
}

func (msg OpenConfirmMessage) Channel() (uint32, bool) {
	return msg.ChannelID, true
}

type OpenFailureMessage struct {
	ChannelID uint32
}

func (msg OpenFailureMessage) String() string {
	return fmt.Sprintf("{OpenFailureMessage ChannelID:%d}", msg.ChannelID)
}

func (msg OpenFailureMessage) Channel() (uint32, bool) {
	return msg.ChannelID, true
}

type WindowAdjustMessage struct {
	ChannelID       uint32
	AdditionalBytes uint32
}

func (msg WindowAdjustMessage) String() string {
	return fmt.Sprintf("{WindowAdjustMessage ChannelID:%d AdditionalBytes:%d}",
		msg.ChannelID, msg.AdditionalBytes)
}

func (msg WindowAdjustMessage) Channel() (uint32, bool) {
	return msg.ChannelID, true
}

type DataMessage struct {
	ChannelID uint32
	Length    uint32
	Data      []byte
}

func (msg DataMessage) String() string {
	return fmt.Sprintf("{DataMessage ChannelID:%d Length:%d Data: ... }",
		msg.ChannelID, msg.Length)
}

func (msg DataMessage) Channel() (uint32, bool) {
	return msg.ChannelID, true
}

type EOFMessage struct {
	ChannelID uint32
}

func (msg EOFMessage) String() string {
	return fmt.Sprintf("{EOFMessage ChannelID:%d}", msg.ChannelID)
}

func (msg EOFMessage) Channel() (uint32, bool) {
	return msg.ChannelID, true
}

type CloseMessage struct {
	ChannelID uint32
}

func (msg CloseMessage) String() string {
	return fmt.Sprintf("{CloseMessage ChannelID:%d}", msg.ChannelID)
}

func (msg CloseMessage) Channel() (uint32, bool) {
	return msg.ChannelID, true
}
