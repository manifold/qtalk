package transport

import (
	"context"
	"io"
	"net"
	"net/http"

	"github.com/manifold/qtalk/golang/mux"
	"golang.org/x/net/websocket"
)

func ListenTCP(addr string) (mux.Listener, error) {
	return listenNet("tcp", addr)
}

func ListenUnix(addr string) (mux.Listener, error) {
	return listenNet("unix", addr)
}

func listenNet(proto, addr string) (mux.Listener, error) {
	l, err := net.Listen(proto, addr)
	if err != nil {
		return nil, err
	}
	closer := make(chan bool, 1)
	errs := make(chan error, 1)
	accepted := make(chan mux.Session)
	go func(l net.Listener) {
		for {
			conn, err := l.Accept()
			if err != nil {
				errs <- err
				return
			}
			accepted <- mux.NewSession(context.Background(), conn)
		}
	}(l)
	return &listener{
		Listener: l,
		errs:     errs,
		accepted: accepted,
		closer:   closer,
	}, nil
}

func ListenWS(addr string) (mux.Listener, error) {
	l, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	closer := make(chan bool, 1)
	errs := make(chan error, 1)
	accepted := make(chan mux.Session)
	s := &http.Server{
		Addr: addr,
		Handler: websocket.Handler(func(ws *websocket.Conn) {
			ws.PayloadType = websocket.BinaryFrame
			sess := mux.NewSession(context.Background(), ws)
			accepted <- sess
			sess.Wait()
		}),
	}
	go s.Serve(l)
	return &listener{
		Listener: l,
		errs:     errs,
		accepted: accepted,
		closer:   closer,
	}, nil
}

type listener struct {
	net.Listener
	accepted chan mux.Session
	closer   chan bool
	errs     chan error
}

func (l *listener) Accept() (mux.Session, error) {
	// TODO: context cancelation
	select {
	case <-l.closer:
		return nil, io.EOF
	case err := <-l.errs:
		return nil, err
	case sess := <-l.accepted:
		return sess, nil
	}
}

func (l *listener) Addr() net.Addr {
	return l.Addr()
}

func (l *listener) Close() error {
	if l.closer != nil {
		l.closer <- true
	}
	return l.Listener.Close()
}
