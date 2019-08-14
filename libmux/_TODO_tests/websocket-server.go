package main

import (
	"io"
	"log"

	"github.com/progrium/prototypes/libmux/mux"
)

func fatal(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	listener, err := mux.ListenWebsocket("localhost:8000")
	fatal(err)
	session, err := listener.Accept()
	fatal(err)
	ch, err := session.Open()
	fatal(err)
	log.Println("Server echoing on channel...")
	for {
		data := make([]byte, 1)
		_, err := ch.Read(data)
		if err == io.EOF {
			log.Println("server got EOF")
			break
		}
		ch.Write(data)
	}
	listener.Close()
}
