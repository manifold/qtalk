package rpc

import "github.com/manifold/qtalk/golang/mux"

type Peer struct {
	mux.Session

	caller    Caller
	responder *RespondMux
}

func NewPeer(session mux.Session, codec Codec) *Peer {
	return &Peer{
		Session: session,
		caller: &caller{
			session: session,
			codec:   codec,
		},
		responder: NewRespondMux(codec),
	}
}

func (p *Peer) Respond() {
	srv := &Server{Mux: p.responder}
	srv.Respond(p.Session)
}

func (p *Peer) Call(path string, args, reply interface{}) (*Response, error) {
	return p.caller.Call(path, args, reply)
}

func (p *Peer) Bind(path string, v interface{}) {
	p.responder.Bind(path, v)
}
