package mux

import (
	"context"
	"io"
	"net"

	"github.com/manifold/qtalk/golang/mux/qmux"
)

type qmuxSession struct {
	qmux.Session

	ctx context.Context
}

func (s *qmuxSession) Context() context.Context {
	return s.ctx
}

func (s *qmuxSession) Open() (Channel, error) {
	ch, err := s.Session.Open()
	return &qmuxChannel{
		Channel: ch,
		ctx:     s.ctx,
	}, err
}

func (s *qmuxSession) Accept() (Channel, error) {
	ch, err := s.Session.Accept()
	return &qmuxChannel{
		Channel: ch,
		ctx:     s.ctx,
	}, err
}

type qmuxChannel struct {
	qmux.Channel
	ctx context.Context
}

func (c *qmuxChannel) Context() context.Context {
	return c.ctx
}

func (c *qmuxChannel) ID() uint64 {
	return uint64(c.ID())
}

type qmuxListener struct {
	net.Listener
	closeCh chan bool
}

func (l *qmuxListener) Accept() (Session, error) {
	if l.closeCh == nil {
		l.closeCh = make(chan bool, 1)
	}
	conn, err := l.Listener.Accept()
	if err != nil {
		select {
		case <-l.closeCh:
			return nil, io.EOF
		default:
		}
		return nil, err
	}
	return &qmuxSession{
		Session: qmux.NewSession(conn),
		ctx:     context.Background(),
	}, err
}

func (l *qmuxListener) Close() error {
	if l.closeCh != nil {
		l.closeCh <- true
	}
	return l.Listener.Close()
}
