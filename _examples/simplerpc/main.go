package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/manifold/qtalk/golang/mux/transport"
	"github.com/manifold/qtalk/golang/rpc"
)

func main() {
	rpc.Bind("upper", func(str string) string {
		return strings.ToUpper(str)
	})
	rpc.Bind("add", func(a, b int) int {
		return a + b
	})

	go http.ListenAndServe(":8888", rpc.DefaultRespondMux)

	sess, err := transport.DialWS("localhost:8888")
	fatal(err)

	caller := rpc.NewCaller(sess, rpc.JSONCodec{})

	var reply int
	_, err = caller.Call("add", []int{4, 5}, &reply)
	fatal(err)

	fmt.Println(reply)
}

func fatal(err error) {
	if err != nil {
		panic(err)
	}
}
