package mux

import (
	"context"
	"net"
	"sync"

	"golang.org/x/crypto/ssh"
)

func DialSSH(addr string, config *ssh.ClientConfig) (Session, error) {
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, err
	}
	chans := client.HandleChannelOpen("")
	return &sshSession{
		Conn:  client,
		chans: chans,
		ctx:   context.Background(),
	}, err
}

func ListenSSH(addr string, config *ssh.ServerConfig) (Listener, error) {
	listener, err := net.Listen("tcp", addr)
	return &sshListener{listener, config}, err
}

type sshSession struct {
	ssh.Conn
	chans   <-chan ssh.NewChannel
	counter uint64
	ctx     context.Context
	mu      sync.Mutex
}

func (s *sshSession) Context() context.Context {
	return s.ctx
}

func (s *sshSession) Close() error {
	return s.Conn.Close()
}

func (s *sshSession) Open() (Channel, error) {
	ch, reqs, err := s.Conn.OpenChannel("", []byte{})
	if err != nil {
		return nil, err
	}
	go ssh.DiscardRequests(reqs)
	s.mu.Lock()
	s.counter += 1
	s.mu.Unlock()
	return &sshChannel{ch, s.counter, s.ctx}, err
}

func (s *sshSession) Accept() (Channel, error) {
	ch, reqs, err := (<-s.chans).Accept()
	if err != nil {
		return nil, err
	}
	go ssh.DiscardRequests(reqs)
	s.mu.Lock()
	s.counter += 1
	s.mu.Unlock()
	return &sshChannel{ch, s.counter, s.ctx}, err
}

type sshChannel struct {
	ssh.Channel

	id  uint64
	ctx context.Context
}

func (c *sshChannel) Context() context.Context {
	return c.ctx
}

func (c *sshChannel) ID() uint64 {
	return c.id
}

type sshListener struct {
	net.Listener
	config *ssh.ServerConfig
}

func (l *sshListener) Accept() (Session, error) {
	rawconn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	conn, chans, reqs, err := ssh.NewServerConn(rawconn, l.config)
	if err != nil {
		return nil, err
	}
	go ssh.DiscardRequests(reqs)
	return &sshSession{
		Conn:  conn.Conn,
		chans: chans,
		ctx:   context.Background(),
	}, err
}
