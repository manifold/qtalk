package mux

import (
	"context"
	"net"

	"github.com/manifold/qtalk/qmux/go"
)

func DialTCP(addr string) (Session, error) {
	conn, err := net.Dial("tcp", addr)
	return &qmuxSession{
		Session: qmux.NewSession(conn),
		ctx:     context.Background(),
	}, err
}

func ListenTCP(addr string) (Listener, error) {
	listener, err := net.Listen("tcp", addr)
	return &qmuxListener{Listener: listener}, err
}
