from qmux import Session, TCPConn, IConn, DataView
import asyncio, pdb

def DialTCP(loop, port, host='127.0.0.1'):
    pdb.set_trace()
    reader, writer = yield from asyncio.open_connection(host, port, loop=loop)
    return TCPConn(reader, writer)

loop = asyncio.get_event_loop()

async def main():
	conn = DialTCP(loop, 9998, "127.0.0.1")
	pdb.set_trace()
	
	sess = Session(conn, loop)
	ch = None
	ch = sess.Accept()
	b = None #ioutil.ReadAll(ch)
	err = ch.Close()
	ch = sess.Open()
	ch.Write(b)
	ch.Close()

loop.run_until_complete(main())
