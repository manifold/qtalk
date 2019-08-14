package main

import (
	"fmt"
	"io"
	"log"
	"time"

	"github.com/progrium/prototypes/libmux/mux"
)

func fatal(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	go func() {
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
	}()

	time.Sleep(100 * time.Millisecond)

	session, err := mux.DialWebsocket("localhost:8000")
	fatal(err)
	ch, err := session.Accept()
	fatal(err)
	ch.Write([]byte("Hello"))
	ch.Write([]byte(" "))
	ch.Write([]byte("world"))

	data := make([]byte, 11)
	pos := 0
	for pos < 11 {
		n, err := ch.Read(data[pos:])
		fatal(err)
		pos += n
	}
	fmt.Println(string(data))

	session.Close()
}
