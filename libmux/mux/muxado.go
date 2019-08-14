package mux

import (
	"context"
	"net"

	"github.com/inconshreveable/muxado"
)

func DialMuxado(addr string, config *muxado.Config) (Session, error) {
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return nil, err
	}
	return &muxadoSession{muxado.Client(conn, config), context.Background()}, err
}

func ListenMuxado(addr string, config *muxado.Config) (Listener, error) {
	listener, err := net.Listen("tcp", addr)
	return &muxadoListener{listener, config}, err
}

type muxadoSession struct {
	muxado.Session
	ctx context.Context
}

func (s *muxadoSession) Context() context.Context {
	return s.ctx
}

func (s *muxadoSession) Close() error {
	return s.Session.Close()
}

func (s *muxadoSession) Open() (Channel, error) {
	stream, err := s.Session.Open()
	return &muxadoChannel{stream.(muxado.Stream), s.ctx}, err
}

func (s *muxadoSession) Accept() (Channel, error) {
	stream, err := s.Session.Accept()
	return &muxadoChannel{stream.(muxado.Stream), s.ctx}, err
}

type muxadoChannel struct {
	muxado.Stream
	ctx context.Context
}

func (c *muxadoChannel) Context() context.Context {
	return c.ctx
}

func (c *muxadoChannel) ID() uint64 {
	return uint64(c.Id())
}

type muxadoListener struct {
	net.Listener
	config *muxado.Config
}

func (l *muxadoListener) Accept() (Session, error) {
	conn, err := l.Listener.Accept()
	return &muxadoSession{muxado.Server(conn, l.config), context.Background()}, err
}
