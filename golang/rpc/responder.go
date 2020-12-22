package rpc

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/manifold/qtalk/golang/mux"
	"golang.org/x/net/websocket"
)

type Handler interface {
	RespondRPC(Responder, *Call)
}

type HandlerFunc func(Responder, *Call)

func (f HandlerFunc) RespondRPC(resp Responder, call *Call) {
	f(resp, call)
}

type Responder interface {
	Header() *ResponseHeader
	Return(interface{}) error
	Hijack(interface{}) (mux.Channel, error)
}

type ResponseHeader struct {
	Error    *string
	Hijacked bool // after parsing response, keep stream open for whatever protocol
}

func Respond(sess mux.Session, ch mux.Channel, mux *RespondMux) {
	defer ch.Close()

	codec := &frameCodec{mux.codec}
	dec := codec.Decoder(ch)

	var call Call
	err := dec.Decode(&call)
	if err != nil {
		log.Println("rpc.Respond:", err)
		return
	}

	err = call.Parse()
	if err != nil {
		log.Println("rpc.Respond:", err)
		return
	}

	call.Context = ch.Context()
	call.Decoder = dec
	call.Caller = &caller{
		session: sess,
		codec:   mux.codec,
	}

	header := &ResponseHeader{}
	resp := &responder{
		ch:     ch,
		c:      codec,
		header: header,
	}

	handler := mux.Handler(call.Destination)
	if handler == nil {
		resp.Return(fmt.Errorf("handler does not exist for this destination: %s", call.Destination))
		return
	}

	handler.RespondRPC(resp, &call)
}

type responder struct {
	ch     mux.Channel
	header *ResponseHeader
	c      Codec
}

func (r *responder) Header() *ResponseHeader {
	return r.header
}

func (r *responder) Return(v interface{}) error {
	enc := r.c.Encoder(r.ch)
	var e error
	var ok bool
	if e, ok = v.(error); ok {
		v = nil
	}
	if e != nil {
		var errStr = e.Error()
		r.header.Error = &errStr
	}
	err := enc.Encode(r.header)
	if err != nil {
		return err
	}
	err = enc.Encode(v)
	if err != nil {
		return err
	}
	return r.ch.Close()
}

func (r *responder) Hijack(v interface{}) (mux.Channel, error) {
	enc := r.c.Encoder(r.ch)
	var e error
	var ok bool
	if e, ok = v.(error); ok {
		v = nil
	}
	if e != nil {
		var errStr = e.Error()
		r.header.Error = &errStr
	}
	r.header.Hijacked = true
	err := enc.Encode(r.header)
	if err != nil {
		return nil, err
	}
	err = enc.Encode(v)
	if err != nil {
		return nil, err
	}
	return r.ch, nil
}

type RespondMux struct {
	handlers map[string]Handler
	codec    Codec
	mu       sync.Mutex
}

var DefaultRespondMux = &RespondMux{
	handlers: make(map[string]Handler),
	codec:    JSONCodec{},
}

func NewRespondMux(codec Codec) *RespondMux {
	return &RespondMux{
		handlers: make(map[string]Handler),
		codec:    codec,
	}
}

// Bind makes a Handler accessible at a path. Non-Handlers
// are exported with MustExport.
func (m *RespondMux) Bind(path string, v interface{}) {
	var handlers map[string]Handler
	if h, ok := v.(Handler); ok {
		handlers = map[string]Handler{"": h}
	} else {
		handlers = MustExport(v)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for p, h := range handlers {
		if path != "" && p != "" {
			p = strings.Join([]string{path, p}, ".")
		} else {
			p = strings.Join([]string{path, p}, "")
		}
		m.handlers[p] = h
	}
}

func Bind(path string, v interface{}) {
	DefaultRespondMux.Bind(path, v)
}

func (m *RespondMux) Handler(path string) Handler {
	var handler Handler
	m.mu.Lock()
	for k, v := range m.handlers {
		if (strings.HasSuffix(k, "/") && strings.HasPrefix(path, k)) || path == k {
			handler = v
			break
		}
	}
	m.mu.Unlock()
	return handler
}

func (m *RespondMux) RespondRPC(Responder, *Call) {
	// TODO
}

func (m *RespondMux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	websocket.Handler(func(ws *websocket.Conn) {
		ws.PayloadType = websocket.BinaryFrame
		sess := mux.NewSession(r.Context(), ws)
		for {
			ch, err := sess.Accept()
			if err != nil {
				if err == io.EOF {
					return
				}
				panic(err)
			}
			go Respond(sess, ch, m)
		}
	}).ServeHTTP(w, r)
}
