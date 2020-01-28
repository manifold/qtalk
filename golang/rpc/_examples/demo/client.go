package main

import (
	"flag"
	"fmt"

	"github.com/progrium/prototypes/libmux/mux"
	"github.com/progrium/prototypes/qrpc"
)

const addr = "localhost:4242"

func main() {

	sess, err := mux.DialWebsocket(addr)
	if err != nil {
		panic(err)
	}
	client := &qrpc.Client{Session: sess}

	flag.Parse()

	var resp1 qrpc.ObjectHandle
	var resp2 string
	err = client.Call("demo/NewPerson", "Jeff", &resp1)
	if err != nil {
		panic(err)
	}
	fmt.Println("handle:", resp1)
	err = client.Call(resp1.ObjectPath+"/IncrAge", nil, nil)
	if err != nil {
		panic(err)
	}
	err = client.Call("demo/Person", resp1, &resp2)
	if err != nil {
		panic(err)
	}
	fmt.Printf("resp: %#v\n", resp2)
}
