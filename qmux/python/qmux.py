from functools import reduce
import asyncio

class DataView():
	def __init__(self, array):
		self.array = array
		self.bytes_per_element = 1

	def __get_binary(self, start_index, byte_count, signed=False):
		integers = [self.array[start_index + x] for x in range(byte_count)]
		bytes = [integer.to_bytes(self.bytes_per_element, byteorder='little', signed=signed) for integer in integers]
		return reduce(lambda a, b: a + b, bytes)

	def getUint8(self, start_index):
		bytes_to_read = 1
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint8(self, index, number):
		if number > 255 or number < 0:
			number = number % 255
		self.array[index] = number

	def getUint16(self, start_index):
		bytes_to_read = 2
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint16(self, index, number):
		if number > 65535 or number < 0:
			number = number % 65535
		self.array[index] = number

	def getUint32(self, start_index):
		bytes_to_read = 4
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint32(self, index, number):
		if number > 4294967295 or number < 0:
			number = number % 4294967295
		self.array[index] = number

def EmptyArray(length):
    return [None] * length

msgChannelOpen = 100
msgChannelOpenConfirm = 101
msgChannelOpenFailure = 102
msgChannelWindowAdjust = 103
msgChannelData = 104
msgChannelEOF = 105
msgChannelClose = 106

minPacketLength = 9
channelMaxPacket = 1 << 15
channelWindowSize = 64 * channelMaxPacket

class channelOpenMsg():
    def __init__(self, peersID:int, peersWindow:int, maxPacketSize:int):
        self.peersID = peersID
        self.peersWindow = peersWindow
        self.maxPacketSize = maxPacketSize

class channelOpenConfirmMsg():
    def __init__(self, peersID:int, myID:int, myWindow:int, maxPacketSize:int):
        self.peersID = peersID
        self.myID = myID
        self.peersWindow = peersWindow
        self.maxPacketSize = maxPacketSize

class channelOpenFailureMsg():
    def __init__(self, peersID:int):
        self.peersID = peersID

class channelWindowAdjustMsg():
    def __init__(self, peersID:int, additionalBytes:int):
        self.peersID = peersID
        self.additionalBytes = additionalBytes

class channelDataMsg():
    def __init__(self, peersID:int, length:int, rest:list):
        self.peersID = peersID
        self.length = length
        self.rest = rest

class channelEOFMsg():
    def __init__(self, peersID:int):
        self.peersID = peersID

class channelCloseMsg():
    def __init__(self, peersID:int):
        self.peersID = peersID

class queue():
	def __init__ (self, q:list=[], waiters:list=[], closed:bool=None):
		self.q = q
		self.waiters = waiters
		self.closed = closed

	def push(self, obj):
		if self.closed: raise Exception("closed queue")
		if len(self.waiters) > 0:
			self.waiters.pop(0)(obj)
			return
		self.q.append(obj)

	# first attempt at writing a "promise"

	def shift(self) -> 'asyncio.Future':
		if self.closed: return
		promise = asyncio.Future()
		if self.q:
			promise.set_result(self.q[0])
			return promise
		self.waiters.push(promise.result)
		return promise

	def	close(self):
		if self.closed: return
		for waiter in self.waiters:
			waiter(None)

class Iconn():
	def read(self, len: int) -> 'asyncio.Future':
		read(len)
	def write(self, buffer: list) -> 'asyncio.Future':
		write(buffer)
	def close(self) -> 'Exception':
		close()

class ISession():
	def open() -> 'asyncio.Future':
		open()
	def accept() -> 'asyncio.Future':
		accept()
	def close() -> 'Exception':
		close()

class IChannel():
	def ident() -> int:
		ident()

class Session():
	def __init__(self, conn=Iconn, channels=[], incoming=queue):
		self.conn = conn()
		self.channels = []
		self.incoming = queue()
		#self.loop() <---- so it doesn't throw a RuntimeWarning

	async def readPacket(self):
		sizes = {
			"msgChannelOpen": 12,
			"msgChannelOpenConfirm": 16,
			"msgChannelOpenFailure": 4,
			"msgChannelWindowAdjust": 8,
			"msgChannelData": 8,
			"msgChannelEOF": 4,
			"msgChannelClose": 4,
		}
		msg = await self.conn.read(1)
		if msg == None:
			return
		if msg[0] < msgChannelOpen or msg[0] > msgChannelClose:
			raise Exception("bad packet: %s" % msg[0])
		rest = await self.conn.read(sizes.get(msg[0]))
		if rest == None:
			raise Exception("unexpected EOF")
		if msg[0] == msgChannelData:
			view = DataView(EmptyArray(rest))
			length = view.getUint32(4)
			data = await self.conn.read(length)
			if data == None:
				raise Exception("unexpected EOF")
			return [msg, rest, data, length+len(rest)+1]
		return asyncio.Future.set_result([msg, rest, len(rest)])

	async def handleChannelOpen(self, packet: list):
		msg = ChannelOpenMsg(decode(packet))
		if msg.maxPacketSize < minPacketLength or msg.maxPacketSize > 1<<30:
			await self.conn.write(encode(msgChannelOpenFailure(msg.peersID)))
			return
		c = self.newChannel()
		c.remoteId = msg.peersID
		c.maxRemotePayload = msg.maxPacketSize
		c.remoteWin = msg.peersWindow
		c.maxIncomingPayload = channelMaxPacket
		self.incoming.shift(c)
		await self.conn.write(encode(msgChannelOpenConfirm(c.remoteId, c.localId, c.myWindow, c.maxIncomingPayload)))

	async def open(self):
		ch = self.newChannel()
		ch.maxIncomingPayload = channelMaxPacket
		await self.conn.write(encode(msgChannelOpen(ch.myWindow, ch.maxIncomingPayload, ch.localId)))
		if await ch.ready.pop(0):
			return asyncio.Future.set_result(ch) # ask whether this is correct
		raise Exception("failed to open")

	def newChannel(self) -> 'Channel':
		ch = Channel()
		ch.remoteWin = 0
		ch.myWindow = channelWindowSize
		ch.ready = queue()
		ch.readBuf = []
		ch.readers = []
		ch.session = self
		ch.localId = self.addCh(ch)
		return ch

	async def loop(self):
		try:
			while True:
				packet = await self.readPacket()
				if packet == None:
					self.close()
					return
				if packet[0] == msgChannelOpen:
					await self.handleChannelOpen(packet)
					continue
				data = DataView(EmptyArray(packet))
				id = data.getUint32(1)
				ch = self.getCh(id)
				if ch == None:
					raise Exception("invalid channel (%s) on op %s" % (id, packet[0]))
				await ch.handlePacket(data)
		except:
			raise Exception("session readloop") # not sure how to pass the e argument here

	def getCh(self, id: int) -> 'Channel':
		ch = self.channels[id]
		if ch.localId != id:
			print("bad ids: %s, %s, %s" % (id, ch.localId, ch.remoteId))
		return ch

	def addCh(self, ch: 'Channel') -> int:
		for i, v in enumerate(self.channels):
			if v == None:
				self.channels[i] = ch
				return i
		self.channels.shift(ch)
		return len(self.channels.length)-1

	def rmCh(self, id: int):
		self.channels[id] = None

	def accept(self):
		return asyncio.Future.set_result(self.incoming.pop(0))

	async def close(self):
		for id in self.channels.keys():
			if self.channels[id] == None:
				self.channels[id].shutdown()
		raise Exception("session closed")

class Channel():
	localId = 0
	remoteId = 0
	maxIncomingPayload = 0
	maxRemotePayload = 0
	session = Session()
	ready = queue()
	sentEOF = None
	sentClose = None
	remoteWin = 0
	myWindow = 0
	readBuf = []
	readers = []

	def ident(self) -> int:
		return self.localId

	def sendPacket(self, packet: list):
		if self.sentClose:
			raise Exception("EOF")
		self.sentClose = packet[0] == msgChannelClose
		return asyncio.Future.set_result(self.session.conn.write(packet))
		
	def sendMessage(self, type: int, msg):
		data = DataView(encode(type, msg))
		data.setUint32(1, self.remoteId)
		return asyncio.Future.set_result(self.sendPacket(EmptyArray(data)))

	def handlePacket(self, packet: 'DataView'):
		if packet.getUint8(0) == msgChannelData:
			self.handleData(packet)
			return
		if packet.getUint8(0) == msgChannelClose:
			self.handleClose()
			return
		if packet.getUint8(0) == msgChannelEOF:
			# TODO
			return
		if packet.getUint8(0) == msgChannelOpenFailure:
			fmsg = channelOpenFailureMsg(decode(packet))
			self.session.rmCh(fmsg.peersID)
			self.ready.append(False)
			return
		if packet.getUint8(0) == msgChannelOpenConfirm:
			cmsg = channelOpenConfirmMsg(decode(packet))
			if cmsg.maxPacketSize < minPacketLength or cmsg.maxPacketSize > 1<<30:
				raise Exception("invalid max packet size")
			self.remoteId = cmsg.myID
			self.maxRemotePayload = cmsg.maxPacketSize
			self.remoteWin += cmsg.myWindow
			self.ready.append(True)
			return
		if packet.getUint8(0) == msgChannelWindowAdjust:
			amsg = channelWindowAdjustMsg(decode(packet))
			self.remoteWin += amsg.additionalBytes

	async def handleData(self, packet: 'DataView'):
		length = packet.getUint32(5)
		if length == 0:
			return
		if length > self.maxIncomingPayload:
			raise Exception("incoming packet exceeds maximum payload size")
		data = packet.array[9:] # check this one later
		if self.myWindow < length:
			raise Exception("remote side wrote too much")
		self.myWindow -= length
		self.readBuf = [self.readBuf, data, len(self.readBuf)+len(data)]
		if self.readers.length > 0:
			self.readers.pop(0)()

	async def adjustWindow(self, n: int):
		# TODO
		return
    
	def read(self, length): # so the argument doesn't replace len() function
		def tryRead():
			if not self.readbuf:
				return asyncio.Future.set_result(None)
			if len(self.readbuf):
				data = self.readBuf[0:length]
				self.readBuf = self[length]
				return asyncio.Future.set_result(data)
			self.readers.push(tryRead)

	def write(self, buffer: list):
		if self.sentEOF: raise Exception("EOF")
		header = DataView(EmptyArray(9))
		header.setUint8(0, msgChannelData)
		header.setUint32(1, self.remoteId)
		header.setUint32(5, buffer.byteLength)
		packet = EmptyArray(9+len(buffer))
		packet[0] = header
		packet[9] = buffer
		return asyncio.Future.set_result(self.sendPacket(packet))

	def handleClose():
		raise Exception("channel closed")

	async def close(self):
		if not self.sentClose:
			await self.sendMessage(msgChannelClose(self.remoteId))
			self.sentClose = True
			while await self.ready.shift() != None:
				return
		self.shutdown()
		raise Exception("channel closed")

	def shutdown(self):
		self.readBuf = None
		for reader in self.readers:
			reader()
		self.ready.close()
		self.session.rmCh(self.localId)

	async def closeWrite(self):
		self.sentEOF = True
		await self.sendMessage(msgChannelEOF(self.remoteId))

def encode(type: int, obj) -> list:
	if type == msgChannelClose:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return data
	elif type == msgChannelData:
		datamsg = obj
		data = DataView(EmptyArray(9))
		data.setUint8(0, type)
		data.setUint32(1, datamsg.peersID)
		data.setUint32(5, datamsg.length)
		buf = []
		buf[0] = EmptyArray(len(data))
		buf[9] = datamsg.rest
		return buf
	elif type == msgChannelEOF:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return data
	elif type == msgChannelOpen:
		data = DataView(EmptyArray(13))
		openmsg = obj
		data.setUint8(0, type)
		data.setUint32(1, openmsg.peersID)
		data.setUint32(5, openmsg.peersWindow)
		data.setUint32(9, openmsg.maxPacketSize)
		return data
	elif type == msgChannelOpenConfirm:
		data = DataView(EmptyArray(17))
		confirmmsg = obj
		data.setUint8(0, type)
		data.setUint32(1, confirmmsg.peersID)
		data.setUint32(5, confirmmsg.myID)
		data.setUint32(9, confirmmsg.myWindow)
		data.setUint32(13, confirmmsg.maxPacketSize)
		return data
	elif type == msgChannelOpenFailure:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return data
	elif type == msgChannelWindowAdjust:
		data = DataView(EmptyArray(9))
		adjustmsg = obj
		data.setUint8(0, type)
		data.setUint32(1, adjustmsg.peersID)
		data.setUint32(5, adjustmsg.additionalBytes)
		return data
	else:
		raise Exception("unknown type")

def decode(packet: list):
	packetBuf = EmptyArray(len(packet))
	if packet[0] == msgChannelClose:
		data = DataView(packetBuf)
		closeMsg = channelCloseMsg(data.getUint32(1))
		return closeMsg
	if packet[0] == msgChannelData:
		data = DataView(packetBuf)
		dataLength = data.getUint32(5)
		dataMsg = channelDataMsg(data.getUint32(1), dataLength, EmptyArray(dataLength))
		dataMsg.rest = EmptyArray(9)
		return dataMsg
	if packet[0] == msgChannelEOF:
		data = DataView(packetBuf)
		eofMsg = channelEOFMsg(data.getUint32(1))
		return eofMsg
	if packet[0] == msgChannelOpen:
		data = DataView(packetBuf)
		openMsg = channelOpenMsg(data.getUint32(1), data.getUint32(5), data.getUint32(9))
		return openMsg
	if packet[0] == msgChannelOpenConfirm:
		data = DataView(packetBuf)
		confirmMsg = channelOpenConfirmMsg(data.getUint32(1), data.getUint32(5), data.getUint32(9), data.getUint32(13))
		return confirmMsg
	if packet[0] == msgChannelOpenFailure:
		data = DataView(packetBuf)
		failureMsg = channelOpenFailureMsg(data.getUint32(1))
		return failureMsg
	if packet[0] == msgChannelWindowAdjust:
		data = DataView(packetBuf)
		adjustMsg = channelWindowAdjustMsg(data.getUint32(1), data.getUint32(5))
		return adjustMsg
	else:
		raise Exception("unknown type")
