package mux

import (
	"context"
	"net"

	qmux "github.com/manifold/qtalk/qmux/go"
)

func DialTCP(addr string) (Session, error) {
	return DialNet("tcp", addr)
}

func ListenTCP(addr string) (Listener, error) {
	return ListenNet("tcp", addr)
}

func DialUnix(addr string) (Session, error) {
	return DialNet("unix", addr)
}

func ListenUnix(addr string) (Listener, error) {
	return ListenNet("unix", addr)
}

func DialNet(proto, addr string) (Session, error) {
	conn, err := net.Dial(proto, addr)
	return &qmuxSession{
		Session: qmux.NewSession(conn),
		ctx:     context.Background(),
	}, err
}

func ListenNet(proto, addr string) (Listener, error) {
	listener, err := net.Listen(proto, addr)
	return &qmuxListener{Listener: listener}, err
}
