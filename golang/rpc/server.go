package rpc

import (
	"io"

	"github.com/manifold/qtalk/golang/mux"
)

type Server struct {
	Mux *RespondMux
}

func (s *Server) handleSession(sess mux.Session) {
	for {
		ch, err := sess.Accept()
		if err != nil {
			if err == io.EOF {
				return
			}
			panic(err)
		}
		go Respond(sess, ch, s.Mux)
	}
}

func (s *Server) Serve(l mux.Listener) error {
	for {
		sess, err := l.Accept()
		if err != nil {
			return err
		}
		go s.handleSession(sess)
	}
}
