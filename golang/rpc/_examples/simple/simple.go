package main

import (
	"fmt"
	"log"

	"github.com/manifold/qtalk/libmux/mux"
	"github.com/manifold/qtalk/qrpc"
)

const addr = "localhost:4242"

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
		r.Return(msg)
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
	var resp string
	_, err = client.Call("echo", "Hello world", &resp)
	if err != nil {
		panic(err)
	}
	fmt.Printf("resp: %#v\n", resp)
}
