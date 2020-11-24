package rpc

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/manifold/qtalk/golang/mux"
)

type Caller interface {
	Call(path string, args, reply interface{}) (*Response, error)
}

type Response struct {
	ResponseHeader

	Reply   interface{}
	Channel mux.Channel
}

type Call struct {
	Destination string
	ObjectPath  string
	Method      string
	Caller      Caller
	Decoder     Decoder
	Context     context.Context
}

func (c *Call) Parse() error {
	if len(c.Destination) == 0 {
		return fmt.Errorf("no destination specified")
	}
	if c.Destination[0] == '/' {
		c.Destination = c.Destination[1:]
	}
	parts := strings.Split(c.Destination, "/")
	if len(parts) == 1 {
		c.ObjectPath = "/"
		c.Method = parts[0]
		return nil
	}
	c.ObjectPath = strings.Join(parts[0:len(parts)-1], "/")
	c.Method = parts[len(parts)-1]
	return nil
}

func (c *Call) Decode(v interface{}) error {
	return c.Decoder.Decode(v)
}

type caller struct {
	session mux.Session
	codec   Codec
}

func NewCaller(session mux.Session, codec Codec) Caller {
	return &caller{
		session: session,
		codec:   codec,
	}
}

func (c *caller) Call(path string, args, reply interface{}) (*Response, error) {
	ch, err := c.session.Open()
	if err != nil {
		return nil, err
	}

	codec := &frameCodec{c.codec}
	enc := codec.Encoder(ch)
	dec := codec.Decoder(ch)

	// request
	err = enc.Encode(Call{
		Destination: path,
	})
	if err != nil {
		ch.Close()
		return nil, err
	}

	err = enc.Encode(args)
	if err != nil {
		ch.Close()
		return nil, err
	}

	// response
	var header ResponseHeader
	err = dec.Decode(&header)
	if err != nil {
		ch.Close()
		return nil, err
	}

	if !header.Hijacked {
		defer ch.Close()
	}

	resp := &Response{
		ResponseHeader: header,
		Channel:        ch,
		Reply:          reply,
	}
	if resp.Error != nil {
		return resp, fmt.Errorf("remote: %s", *(resp.Error))
	}

	if reply == nil {
		// read into throwaway buffer
		var buf []byte
		if err := dec.Decode(&buf); err != nil {
			if errors.Is(err, io.EOF) {
				return resp, nil
			}
			return resp, err
		}
	} else {
		if err := dec.Decode(resp.Reply); err != nil {
			return resp, err
		}
	}

	return resp, nil
}
