package main

import "C"

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log"
	"reflect"
	"sync"
	"unsafe"

	"github.com/manifold/qtalk/libmux/mux"
)

type refmanager struct {
	sync.Mutex
	values    map[int32]interface{}
	errors    map[int32]error
	nextValID int32
	nextErrID int32
}

func (m *refmanager) StoreVal(v interface{}) int32 {
	m.Lock()
	defer m.Unlock()
	if m.values == nil {
		m.values = make(map[int32]interface{})
	}
	m.nextValID++
	m.values[m.nextValID] = v
	return m.nextValID
}

func (m *refmanager) ReleaseVal(id int32) int32 {
	m.Lock()
	defer m.Unlock()
	delete(m.values, id)
	return 0
}

func (m *refmanager) Val(id int32) interface{} {
	m.Lock()
	defer m.Unlock()
	if m.values == nil {
		m.values = make(map[int32]interface{})
	}
	val, ok := m.values[id]
	if !ok {
		return nil
	}
	return val
}

func (m *refmanager) StoreErr(err error) int32 {
	m.Lock()
	defer m.Unlock()
	log.Println(err)
	if m.errors == nil {
		m.errors = make(map[int32]error)
	}
	m.nextErrID--
	m.errors[m.nextErrID] = err
	return m.nextErrID
}

func (m *refmanager) Err(id int32) error {
	m.Lock()
	defer m.Unlock()
	if m.errors == nil {
		m.errors = make(map[int32]error)
	}
	err, ok := m.errors[id]
	if !ok {
		return nil
	}
	delete(m.errors, id)
	return err
}

var refs = &refmanager{}

var errNoValueFmt = "%s id has no value"
var errTypeFmt = "%s id has wrong type"

//export DumpRefs
func DumpRefs() {
	refs.Lock()
	defer refs.Unlock()
	valTypes := make(map[int32]string)
	for k, v := range refs.values {
		rv := reflect.ValueOf(v)
		valTypes[k] = rv.Elem().Type().Name()
	}
	fmt.Println(valTypes)
}

//export TestError
func TestError(buf *C.uchar, len int32) int32 {
	b := (*[1 << 30]byte)(unsafe.Pointer(buf))[:len:len]
	return refs.StoreErr(errors.New(string(b)))
}

//export Error
func Error(id int32, buf *C.uchar, len int32) int32 {
	err := refs.Err(id)
	if err == nil {
		return 0
	}
	errBuf := bytes.NewBufferString(err.Error())
	b := (*[1 << 30]byte)(unsafe.Pointer(buf))[:len:len]
	return int32(copy(b, errBuf.Bytes()))
}

//export DialTCP
func DialTCP(addr string) int32 {
	sess, err := mux.DialTCP(addr)
	if err != nil {
		return refs.StoreErr(err)
	}
	return refs.StoreVal(sess)
}

//export ListenTCP
func ListenTCP(addr string) int32 {
	l, err := mux.ListenTCP(addr)
	if err != nil {
		return refs.StoreErr(err)
	}
	return refs.StoreVal(l)
}

//export DialWebsocket
func DialWebsocket(addr string) int32 {
	sess, err := mux.DialWebsocket(addr)
	if err != nil {
		return refs.StoreErr(err)
	}
	return refs.StoreVal(sess)
}

//export ListenWebsocket
func ListenWebsocket(addr string) int32 {
	l, err := mux.ListenWebsocket(addr)
	if err != nil {
		return refs.StoreErr(err)
	}
	return refs.StoreVal(l)
}

//export ListenerClose
func ListenerClose(id int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Listener"))
	}
	l, ok := r.(mux.Listener)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "ListenerClose"))
	}
	if err := l.Close(); err != nil {
		return refs.StoreErr(err)
	}
	return refs.ReleaseVal(id)
}

//export ListenerAccept
func ListenerAccept(id int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Listener"))
	}
	l, ok := r.(mux.Listener)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "ListenerAccept"))
	}
	sess, err := l.Accept()
	if err != nil {
		if err == io.EOF {
			return 0
		}
		return refs.StoreErr(err)
	}
	return refs.StoreVal(sess)
}

//export SessionClose
func SessionClose(id int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Session"))
	}
	sess, ok := r.(mux.Session)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "SessionClose"))
	}
	defer refs.ReleaseVal(id)
	if err := sess.Close(); err != nil {
		if err == io.EOF {
			return 0
		}
		return refs.StoreErr(err)
	}
	return 0
}

//export SessionOpen
func SessionOpen(id int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Session"))
	}
	l, ok := r.(mux.Session)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "SessionOpen"))
	}
	ch, err := l.Open()
	if err != nil {
		if err == io.EOF {
			return 0
		}
		return refs.StoreErr(err)
	}
	return refs.StoreVal(ch)
}

//export SessionAccept
func SessionAccept(id int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Session"))
	}
	l, ok := r.(mux.Session)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "SessionAccept"))
	}
	ch, err := l.Accept()
	if err != nil {
		if err == io.EOF {
			return 0
		}
		return refs.StoreErr(err)
	}
	return refs.StoreVal(ch)
}

//export ChannelClose
func ChannelClose(id int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Channel"))
	}
	ch, ok := r.(mux.Channel)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "ChannelClose"))
	}
	defer refs.ReleaseVal(id)
	if err := ch.Close(); err != nil {
		if err == io.EOF {
			return 0
		}
		return refs.StoreErr(err)
	}
	return 0
}

//export ChannelWrite
func ChannelWrite(id int32, buf *C.uchar, len int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Channel"))
	}
	ch, ok := r.(mux.Channel)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "ChannelWrite"))
	}
	b := (*[1 << 30]byte)(unsafe.Pointer(buf))[:len:len]
	n, err := ch.Write(b)
	if err != nil {
		if err == io.EOF {
			return 0
		}
		return refs.StoreErr(err)
	}
	return int32(n)
}

//export ChannelRead
func ChannelRead(id int32, buf *C.uchar, len int32) int32 {
	r := refs.Val(id)
	if r == nil {
		return 0 //refs.StoreErr(fmt.Errorf(errNoValueFmt, "Channel"))
	}
	ch, ok := r.(mux.Channel)
	if !ok {
		return refs.StoreErr(fmt.Errorf(errTypeFmt, "ChannelRead"))
	}
	b := (*[1 << 30]byte)(unsafe.Pointer(buf))[:len:len]
	n, err := ch.Read(b)
	if err != nil {
		if err == io.EOF {
			return 0
		}
		return refs.StoreErr(err)
	}
	return int32(n)
}

func main() {}
