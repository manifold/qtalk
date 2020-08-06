package rpc

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"io"
)

type Encoder interface {
	Encode(v interface{}) error
}

type Decoder interface {
	Decode(v interface{}) error
}

type Codec interface {
	Encoder(w io.Writer) Encoder
	Decoder(r io.Reader) Decoder
}

// length prefixed frame wrapper codec
type frameCodec struct {
	Codec
}

func (c *frameCodec) Encoder(w io.Writer) Encoder {
	return &frameEncoder{
		w: w,
		c: c.Codec,
	}
}

type frameEncoder struct {
	w io.Writer
	c Codec
}

func (e *frameEncoder) Encode(v interface{}) error {
	var buf bytes.Buffer
	enc := e.c.Encoder(&buf)
	err := enc.Encode(v)
	if err != nil {
		return err
	}
	b := buf.Bytes()
	prefix := make([]byte, 4)
	binary.BigEndian.PutUint32(prefix, uint32(len(b)))
	_, err = e.w.Write(append(prefix, b...))
	if err != nil {
		return err
	}
	return nil
}

func (c *frameCodec) Decoder(r io.Reader) Decoder {
	return &frameDecoder{
		r: r,
		c: c.Codec,
	}
}

type frameDecoder struct {
	r io.Reader
	c Codec
}

func (d *frameDecoder) Decode(v interface{}) error {
	prefix := make([]byte, 4)
	_, err := d.r.Read(prefix)
	if err != nil {
		return err
	}
	size := binary.BigEndian.Uint32(prefix)
	buf := make([]byte, size)
	_, err = d.r.Read(buf)
	if err != nil {
		return err
	}
	dec := d.c.Decoder(bytes.NewBuffer(buf))
	err = dec.Decode(v)
	if err != nil {
		return err
	}
	return nil
}

// type MsgpackCodec struct{}

// func (c MsgpackCodec) Encoder(w io.Writer) Encoder {
// 	return msgpack.NewEncoder(w)
// }

// func (c MsgpackCodec) Decoder(r io.Reader) Decoder {
// 	return msgpack.NewDecoder(r)
// }

type JSONCodec struct{}

func (c JSONCodec) Encoder(w io.Writer) Encoder {
	return json.NewEncoder(w)
}

func (c JSONCodec) Decoder(r io.Reader) Decoder {
	return json.NewDecoder(r)
}
