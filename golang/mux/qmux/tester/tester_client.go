package main

import (
	"io/ioutil"
	"log"
	"net"

	"github.com/manifold/qtalk/golang/mux/qmux"
)

func fatal(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func main() {
	conn, err := net.Dial("tcp", "127.0.0.1:9998")
	fatal(err)
	defer conn.Close()

	sess := qmux.NewSession(conn)

	var ch qmux.Channel

	ch, err = sess.Accept()
	fatal(err)

	b, err := ioutil.ReadAll(ch)
	fatal(err)
	err = ch.Close()
	fatal(err)

	ch, err = sess.Open()
	fatal(err)

	_, err = ch.Write(b)
	fatal(err)
	ch.Close() // should already be closed by other end

}
