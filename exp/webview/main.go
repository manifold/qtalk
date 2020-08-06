package main

import (
	"context"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/manifold/qtalk/golang/mux"
	"github.com/webview/webview"
	"golang.org/x/net/websocket"
)

func main() {
	wv := webview.New(true)
	defer wv.Destroy()
	wv.SetSize(720, 400, webview.HintNone)
	wv.Navigate("http://127.0.0.1:7771/main.html")
	handler := http.FileServer(http.Dir("."))

	go func() {
		http.ListenAndServe("127.0.0.1:7771", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Upgrade") == "websocket" {
				websocket.Handler(qmuxHandler).ServeHTTP(w, r)
				return
			}
			handler.ServeHTTP(w, r)
		}))
	}()
	wv.Run()
}

func fatal(err error) {
	if err != nil {
		panic(err)
	}
}

func qmuxHandler(conn *websocket.Conn) {
	conn.PayloadType = websocket.BinaryFrame
	log.Println("starting sess")

	ctx := context.Background()
	sess := mux.NewSession(ctx, conn)

	ch, err := sess.Accept()
	fatal(err)

	io.Copy(os.Stdout, ch)
}
