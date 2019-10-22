package mux

import (
	"context"
	"crypto/tls"

	quic "github.com/lucas-clemente/quic-go"
)

func DialQuic(addr string, tlsConf *tls.Config, config *quic.Config) (Session, error) {
	sess, err := quic.DialAddr(addr, tlsConf, config)
	return &quicSession{sess}, err
}

func ListenQuic(addr string, tlsConf *tls.Config, config *quic.Config) (Listener, error) {
	listener, err := quic.ListenAddr(addr, tlsConf, config)
	return &quicListener{listener}, err
}

type quicSession struct {
	quic.Session
}

func (s *quicSession) Close() error {
	return s.Session.Close()
}

func (s *quicSession) Open() (Channel, error) {
	stream, err := s.OpenStreamSync(context.Background())
	return &quicChannel{stream}, err
}

func (s *quicSession) Accept() (Channel, error) {
	stream, err := s.AcceptStream(context.Background())
	return &quicChannel{stream}, err
}

type quicChannel struct {
	quic.Stream
}

func (c *quicChannel) ID() uint64 {
	return uint64(c.StreamID())
}

type quicListener struct {
	quic.Listener
}

func (l *quicListener) Accept() (Session, error) {
	sess, err := l.Listener.Accept(context.Background())
	return &quicSession{sess}, err
}
