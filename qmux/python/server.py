import asyncio, pdb
from qmux import Session, TCPConn, IConn, DataView, EmptyArray

@asyncio.coroutine
def handle_echo(reader, writer):
    conn = TCPConn(reader, writer)
    sess = Session(conn, loop.create_task)
    ch = yield from sess.open()
    ch.result().write(b"tester echo")
    # close? send might not have finished

    ch = yield from sess.accept()
    data = yield from ch.result().read(11) # returns none because there are no elements in queue.q list
    message = data.decode()
    addr = writer.get_extra_info('peername')
    print("Received %r from %r" % (message, addr))
    print("Client socket closed")
    writer.close()

loop = asyncio.get_event_loop()
coro = asyncio.start_server(handle_echo, '127.0.0.1', 9998, loop=loop)
server = loop.run_until_complete(coro)

# Serve requests until Ctrl+C is pressed
print('Serving on {}'.format(server.sockets[0].getsockname()))
try:
    loop.run_forever()
except KeyboardInterrupt:
    pass

# Close the server
server.close()
loop.run_until_complete(server.wait_closed())
loop.close()
