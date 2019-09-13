from typing import Callable, Dict, List
from abc import ABC, abstractmethod
from functools import reduce
import asyncio, pdb

class DataView():
	def __init__(self, array, bytes_per_element=1):
		self.array = array
		#self.bytes_per_element = bytes_per_element # should this be re-written?

	def __get_binary(self, start_index, byte_count, signed=False):
		integers = [self.array[start_index] for x in range(byte_count)]
		bytes = [integer.to_bytes(1, byteorder='little', signed=signed) for integer in integers]
		return reduce(lambda a, b: a + b, bytes)

	def getUint8(self, start_index) -> int:
		bytes_to_read = 1
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint8(self, index, number):
		if number > 255 or number < 0:
			number = number % 255
		self.array[index] = number

	def getUint16(self, start_index) -> int:
		bytes_to_read = 2
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint16(self, index, number):
		if number > 65535 or number < 0:
			number = number % 65535
		self.array[index] = number

	def getUint32(self, start_index) -> int:
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
        self.myWindow = myWindow
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

	def shift(self) -> 'asyncio.Future':
		if self.closed: raise Exception("closed queue")
		promise:'asyncio.Future' = asyncio.Future()
		if self.q:
			promise.set_result(self.q[0])
			return promise
		self.waiters.append(promise.result)
		return promise

	def	close(self):
		if self.closed: return
		for waiter in self.waiters:
			waiter(None)

class IConn(ABC):
	@abstractmethod
	async def read(self, length:int) -> 'asyncio.Future':
		pass
	
	@abstractmethod
	def write(self, buffer:bytes) -> 'asyncio.Future':
		pass

	@abstractmethod
	def close(self):
		pass

class TCPConn(IConn):
	def __init__(self, reader, writer):
		self.reader = reader
		self.writer = writer

	async def read(self, length:int) -> 'asyncio.Future':
		return await self.reader.read(length)

	def write(self, buffer:bytes):
		self.writer.write(buffer)

	def close(self):
		self.writer.close()

class Session():
	def __init__(self, conn:'IConn', spawn):
		self.conn = conn
		self.channels:list = []
		self.incoming = queue()
		spawn(self.loop())

	async def readPacket(self) -> 'asyncio.Future':
		sizes = {
			msgChannelOpen: 12,
			msgChannelOpenConfirm: 16,
			msgChannelOpenFailure: 4,
			msgChannelWindowAdjust: 8,
			msgChannelData: 8,
			msgChannelEOF: 4,
			msgChannelClose: 4,
		}
		msg = await self.conn.read(1)
		promise: 'asyncio.Future' = asyncio.Future()
		if msg == None:
			promise.set_result(None)
			return promise
		if msg[0] < msgChannelOpen or msg[0] > msgChannelClose:
			raise Exception("bad packet: %s" % msg[0])
		rest = await self.conn.read(sizes.get(msg[0])) # changes?
		if rest == None:
			raise Exception("unexpected EOF")
		if msg[0] == msgChannelData:
			view = DataView(EmptyArray(rest))
			length = view.getUint32(4)
			data = await self.conn.read(length)
			if data == None:
				raise Exception("unexpected EOF")
			promise.set_result([*msg, *rest, *data]) # change this later
			return promise
		promise.set_result([*msg, *rest]) # this too
		return promise

	async def handleChannelOpen(self, packet: list):
		msg: 'channelOpenMsg' = decode(packet)
		if msg.maxPacketSize < minPacketLength or msg.maxPacketSize > 1<<30:
			await self.conn.write(encode(msgChannelOpenFailure, channelOpenFailureMsg(msg.peersID)))
			return
		c = self.newChannel()
		c.remoteId = msg.peersID
		c.maxRemotePayload = msg.maxPacketSize
		c.remoteWin = msg.peersWindow
		c.maxIncomingPayload = channelMaxPacket
		self.incoming.shift(c)
		await self.conn.write(encode(msgChannelOpenConfirm, channelOpenConfirmMsg(c.remoteId, c.localId, c.myWindow, c.maxIncomingPayload)))

	async def open(self) -> 'asyncio.Future':
		ch = self.newChannel()
		ch.maxIncomingPayload = channelMaxPacket
		await self.conn.write(encode(msgChannelOpen, channelOpenMsg(ch.myWindow, ch.maxIncomingPayload, ch.localId)))
		if await ch.ready.shift():
			promise: 'asyncio.Future' = asyncio.Future()
			promise.set_result(ch)
			return promise
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
				if packet.result()[0] == msgChannelOpen: # added a .result()
					await self.handleChannelOpen(packet)
					continue
				pdb.set_trace()
				data = DataView(packet.result()) # changes
				id = data.getUint32(1)
				pdb.set_trace()
				ch = self.getCh(0) # edit this back to id
				if ch == None:
					raise Exception("invalid channel (%s) on op %s" % (id, packet[0]))
				await ch.handlePacket(data)
		except:
			raise Exception("session readloop")

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

	def accept(self) -> 'asyncio.Future':
		promise: 'asyncio.Future' = asyncio.Future()
		promise.set_result(self.incoming.shift())
		return promise

	async def close(self):
		for id in self.channels.keys():
			if self.channels[id] == None:
				self.channels[id].shutdown()
		raise Exception("session closed")

class Channel():
	localId:int
	remoteId:int
	maxIncomingPayload:int
	maxRemotePayload:int
	session:'Session'
	ready:'queue'
	sentEOF:bool
	sentClose:bool
	remoteWin:int
	myWindow:int
	readBuf:list
	readers:List[Callable]

	def ident(self) -> int:
		return self.localId

	def sendPacket(self, packet: list) -> 'asyncio.Future':
		if self.sentClose:
			raise Exception("EOF")
		self.sentClose = packet[0] == msgChannelClose
		promise: 'asyncio.Future' = asyncio.Future()
		promise.set_result(self.session.conn.write(packet))
		return promise
		
	def sendMessage(self, type: int, msg) -> 'asyncio.Future':
		data = DataView(encode(type, msg))
		data.setUint32(1, self.remoteId)
		promise:'asyncio.Future' = asyncio.Future()
		promise.set_result(self.sendPacket(EmptyArray(data)))
		return promise

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
			fmsg:'channelOpenFailureMsg' = decode(packet.array)
			self.session.rmCh(fmsg.peersID)
			self.ready.push(False)
			return
		if packet.getUint8(0) == msgChannelOpenConfirm:
			cmsg:'channelOpenConfirmMsg' = decode(packet.array)
			if cmsg.maxPacketSize < minPacketLength or cmsg.maxPacketSize > 1<<30:
				raise Exception("invalid max packet size")
			self.remoteId = cmsg.myID
			self.maxRemotePayload = cmsg.maxPacketSize
			self.remoteWin += cmsg.myWindow
			self.ready.push(True)
			return
		if packet.getUint8(0) == msgChannelWindowAdjust:
			amsg:'channelWindowAdjustMsg' = decode(packet.array)
			self.remoteWin += amsg.additionalBytes

	async def handleData(self, packet: 'DataView'):
		length = packet.getUint32(5)
		if length == 0:
			return
		if length > self.maxIncomingPayload:
			raise Exception("incoming packet exceeds maximum payload size")
		data = packet.array[9:]
		if self.myWindow < length:
			raise Exception("remote side wrote too much")
		self.myWindow -= length
		self.readBuf = [self.readBuf, data, len(self.readBuf)+len(data)]
		if self.readers:
			self.readers.pop(0)()

	async def adjustWindow(self, n: int):
		# TODO
		return
    
	def read(self, length) -> 'asyncio.Future':
		promise: 'asyncio.Future' = asyncio.Future()
		def tryRead():
			if self.readbuf:
				promise.set_result(None)
				return promise
			if len(self.readbuf) >= length:
				data = self.readBuf[0:length]
				self.readBuf = self[length]
				promise.set_result(data)
				return promise
			self.readers.append(tryRead)
		promise.set_result(tryRead())
		return promise

	def write(self, buffer: list) -> 'asyncio.Future':
		if self.sentEOF: raise Exception("EOF")
		header = DataView(EmptyArray(9))
		header.setUint8(0, msgChannelData)
		header.setUint32(1, self.remoteId)
		header.setUint32(5, len(buffer))
		packet = EmptyArray(9+len(buffer))
		packet[0] = header.array
		packet[9] = EmptyArray(len(buffer))
		promise: 'asyncio.Future' = asyncio.Future()
		promise.set_result(self.sendPacket(packet))
		return promise

	def handleClose(self):
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
		for reader in self.readers: reader()
		self.ready.close()
		self.session.rmCh(self.localId)

	async def closeWrite(self):
		self.sentEOF = True
		await self.sendMessage(msgChannelEOF, channelEOFMsg(self.remoteId))

def encode(type: int, obj) -> list:
	if type == msgChannelClose:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return data.array
	elif type == msgChannelData:
		data = DataView(EmptyArray(9))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.length)
		buf:list = []
		buf[0] = EmptyArray(len(data.array))
		buf[9] = obj.rest
		return buf
	elif type == msgChannelEOF:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return data.array
	elif type == msgChannelOpen:
		data = DataView(EmptyArray(13))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.peersWindow)
		data.setUint32(9, obj.maxPacketSize)
		return data.array
	elif type == msgChannelOpenConfirm:
		data = DataView(EmptyArray(17))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.myID)
		data.setUint32(9, obj.myWindow)
		data.setUint32(13, obj.maxPacketSize)
		return data.array
	elif type == msgChannelOpenFailure:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return data.array
	elif type == msgChannelWindowAdjust:
		data = DataView(EmptyArray(9))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.additionalBytes)
		return data.array
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
	raise Exception("unknown type")
		
