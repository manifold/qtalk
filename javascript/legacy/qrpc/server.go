package main

import (
	"log"

	"github.com/progrium/prototypes/libmux/mux"
	"github.com/progrium/prototypes/qrpc"
)

const addr = "localhost:4242"

func main() {
	// define api
	api := qrpc.NewAPI()
	api.HandleFunc("echo", func(r qrpc.Responder, c *qrpc.Call) {
		defer log.Println("returned")
		var msg string
		log.Println("echo call")
		err := c.Decode(&msg)
		log.Println("arg decode:", msg)
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
	log.Fatal(server.Serve(l, api))
}
