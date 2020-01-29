package main

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"

	"github.com/manifold/qtalk/libmux/mux"
	"github.com/manifold/qtalk/qrpc"
)

const addr = "localhost:4243"

func main() {
	// define api
	api := qrpc.NewAPI()
	api.HandleFunc("echo", func(r qrpc.Responder, c *qrpc.Call) {
		var msg string
		err := c.Decode(&msg)
		if err != nil {
			r.Return(err)
			return
		}
		ch, err := r.Hijack("Something else")
		if err != nil {
			return
		}
		io.WriteString(ch, msg)
		ch.Close()
	})

	// start server with api
	server := &qrpc.Server{}
	l, err := mux.ListenTCP(addr)
	if err != nil {
		panic(err)
	}
	go func() {
		log.Fatal(server.Serve(l, api))
	}()

	// connect client to server, call echo
	sess, err := mux.DialTCP(addr)
	if err != nil {
		panic(err)
	}
	client := &qrpc.Client{Session: sess}
	resp, err := client.Call("echo", "Hello world", nil)
	if err != nil {
		panic(err)
	}
	if resp.Hijacked {
		reply, err := ioutil.ReadAll(resp.Channel)
		if err != nil {
			panic(err)
		}
		fmt.Printf("resp: %#v\n", string(reply))
		return
	}
	panic("no hijack")
}
