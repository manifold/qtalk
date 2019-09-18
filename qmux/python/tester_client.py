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

