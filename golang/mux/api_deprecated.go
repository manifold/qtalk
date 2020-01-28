package mux

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"

	"github.com/manifold/qtalk/golang/mux/qmux"
	"golang.org/x/net/websocket"
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

func DialWebsocket(addr string) (Session, error) {
	ws, err := websocket.Dial(fmt.Sprintf("ws://%s/", addr), "", fmt.Sprintf("http://%s/", addr))
	if err != nil {
		return nil, err
	}
	ws.PayloadType = websocket.BinaryFrame
	return &qmuxSession{
		Session: qmux.NewSession(ws),
		ctx:     context.Background(),
	}, nil
}

func ListenWebsocket(addr string) (Listener, error) {
	sessCh := make(chan qmux.Session)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	s := &http.Server{
		Addr: addr,
		Handler: websocket.Handler(func(ws *websocket.Conn) {
			ws.PayloadType = websocket.BinaryFrame
			sess := qmux.NewSession(ws)
			sessCh <- sess
			sess.Wait()
		}),
	}
	go s.Serve(listener)
	return &websocketListener{
		Listener: listener,
		sessCh:   sessCh,
	}, err
}

type websocketListener struct {
	net.Listener
	sessCh  chan qmux.Session
	closeCh chan bool
}

func (l *websocketListener) Accept() (Session, error) {
	if l.closeCh == nil {
		l.closeCh = make(chan bool, 1)
	}
	select {
	case <-l.closeCh:
		return nil, io.EOF
	case sess := <-l.sessCh:
		return &qmuxSession{
			Session: sess,
			ctx:     context.Background(),
		}, nil
	}
}

func (l *websocketListener) Close() error {
	if l.closeCh != nil {
		l.closeCh <- true
	}
	return l.Listener.Close()
}
