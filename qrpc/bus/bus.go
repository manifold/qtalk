package bus

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"sync"

	"github.com/progrium/prototypes/libmux/mux"
	"github.com/progrium/prototypes/qrpc"
)

type Bus struct {
	qrpc.API

	backends map[string]mux.Session
	mu       sync.Mutex
}

func NewBus() *Bus {
	bus := &Bus{
		API:      qrpc.NewAPI(),
		backends: make(map[string]mux.Session),
	}
	bus.API.HandleFunc("register", func(r qrpc.Responder, c *qrpc.Call) {
		session := c.Caller.(*qrpc.Client).Session
		var paths []string
		err := c.Decode(&paths)
		if err != nil {
			r.Return(err)
			return
		}
		bus.mu.Lock()
		for _, path := range paths {
			bus.backends[path] = session
		}
		bus.mu.Unlock()
		r.Return(nil)
	})
	return bus
}

func (b *Bus) ServeAPI(sess mux.Session, ch mux.Channel, c qrpc.Codec) {
	var buf bytes.Buffer
	dec := c.Decoder(io.TeeReader(ch, &buf))
	var call qrpc.Call
	err := dec.Decode(&call)
	if err != nil {
		panic(err)
	}

	err = call.Parse()
	if err != nil {
		panic(err)
	}
	resp := qrpc.NewResponder(ch, c, &qrpc.ResponseHeader{})

	handler := b.API.Handler(call.Destination)
	if handler != nil {
		call.Decoder = dec
		call.Caller = &qrpc.Client{
			Session: sess,
		}
		handler.ServeRPC(resp, &call)
		return
	}

	b.mu.Lock()
	var backend mux.Session
	for k, v := range b.backends {
		if strings.HasPrefix(call.Destination, k) {
			backend = v
			break
		}
	}
	b.mu.Unlock()
	if backend == nil {
		resp.Return(errors.New("backend does not exist for this destination"))
		return
	}

	bch, err := backend.Open()
	if err != nil {
		resp.Return(err)
		return
	}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		io.Copy(ch, bch)
	}()
	_, err = buf.WriteTo(bch)
	if err != nil {
		resp.Return(err)
		return
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		io.Copy(bch, ch)
	}()
	wg.Wait()
}
