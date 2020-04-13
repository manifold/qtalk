package mux

import (
	"context"
	"io"
	"net"

	"github.com/manifold/qtalk/golang/mux/qmux"
)

type Session interface {
	Context() context.Context
	Close() error
	Open() (Channel, error)
	Accept() (Channel, error)
	LocalAddr() net.Addr
	RemoteAddr() net.Addr
	Wait() error
}

type Channel interface {
	ID() uint32
	Context() context.Context
	CloseWrite() error

	io.Reader
	io.Writer
	io.Closer
}

type Listener interface {
	Close() error
	Addr() net.Addr
	Accept() (Session, error)
}

func NewSession(conn net.Conn, ctx context.Context) Session {
	if ctx == nil {
		ctx = context.Background()
	}
	return &qmuxSession{
		Session: qmux.WithContext(qmux.NewSession(conn), ctx),
		ctx:     ctx,
	}
}
