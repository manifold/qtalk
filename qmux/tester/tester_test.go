package main

import (
	"bytes"
	"io"
	"io/ioutil"
	"net"
	"os"
	"os/exec"
	"testing"

	qmux "github.com/manifold/qtalk/qmux/go"
)

const (
	TesterAddr    = "127.0.0.1:9998"
	TesterMessage = "tester echo"
)

func fatal(err error, t *testing.T) {
	if err != nil {
		t.Fatal(err)
	}
}

func TestExternalClient(t *testing.T) {
	l, err := net.Listen("tcp", TesterAddr)
	fatal(err, t)
	defer l.Close()

	clientCmd := os.Getenv("CLIENTCMD")
	if clientCmd == "" {
		t.Fatal("CLIENTCMD needs to be set")
	}
	cmd := exec.Command("sh", "-c", clientCmd)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err = cmd.Start()
	fatal(err, t)

	conn, err := l.Accept()
	fatal(err, t)
	defer conn.Close()

	sess := qmux.NewSession(conn)

	var wch qmux.Channel
	t.Run("session open", func(t *testing.T) {
		wch, err = sess.Open()
		fatal(err, t)
	})

	t.Run("channel write", func(t *testing.T) {
		_, err = io.WriteString(wch, TesterMessage)
		fatal(err, t)
		err = wch.CloseWrite()
		fatal(err, t)
	})

	var rch qmux.Channel
	t.Run("session accept", func(t *testing.T) {
		rch, err = sess.Accept()
		fatal(err, t)
	})

	var b []byte
	t.Run("session accept", func(t *testing.T) {
		b, err = ioutil.ReadAll(rch)
		fatal(err, t)
		wch.Close() // should already be closed by other end
	})

	err = sess.Close()
	fatal(err, t)

	err = cmd.Wait()
	fatal(err, t)

	if !bytes.Equal(b, []byte(TesterMessage)) {
		t.Fatalf("unexpected bytes: %s", b)
	}
}
