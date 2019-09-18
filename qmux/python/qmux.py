from typing import Callable, Dict, List
from abc import ABC, abstractmethod
from functools import reduce
import asyncio, pdb

class DataView():
	def __init__(self, buffer, bytes_per_element=1):
		self.buffer = buffer
		self.bytes_per_element = bytes_per_element # should this be re-written?

	def __get_binary(self, start_index, byte_count, signed=False):
		integers = [self.buffer[start_index] for x in range(byte_count)]
		bytes_list = [integer.to_bytes(self.bytes_per_element, byteorder='little', signed=signed) for integer in integers]
		return reduce(lambda a, b: a + b, bytes_list)

	def getUint8(self, start_index) -> int:
		bytes_to_read = 1
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint8(self, index, number):
		if number > 255 or number < 0:
			number = number % 255
		self.buffer[index] = number

	def getUint16(self, start_index) -> int:
		bytes_to_read = 2
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint16(self, index, number):
		if number > 65535 or number < 0:
			number = number % 65535
		self.buffer[index] = number

	def getUint32(self, start_index) -> int:
		bytes_to_read = 4
		return int.from_bytes(self.__get_binary(start_index, bytes_to_read), byteorder='little')

	def setUint32(self, index, number):
		if number > 4294967295 or number < 0:
			number = number % 4294967295
		self.buffer[index] = number

def EmptyArray(length):
	return [0] * length # changed None to 0 so it could work with DataView

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
	def __init__(self, peersWindow:int, maxPacketSize:int, peersID:int):
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
	def __init__ (self, q:list=[], waiters:List[Callable]=[], closed:bool=None):
		self.q = q
		self.waiters = waiters
		self.closed = closed

	def push(self, obj):
		if self.closed: raise Exception("closed queue")
		if len(self.waiters) > 0:
			self.waiters.pop(0).result()(obj)
			return
		self.q.append(obj)

	def shift(self) -> 'asyncio.Future':
		if self.closed: return
		promise:'asyncio.Future' = asyncio.Future()
		if len(self.q) > 0:
			promise.set_result(self.q[0])
			return promise
		else:
			promise.set_result(None)
		self.waiters.append(promise)
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
		# TODO: think about draining
		self.writer.write(buffer)

	def close(self):
		self.writer.close()

class Session():
	def __init__(self, conn:'IConn', spawn):
		self.conn = conn
		self.channels:list = []
		self.incoming = queue()
		self.spawn = spawn # so we could convert coroutines to futures later on
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
			print(promise.result())
			return promise
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
			promise.set_result([*msg, *rest, *data])
			print(promise.result())
			return promise
		promise.set_result([*msg, *rest])
		print(promise.result())
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
		self.incoming.push(c)
		await self.conn.write(encode(msgChannelOpenConfirm, channelOpenConfirmMsg(c.remoteId, c.localId, c.myWindow, c.maxIncomingPayload)))

	async def open(self) -> 'asyncio.Future':
		ch = self.newChannel()
		ch.maxIncomingPayload = channelMaxPacket
		await self.conn.write(encode(msgChannelOpen, channelOpenMsg(ch.myWindow, ch.maxIncomingPayload, ch.localId))) # this long call returns a None, can't use await
		if ch.ready.shift(): # removed await before ch.ready.shift (shift is not async so i guess it shouldn't be here)
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
				packet = self.spawn(self.readPacket()) # try to make this return a result
				if packet == None:
					self.close()
					return
				if packet.result()[0] == msgChannelOpen: # result is not set therefore can't be used
					await self.handleChannelOpen(packet)
					continue
				data = DataView(packet.result())
				id = data.getUint32(1)
				ch = self.getCh(id)
				if ch == None:
					raise Exception("invalid channel (%s) on op %s" % (id, packet[0]))
				ch.handlePacket(data) # removed await because ch.handlePacket returns None
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
		self.channels.append(ch)
		return len(self.channels)-1

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
			fmsg:'channelOpenFailureMsg' = decode(packet.buffer)
			self.session.rmCh(fmsg.peersID)
			self.ready.push(False)
			return
		if packet.getUint8(0) == msgChannelOpenConfirm:
			cmsg:'channelOpenConfirmMsg' = decode(packet.buffer)
			if cmsg.maxPacketSize < minPacketLength or cmsg.maxPacketSize > 1<<30:
				raise Exception("invalid max packet size")
			self.remoteId = cmsg.myID
			self.maxRemotePayload = cmsg.maxPacketSize
			self.remoteWin += cmsg.myWindow
			self.ready.push(True)
			return
		if packet.getUint8(0) == msgChannelWindowAdjust:
			amsg:'channelWindowAdjustMsg' = decode(packet.buffer)
			self.remoteWin += amsg.additionalBytes

	async def handleData(self, packet: 'DataView'):
		length = packet.getUint32(5)
		if length == 0:
			return
		if length > self.maxIncomingPayload:
			raise Exception("incoming packet exceeds maximum payload size")
		data = packet.buffer[9:]
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
		packet[0] = header.buffer
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

def encode(type: int, obj) -> bytes:
	if type == msgChannelClose:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return bytes(data.buffer)
	elif type == msgChannelData:
		data = DataView(EmptyArray(9))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.length)
		buf:list = EmptyArray(9+obj.length)
		buf[0] = data.buffer
		buf[9] = obj.rest
		return bytes(buf)
	elif type == msgChannelEOF:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return bytes(data.buffer)
	elif type == msgChannelOpen:
		data = DataView(EmptyArray(13))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.peersWindow)
		data.setUint32(9, obj.maxPacketSize)
		data_in_bytes_list = [integer.to_bytes(4, byteorder='little') for integer in data.buffer] 
		data_in_bytes = reduce(lambda a, b: a + b, data_in_bytes_list)
		return data_in_bytes
	elif type == msgChannelOpenConfirm:
		data = DataView(EmptyArray(17))	
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.myID)
		data.setUint32(9, obj.myWindow)
		data.setUint32(13, obj.maxPacketSize)
		return bytes(data.buffer)
	elif type == msgChannelOpenFailure:
		data = DataView(EmptyArray(5))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		return bytes(data.buffer)
	elif type == msgChannelWindowAdjust:
		data = DataView(EmptyArray(9))
		data.setUint8(0, type)
		data.setUint32(1, obj.peersID)
		data.setUint32(5, obj.additionalBytes)
		return bytes(data.buffer)
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
		
