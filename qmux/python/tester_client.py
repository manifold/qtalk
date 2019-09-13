from qmux import Session, TCPConn, IConn, DataView, EmptyArray
import asyncio, pdb

def DialTCP(loop, port, host='127.0.0.1'):
    pdb.set_trace()
    reader, writer = yield from asyncio.open_connection(host, port, loop=loop)
    wrapper = IConn(TCPConn(reader, writer))
    return wrapper

loop = asyncio.get_event_loop()
pdb.set_trace()

sess = Session(DialTCP(loop,8888), loop.run_until_complete)
ch = sess.accept()
buf = []
while True:
    data = ch.read(1)
    if data == None:
        break
    buf = [buf, data]
    
ch_close = loop.create_task(ch.close())
sess_open = loop.create_task(ch = sess.open())
write_buf = loop.create_task(ch.write(buf))
ch_close2 = loop.create_task(ch.close())
sess_close = loop.create_task(sess.close())
loop.run_until_complete(ch_close, sess_open, write_buf, ch_close2, sess_close)

