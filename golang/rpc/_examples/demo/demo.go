package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"strconv"
	"strings"

	"github.com/progrium/prototypes/libmux/mux"
	"github.com/progrium/prototypes/qrpc"
	"golang.org/x/crypto/ssh"
)

const addr = "localhost:4242"

type Person struct {
	name string
	age  int
}

func (p *Person) Name() string {
	return p.name
}

func (p *Person) Age() string {
	return strconv.Itoa(p.age)
}

func (p *Person) IncrAge() {
	p.age += 1
}

type PeopleService struct {
	objs *qrpc.ObjectManager
}

func (s *PeopleService) NewPerson(name string) qrpc.ObjectHandle {
	obj := s.objs.Register(&Person{name: name, age: 30})
	return obj.Handle()
}

func (s *PeopleService) Person(handle qrpc.ObjectHandle) string {
	return fmt.Sprintf("%#v", s.objs.Object(handle.ObjectPath).Value())
}

func (_ *PeopleService) Echo(msg string) string {
	return msg
}

// type ScheduleInput struct {
// 	Interval int
// 	Fn qrpc.ObjectHandle
// }

// func (_ *PeopleService) Schedule(o ScheduleInput, r qrpc.Responder, c *qrpc.Call) {

// }

func main() {
	api := qrpc.NewAPI()
	objects := qrpc.NewObjectManager()
	api.Handle("demo", qrpc.Must(qrpc.Export(&PeopleService{objects})))
	objects.Mount(api, "objects")

	cb := func(str string) string {
		return strings.ToUpper(str)
	}
	fmt.Println(objects.Register(cb).Path())

	// server
	//l, err := mux.ListenSSH(addr, generateSSHServerConfig())
	//l, err := mux.ListenQuic(addr, generateTLSConfig(), nil)
	//l, err := mux.ListenMuxado(addr, nil)
	//l, err := mux.ListenTCP(addr)
	l, err := mux.ListenWebsocket(addr)
	if err != nil {
		panic(err)
	}

	server := &qrpc.Server{}
	log.Println("serving...")
	log.Fatal(server.Serve(l, api))

}

// ================== HELPERS ===================

func generateTLSConfig() *tls.Config {
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		panic(err)
	}
	template := x509.Certificate{SerialNumber: big.NewInt(1)}
	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})

	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		panic(err)
	}
	return &tls.Config{Certificates: []tls.Certificate{tlsCert}}
}

func generateSSHClientConfig() *ssh.ClientConfig {
	return &ssh.ClientConfig{
		User:            "qrpc",
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
}

func generateSSHServerConfig() *ssh.ServerConfig {
	cfg := &ssh.ServerConfig{
		NoClientAuth: true,
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		panic(err)
	}
	cfg.AddHostKey(signer)
	return cfg
}
