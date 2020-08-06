package main

import (
	"net/http"
	"strings"

	"github.com/manifold/qtalk/golang/rpc"
	"github.com/webview/webview"
)

func main() {
	rpc.Bind("upper", func(str string) string {
		return strings.ToUpper(str)
	})
	rpc.Bind("add", func(a, b int) int {
		return a + b
	})

	go func() {
		http.ListenAndServe("127.0.0.1:7171", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Upgrade") == "websocket" {
				rpc.DefaultRespondMux.ServeHTTP(w, r)
				return
			}
			http.FileServer(http.Dir(".")).ServeHTTP(w, r)
		}))
	}()

	wv := webview.New(true)
	defer wv.Destroy()
	wv.SetSize(720, 400, webview.HintNone)
	wv.Navigate("http://127.0.0.1:7171/main.html")
	wv.Run()
}
