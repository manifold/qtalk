package transport

import (
	"context"
	"fmt"
	"net"

	"github.com/manifold/qtalk/golang/mux"
	"golang.org/x/net/websocket"
)

func DialTCP(addr string) (mux.Session, error) {
	return dialNet("tcp", addr)
}

func DialUnix(addr string) (mux.Session, error) {
	return dialNet("unix", addr)
}

func dialNet(proto, addr string) (mux.Session, error) {
	conn, err := net.Dial(proto, addr)
	if err != nil {
		return nil, err
	}
	return mux.NewSession(context.Background(), conn), nil
}

func DialWS(addr string) (mux.Session, error) {
	ws, err := websocket.Dial(fmt.Sprintf("ws://%s/", addr), "", fmt.Sprintf("http://%s/", addr))
	if err != nil {
		return nil, err
	}
	ws.PayloadType = websocket.BinaryFrame
	return mux.NewSession(context.Background(), ws), nil
}
