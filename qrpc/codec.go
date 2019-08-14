package qrpc

import (
	"bytes"
	"encoding/binary"
	"io"

	msgpack "gopkg.in/vmihailenco/msgpack.v2"
)

type Encoder interface {
	Encode(v ...interface{}) error
}

type Decoder interface {
	Decode(v ...interface{}) error
}

type Codec interface {
	Encoder(w io.Writer) Encoder
	Decoder(r io.Reader) Decoder
}

type frameCodec struct {
	Codec
}

func newFrameCodec(c Codec) Codec {
	if c == nil {
		c = &MsgpackCodec{}
	}
	return &frameCodec{c}
}

func (c *frameCodec) Encoder(w io.Writer) Encoder {
	return &frameEncoder{
		w: w,
		c: c.Codec,
	}
}

func (c *frameCodec) Decoder(r io.Reader) Decoder {
	return &frameDecoder{
		r: r,
		c: c.Codec,
	}
}

type frameEncoder struct {
	w io.Writer
	c Codec
}

func (e *frameEncoder) Encode(v ...interface{}) error {
	for _, vv := range v {
		var buf bytes.Buffer
		enc := e.c.Encoder(&buf)
		err := enc.Encode(vv)
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
	}
	return nil
}

type frameDecoder struct {
	r io.Reader
	c Codec
}

func (d *frameDecoder) Decode(v ...interface{}) error {
	for _, vv := range v {
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
		err = dec.Decode(vv)
		if err != nil {
			return err
		}
	}
	return nil
}

type MsgpackCodec struct{}

func (c *MsgpackCodec) Encoder(w io.Writer) Encoder {
	return msgpack.NewEncoder(w)
}

func (c *MsgpackCodec) Decoder(r io.Reader) Decoder {
	return msgpack.NewDecoder(r)
}
