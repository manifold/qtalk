import asyncio, pdb
from qmux import Session, TCPConn, IConn, DataView, empty_array

async def handle_echo(reader, writer):
    conn = TCPConn(reader, writer)
    sess = Session(conn, loop.create_task)
    
    ch = await sess.open()
    ch.write(b"tester echo")
    # close? send might not have finished
    
    #await ch.close()
    ch = await sess.accept() # this doesn't work
    data = await ch.read(11)
    message = data.decode()
    print(message)
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