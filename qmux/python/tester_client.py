from qmux import Session, TCPConn, IConn, DataView
import asyncio, pdb

def DialTCP(loop, port, host='127.0.0.1'):
	reader, writer = yield from asyncio.open_connection(host, port, loop=loop)
	return TCPConn(reader, writer)

loop = asyncio.get_event_loop()

async def main():
	conn = DialTCP(loop, 9998, "127.0.0.1")
	conn = await asyncio.ensure_future(conn)
	sess = Session(conn, loop.create_task)
	ch = await sess.accept()
	b = ch.read() # ioutil.ReadAll(ch) # consider python io.RawIOBase.readall()
	ch = sess.open()
	ch.write(b)
	ch.close()
	conn.close()

loop.run_until_complete(main())

"""
// go version of the tester

func main() {
	conn, err := net.Dial("tcp", "127.0.0.1:9998")
	defer conn.Close()
	sess := qmux.NewSession(conn)
	var ch qmux.Channel
	ch, err = sess.Accept()
	b, err := ioutil.ReadAll(ch)
	err = ch.Close()
	ch, err = sess.Open()
	_, err = ch.Write(b)
	ch.Close() // should already be closed by other end
}
"""
