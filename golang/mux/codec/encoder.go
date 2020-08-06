package codec

import (
	"encoding/binary"
	"fmt"
	"io"
	"sync"
)

type Encoder struct {
	w io.Writer
	sync.Mutex
}

func NewEncoder(w io.Writer) *Encoder {
	return &Encoder{w: w}
}

func (enc *Encoder) Encode(msg interface{}) error {
	enc.Lock()
	defer enc.Unlock()

	// fmt.Println("<<", msg)

	b, err := Marshal(msg)
	if err != nil {
		return err
	}

	_, err = enc.w.Write(b)
	return err
}

func Marshal(v interface{}) ([]byte, error) {
	switch msg := v.(type) {
	case OpenMessage:
		packet := make([]byte, payloadSizes[msgChannelOpen]+1)
		packet[0] = msgChannelOpen
		binary.BigEndian.PutUint32(packet[1:5], msg.SenderID)
		binary.BigEndian.PutUint32(packet[5:9], msg.WindowSize)
		binary.BigEndian.PutUint32(packet[9:13], msg.MaxPacketSize)
		return packet, nil

	case OpenConfirmMessage:
		packet := make([]byte, payloadSizes[msgChannelOpenConfirm]+1)
		packet[0] = msgChannelOpenConfirm
		binary.BigEndian.PutUint32(packet[1:5], msg.ChannelID)
		binary.BigEndian.PutUint32(packet[5:9], msg.SenderID)
		binary.BigEndian.PutUint32(packet[9:13], msg.WindowSize)
		binary.BigEndian.PutUint32(packet[13:17], msg.MaxPacketSize)
		return packet, nil

	case OpenFailureMessage:
		packet := make([]byte, payloadSizes[msgChannelOpenFailure]+1)
		packet[0] = msgChannelOpenFailure
		binary.BigEndian.PutUint32(packet[1:5], msg.ChannelID)
		return packet, nil

	case WindowAdjustMessage:
		packet := make([]byte, payloadSizes[msgChannelWindowAdjust]+1)
		packet[0] = msgChannelWindowAdjust
		binary.BigEndian.PutUint32(packet[1:5], msg.ChannelID)
		binary.BigEndian.PutUint32(packet[5:9], msg.AdditionalBytes)
		return packet, nil

	case DataMessage:
		packet := make([]byte, payloadSizes[msgChannelData]+1)
		packet[0] = msgChannelData
		binary.BigEndian.PutUint32(packet[1:5], msg.ChannelID)
		binary.BigEndian.PutUint32(packet[5:9], msg.Length)
		return append(packet, msg.Data...), nil

	case EOFMessage:
		packet := make([]byte, payloadSizes[msgChannelEOF]+1)
		packet[0] = msgChannelEOF
		binary.BigEndian.PutUint32(packet[1:5], msg.ChannelID)
		return packet, nil

	case CloseMessage:
		packet := make([]byte, payloadSizes[msgChannelClose]+1)
		packet[0] = msgChannelClose
		binary.BigEndian.PutUint32(packet[1:5], msg.ChannelID)
		return packet, nil

	default:
		return []byte{}, fmt.Errorf("qmux: unable to marshal type")
	}
}
