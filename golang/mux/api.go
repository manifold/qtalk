package mux

import (
	"context"
	"io"
	"net"
)

type Session interface {
	Context() context.Context
	Close() error
	Open() (Channel, error)
	Accept() (Channel, error)
	LocalAddr() net.Addr
	RemoteAddr() net.Addr
}

type Channel interface {
	ID() uint64
	Context() context.Context
	io.Reader
	io.Writer
	io.Closer

	// TODO? CloseWrite() error
}

type Listener interface {
	Close() error
	Addr() net.Addr
	Accept() (Session, error)
}