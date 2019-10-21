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
	sess.new_channel()
	ch = await sess.open()
	pdb.set_trace()
	ch = await sess.accept()
	b = ch.read() #ioutil.ReadAll(ch)
	ch = sess.open()
	ch.write(b)
	ch.close()
	conn.close()

loop.run_until_complete(main())
