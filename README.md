# qtalk

qtalk is a minimal set of packages for several languages that 
achieve an opinionated but expressive way for programmers to get
their programs to interact (IPC, as they say). 

right now there are two main parts: mux, rpc.

this repo is actively trying to settle as we determine how to break
up parts into packages for multiple languages while being a single
project. 

## mux

mux is a connection multiplexing layer. the goal of this layer is to provide
a muxed socket API for opening and accepting virtual TCP connections (channels).
the API looks something like this (excuse the Go shorthand):

```
type Session interface {
	Close() error
	Open() (Channel, error)
	Accept() (Channel, error)
	LocalAddr() net.Addr
	RemoteAddr() net.Addr
}

type Channel interface {
	ID() uint64
	io.Reader
	io.Writer
	io.Closer
}
```

this API can be implemented many ways and some roll their own. it being about
the API though means you can use whatever works, and the spin-off project libmux is a
C library that exposes a pluggable version of this API with various implementations including 
ones based on subsets of HTTP2 and SSH, the most widely deployed protocols that do connection
multiplexing. 

personally, i'm most excited about QUIC as an ideal implementation of this layer because
it's TCP+TLS+muxing on top of UDP, built to outperform the typical TCP/TLS stack, in part
by building in connection multiplexing at this layer to avoid the overhead of many TCP(+TLS) 
connections. being UDP also potentially has advantages in making easier peer-to-peer connections.

besides performance benefits, a muxing API can be used as a primitive to simplify higher level
protocols. the main example being our rpc layer, which implements a request and reply as
the two directions of a virtual channel (a la http/2). no need to keep track of request and reply
ID in the rpc protocol if they just live in their own channel that binds them together using existing
semantics. an extra bonus to this is explained later in the rpc layer.

however, there is no good standalone protocol spec for connection multiplexing that is simple
enough to be ported, adapted, and used within many contexts (languages, transports). however, SSH was
architected with very clear layers of abstraction, including a whole layer dedicated to connection
multiplexing. by extracting that part of the spec into its own standalone spec (with nothing 
changed but names!) we get a protocol we call qmux, which by nature of literally being a subset 
of SSH makes it the most mature and widely deployed muxing protocol. it also happens to be as 
simple as it can be afaik.

i explain all this because it's important to understand that as a layer in qtalk, it just needs to
implement the muxing API above. the implementation provided in this repo is the qmux protocol, but
everything else was designed to work with the API, not specifically qmux. it is possible to replace qmux
in qtalk with QUIC, for example, or your fancy custom muxing transport if it can implement this API.

the q prefix of this project started in reference to QUIC. but until the browser context can 
natively do QUIC (maybe never), we have to have some kind of layer over WebSocket. this can then also be
used over any other bytestream transport (TCP, stdio) or transport capable of re-modeling bytestreams
(UDP, messaging). hence qmux... simplest standalone mux protocol based on most one of the most common
protocols on the net.

## rpc

TODO

## future layers

these two pieces alone give you the ability to call functions and stream multiple channels
of bytes in either direction. given that you can tunnel most protocols over a stream of bytes and can
implement/model nearly any protocol as rpc (did you know NFS is just an rpc protocol?), and can run this
over nearly any transport... there's a lot of bang for buck here.

however, there are some more related concerns and higher level ideas that we need. but i won't
get into them until we have clearer ideas of what they look like. we know that:

* realtime data replication is extremely powerful and often "what you really want"
* schemas can feel like overkill when forced, but as an option open up lots of magical possibilities
* message brokers are an anti-pattern, but some kind of bus/hub primitive opens up more topologies
* distributed objects have their issues, but sometimes you need to work with a remote object
