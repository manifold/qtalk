package codec

import (
	"fmt"
	"testing"
)

func TestMessage(t *testing.T) {
	msg := DataMessage{
		ChannelID: 10,
		Length:    100,
		Data:      []byte("He"),
	}
	fmt.Println(*msg.Channel())
}
