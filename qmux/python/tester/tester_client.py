import asyncio

def DialTCP(port, host):
	promise = asyncio.Future()
	socket = net.createConnection(port, host, promise)
	promise.set_result(TCPConn(socket))
	return promise

async def function():
    sess = qmux.Session(await qmux.DialTCP(9998))
    
    ch = await sess.accept()
    buf = [] # Buffer.from("");
    while True:
        data = await ch.read(1)
        if data == None:
            break
        buf = [[buf, data], buf.length+data.length]
    await ch.close()
    
    ch = await sess.open()
    await ch.write(buf)
    await ch.close()

    await sess.close()

try:
	function()
except:
	print("Unknown error!")

# what to do:
#1 rewrite some of the qmux_node in python
#2 check net module out
