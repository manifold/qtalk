package mux

import (
	"context"
	"net"

	"github.com/manifold/qtalk/golang/mux/qmux"
)

func DialTCP(addr string) (Session, error) {
	return dialNet("tcp", addr)
}

func ListenTCP(addr string) (Listener, error) {
	return listenNet("tcp", addr)
}

func DialUnix(addr string) (Session, error) {
	return dialNet("unix", addr)
}

func ListenUnix(addr string) (Listener, error) {
	return listenNet("unix", addr)
}

func dialNet(proto, addr string) (Session, error) {
	conn, err := net.Dial(proto, addr)
	return &qmuxSession{
		Session: qmux.NewSession(conn),
		ctx:     context.Background(),
	}, err
}

func listenNet(proto, addr string) (Listener, error) {
	listener, err := net.Listen(proto, addr)
	return &qmuxListener{Listener: listener}, err
}
