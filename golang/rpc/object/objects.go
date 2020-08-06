package object

import (
	"fmt"
	"math/rand"
	path_ "path"
	"strings"
	"sync"
	"time"

	"github.com/oklog/ulid"
)

func generateULID() string {
	t := time.Unix(1000000, 0)
	entropy := rand.New(rand.NewSource(t.UnixNano()))
	return ulid.MustNew(ulid.Timestamp(t), entropy).String()
}

type ObjectManager struct {
	mountPath string
	values    map[string]interface{}
	mu        sync.Mutex
}

func NewObjectManager() *ObjectManager {
	return &ObjectManager{
		values:    make(map[string]interface{}),
		mountPath: "/",
	}
}

func (m *ObjectManager) Object(path string) ManagedObject {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := strings.TrimPrefix(path, m.mountPath)
	if id[0] == '/' {
		id = id[1:]
	}
	v, ok := m.values[id]
	if !ok {
		return nil
	}
	return &object{value: v, id: id, manager: m}
}

func (m *ObjectManager) Register(v interface{}) ManagedObject {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := generateULID()
	m.values[id] = v
	return &object{value: v, id: id, manager: m}
}

func (m *ObjectManager) Handle(v interface{}) ObjectHandle {
	return m.Register(v).Handle()
}

func (m *ObjectManager) ServeRPC(r Responder, c *Call) {
	parts := strings.Split(c.ObjectPath, "/")
	id := parts[len(parts)-1]
	m.mu.Lock()
	v, ok := m.values[id]
	m.mu.Unlock()
	if !ok {
		r.Return(fmt.Errorf("object not registered: %s", c.ObjectPath))
		return
	}
	handler, err := Export(v)
	if err != nil {
		r.Return(err)
		return
	}
	handler.ServeRPC(r, c)
}

func (m *ObjectManager) Mount(api API, path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mountPath = path
	api.Handle(path, m)
}

type ManagedObject interface {
	Dispose()
	Path() string
	Value() interface{}
	Handle() ObjectHandle
}

type ObjectHandle struct {
	ObjectPath string
}

type object struct {
	manager *ObjectManager
	id      string
	value   interface{}
}

func (o *object) Dispose() {
	o.manager.mu.Lock()
	defer o.manager.mu.Unlock()
	delete(o.manager.values, o.id)
}

func (o *object) Path() string {
	o.manager.mu.Lock()
	defer o.manager.mu.Unlock()
	return path_.Join(o.manager.mountPath, o.id)
}

func (o *object) Handle() ObjectHandle {
	return ObjectHandle{
		ObjectPath: o.Path(),
	}
}

func (o *object) Value() interface{} {
	return o.value
}
