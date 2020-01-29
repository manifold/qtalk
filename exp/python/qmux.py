from typing import Callable, List
from abc import ABC, abstractmethod
from functools import reduce
import asyncio, pdb
import struct

class DataView():
    def __init__(self, buffer):
        self.buffer = [element.to_bytes(1, 'big') for element in buffer]

    def get_uint_8(self, index):
        return struct.unpack('>B', self.buffer[index])[0]

    def set_uint_8(self, index, number):
        if number > 255 or number < 0:
            number = number % 255
        self.buffer[index] = struct.pack(">B", number)

    def get_uint_16(self, index):
        byte_list = []
        for byte in self.buffer[index:index+2]:
            byte_list.append(byte)
        return struct.unpack('>H', reduce(lambda a, b: a + b, byte_list))[0]

    def set_uint_16(self, index, number):
        struct_bytes = struct.pack('>H', number)
        for byte_index, byte in enumerate(struct_bytes):
            self.buffer[index+byte_index] = struct.pack(">B", byte)

    def get_uint_32(self, index):
        byte_list = []
        for byte in self.buffer[index:index+4]:
            byte_list.append(byte)
        return struct.unpack('>L', reduce(lambda a, b: a + b, byte_list))[0]

    def set_uint_32(self, index, number):
        struct_bytes = struct.pack('>L', number)
        for byte_index, byte in enumerate(struct_bytes):
            self.buffer[index+byte_index] = struct.pack(">B", byte)

    def bytes(self):
        return reduce(lambda a, b: a + b, self.buffer)

def empty_array(length):
    return [0] * length

MSG_CHANNEL_OPEN = 100
MSG_CHANNEL_OPEN_CONFIRM = 101
MSG_CHANNEL_OPEN_FAILURE = 102
MSG_CHANNEL_WINDOW_ADJUST = 103
MSG_CHANNEL_DATA = 104
MSG_CHANNEL_EOF = 105
MSG_CHANNEL_CLOSE = 106

MIN_PACKET_LENGTH = 9
CHANNEL_MAX_PACKET = 1 << 15
CHANNEL_WINDOW_SIZE = 64 * CHANNEL_MAX_PACKET

class ChannelOpenMsg():
    def __init__(self, peers_id: int, peers_window: int, max_packet_size: int):
        self.peers_id = peers_id
        self.peers_window = peers_window
        self.max_packet_size = max_packet_size

class ChannelOpenConfirmMsg():
    def __init__(self, peers_id: int, my_id: int, my_window: int, max_packet_size: int):
        self.peers_id = peers_id
        self.my_id = my_id
        self.my_window = my_window
        self.max_packet_size = max_packet_size

class ChannelOpenFailureMsg():
    def __init__(self, peers_id: int):
        self.peers_id = peers_id

class ChannelWindowAdjustMsg():
    def __init__(self, peers_id: int, additional_bytes: int):
        self.peers_id = peers_id
        self.additional_bytes = additional_bytes

class ChannelDataMsg():
    def __init__(self, peers_id: int, length: int, rest: list):
        self.peers_id = peers_id
        self.length = length
        self.rest = rest

class ChannelEOFMsg():
    def __init__(self, peers_id: int):
        self.peers_id = peers_id

class ChannelCloseMsg():
    def __init__(self, peers_id: int):
        self.peers_id = peers_id

class Queue():
    def __init__(self):
        self.queue = []
        self.waiters = []
        self.closed = False

    def push(self, obj):
        if self.closed:
            raise Exception("closed Queue")
        if self.waiters:
            self.waiters.pop(0).set_result(obj)
            return
        self.queue.append(obj)

    def shift(self) -> 'asyncio.Future':
        promise: 'asyncio.Future' = asyncio.Future()
        if self.closed:
            return promise
        if self.queue:
            promise.set_result(self.queue.pop(0))
            return promise
        self.waiters.append(promise)
        return promise

    def close(self):
        if self.closed:
            return
        self.closed = True
        for waiter in self.waiters:
            waiter.cancel()

class IConn(ABC):
    @abstractmethod
    async def read(self, length: int) -> 'asyncio.Future':
        pass

    @abstractmethod
    def write(self, buffer: bytes) -> 'asyncio.Future':
        pass

    @abstractmethod
    def close(self):
        pass

class TCPConn(IConn):
    def __init__(self, reader, writer):
        self.reader = reader
        self.writer = writer

    async def read(self, length: int) -> 'asyncio.Future':
        try:            
            return await self.reader.read(length)
        except ConnectionResetError:
            return []

    def write(self, buffer: bytes) -> 'asyncio.Future':
        # TODO: think about draining
        self.writer.write(buffer)
        promise: 'asyncio.Future' = asyncio.Future()
        promise.set_result(len(buffer))
        return promise

    def close(self):
        self.writer.close()

class Session():
    def __init__(self, conn: 'IConn', spawn):
        self.conn = conn
        self.channels: list = []
        self.incoming = Queue()
        self.spawn = spawn
        spawn(self.loop())

    @asyncio.coroutine
    def read_packet(self) -> 'asyncio.Future':
        sizes = {
            MSG_CHANNEL_OPEN: 12,
            MSG_CHANNEL_OPEN_CONFIRM: 16,
            MSG_CHANNEL_OPEN_FAILURE: 4,
            MSG_CHANNEL_WINDOW_ADJUST: 8,
            MSG_CHANNEL_DATA: 8,
            MSG_CHANNEL_EOF: 4,
            MSG_CHANNEL_CLOSE: 4,
        }
        msg = yield from self.conn.read(1)
        promise: 'asyncio.Future' = asyncio.Future()
        if not msg:
            promise.set_result(None)
            return promise
        if msg[0] < MSG_CHANNEL_OPEN or msg[0] > MSG_CHANNEL_CLOSE:
            raise Exception("bad packet: %s" % msg[0])
        rest = yield from self.conn.read(sizes.get(msg[0]))
        if not rest:
            raise Exception("unexpected EOF")
        if msg[0] == MSG_CHANNEL_DATA:
            view = DataView(rest)
            length = view.get_uint_32(4)
            data = yield from self.conn.read(length)
            if not data:
                raise Exception("unexpected EOF")
            promise.set_result([*msg, *rest, *data])
            return promise
        promise.set_result([*msg, *rest])
        return promise

    async def handle_channel_open(self, packet: list):
        msg: 'ChannelOpenMsg' = decode(packet)
        if msg.max_packet_size < MIN_PACKET_LENGTH or msg.max_packet_size > 1<<30:
            await self.conn.write(encode(MSG_CHANNEL_OPEN_FAILURE, ChannelOpenFailureMsg(msg.peers_id)))
            return
        channel = self.new_channel()
        channel.remote_id = msg.peers_id
        channel.max_remote_pay_load = msg.max_packet_size
        channel.remote_win = msg.peers_window
        channel.max_incoming_pay_load = CHANNEL_MAX_PACKET
        self.incoming.push(channel)
        await self.conn.write(encode(MSG_CHANNEL_OPEN_CONFIRM, ChannelOpenConfirmMsg(channel.remote_id, channel.local_id, channel.my_window, channel.max_incoming_pay_load)))

    async def open(self) -> 'asyncio.Future':
        channel = self.new_channel()
        channel.max_incoming_pay_load = CHANNEL_MAX_PACKET
        await self.conn.write(encode(MSG_CHANNEL_OPEN, ChannelOpenMsg(channel.local_id, channel.my_window, channel.max_incoming_pay_load)))
        if await channel.ready.shift():
            return channel
        raise Exception("failed to open")

    def new_channel(self) -> 'Channel':
        channel = Channel()
        channel.remote_win = 0
        channel.my_window = CHANNEL_WINDOW_SIZE
        channel.ready = Queue()
        channel.read_buf = bytearray()
        channel.readers = []
        channel.session = self
        channel.local_id = self.add_ch(channel)
        return channel

    async def loop(self):
        try:
            while True:
                packet = await self.read_packet()
                if not packet.result():
                    self.close()
                    return
                data = DataView(packet.result())
                if packet.result()[0] == MSG_CHANNEL_OPEN:
                    await self.handle_channel_open(data.buffer)
                    continue
                data_id = data.get_uint_32(1)
                channel = self.get_ch(data_id)
                if not channel:
                    raise Exception("invalid channel (%s) on op %s" % (data_id, packet[0]))
                await channel.handle_packet(data)
        except:
            raise Exception("session readloop")

    def get_ch(self, channel_id: int) -> 'Channel':
        channel = self.channels[channel_id]
        if channel.local_id != channel_id:
            print("bad ids: %s, %s, %s" % (channel_id, channel.local_id, channel.remote_id))
        return channel

    def add_ch(self, channel: 'Channel') -> int:
        for i, var in enumerate(self.channels):
            if not var:
                self.channels[i] = channel
                return i
        self.channels.append(channel)
        return len(self.channels)-1

    def rm_ch(self, channel_id: int):
        self.channels[channel_id] = None

    async def accept(self) -> 'asyncio.Future':
        return await self.incoming.shift()

    def close(self):
        for channel_id in range(len(self.channels)-1):
            if not self.channels[channel_id]:
                self.channels[channel_id].shutdown()
        self.conn.close()

class Channel():
    local_id = 0
    remote_id = 0
    max_incoming_pay_load = 0
    max_remote_pay_load = 0
    session = None
    ready = None
    sent_EOF = None
    got_EOF = None
    sent_close = None
    remote_win = 0
    my_window = 0
    read_buf = bytearray()
    readers: List[Callable]

    def ident(self) -> int:
        return self.local_id

    def send_packet(self, packet: list) -> 'asyncio.Future':
        if self.sent_close:
            raise Exception("EOF")
        self.sent_close = packet[0] == MSG_CHANNEL_CLOSE
        promise: 'asyncio.Future' = asyncio.Future()
        promise.set_result(self.session.conn.write(bytes(packet)))
        return promise

    def send_message(self, number: int, msg) -> 'asyncio.Future':
        data = DataView(encode(number, msg))
        data.set_uint_32(1, self.remote_id)
        promise: 'asyncio.Future' = asyncio.Future()
        promise.set_result(self.send_packet(data.bytes()))
        return promise

    async def handle_packet(self, packet: 'DataView'):
        if packet.get_uint_8(0) == MSG_CHANNEL_DATA:
            await self.handle_data(packet)
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_CLOSE:
            self.handle_close()
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_EOF:
            self.got_EOF = True
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_OPEN_FAILURE:
            fmsg: 'ChannelOpenFailureMsg' = decode(packet.buffer)
            self.session.rm_ch(fmsg.peers_id)
            self.ready.push(False)
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_OPEN_CONFIRM:
            cmsg: 'ChannelOpenConfirmMsg' = decode(packet.buffer)
            if cmsg.max_packet_size < MIN_PACKET_LENGTH or cmsg.max_packet_size > 1<<30:
                raise Exception("invalid max packet size")
            self.remote_id = cmsg.my_id
            self.max_remote_pay_load = cmsg.max_packet_size
            self.remote_win += cmsg.my_window
            self.ready.push(True)
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_WINDOW_ADJUST:
            amsg: 'ChannelWindowAdjustMsg' = decode(packet.buffer)
            self.remote_win += amsg.additional_bytes

    async def handle_data(self, packet: 'DataView'):
        length = packet.get_uint_32(5)
        if not length:
            return
        if length > self.max_incoming_pay_load:
            raise Exception("incoming packet exceeds maximum payload size")
        data = packet.buffer[9:]
        if self.my_window < length:
            raise Exception("remote side wrote too much")
        self.my_window -= length
        for element in data:
            self.read_buf.extend(element)
        if self.readers:
            self.readers.pop(0)()

    async def adjust_window(self, num: int):
        # TODO
        return num

    def read(self, length) -> 'asyncio.Future':
        promise: 'asyncio.Future' = asyncio.Future()
        def try_read():
            if self.read_buf is None:
                promise.set_result(None)
                return promise
            if len(self.read_buf) >= length:
                data = self.read_buf[0:length]
                self.read_buf = self.read_buf[length:]
                promise.set_result(data)
                if not self.read_buf and self.got_EOF:
                    self.read_buf = None
                return promise
            self.readers.append(try_read)
            return promise
        return try_read()

    def write(self, buffer: list) -> 'asyncio.Future':
        if self.sent_EOF:
            raise Exception("EOF")
        header = DataView(empty_array(9))
        header.set_uint_8(0, MSG_CHANNEL_DATA)
        header.set_uint_32(1, self.remote_id)
        header.set_uint_32(5, len(buffer))
        promise: 'asyncio.Future' = asyncio.Future()
        promise.set_result(self.send_packet(header.bytes()+buffer))
        return promise

    def handle_close(self):
        self.session.spawn(self.close())

    async def close(self):
        if not self.sent_close:
            await self.send_message(MSG_CHANNEL_CLOSE, ChannelCloseMsg(self.remote_id))
            self.sent_close = True
            while await self.ready.shift():
                return
        self.shutdown()

    def shutdown(self):
        self.read_buf = None
        for reader in self.readers:
            reader()
        self.ready.close()
        self.session.rm_ch(self.local_id)

    async def close_write(self):
        self.sent_EOF = True
        await self.send_message(MSG_CHANNEL_EOF, ChannelEOFMsg(self.remote_id))

def encode(msg_type: int, obj) -> bytes:
    if msg_type == MSG_CHANNEL_CLOSE:
        data = DataView(empty_array(5))
        data.set_uint_8(0, msg_type)
        data.set_uint_32(1, obj.peers_id)
        return data.bytes()
    if msg_type == MSG_CHANNEL_DATA:
        data = DataView(empty_array(9))
        data.set_uint_8(0, msg_type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.length)
        buf = empty_array(9+obj.length)
        buf[0] = data.buffer
        buf[9] = obj.rest
        return bytes(buf)
    if msg_type == MSG_CHANNEL_EOF:
        data = DataView(empty_array(5))
        data.set_uint_8(0, msg_type)
        data.set_uint_32(1, obj.peers_id)
        return data.bytes()
    if msg_type == MSG_CHANNEL_OPEN:
        data = DataView(empty_array(13))
        data.set_uint_8(0, msg_type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.peers_window)
        data.set_uint_32(9, obj.max_packet_size)
        return data.bytes()
    if msg_type == MSG_CHANNEL_OPEN_CONFIRM:
        data = DataView(empty_array(17))
        data.set_uint_8(0, msg_type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.my_id)
        data.set_uint_32(9, obj.my_window)
        data.set_uint_32(13, obj.max_packet_size)
        return data.bytes()
    if msg_type == MSG_CHANNEL_OPEN_FAILURE:
        data = DataView(empty_array(5))
        data.set_uint_8(0, msg_type)
        data.set_uint_32(1, obj.peers_id)
        return data.bytes()
    if msg_type == MSG_CHANNEL_WINDOW_ADJUST:
        data = DataView(empty_array(9))
        data.set_uint_8(0, msg_type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.additional_bytes)
        return data.bytes()
    raise Exception("unknown type")

def decode(packet: list):
    element = int.from_bytes(packet[0], 'big')
    data = DataView([])
    data.buffer = packet
    if element == MSG_CHANNEL_CLOSE:
        close_msg = ChannelCloseMsg(data.get_uint_32(1))
        return close_msg
    if element == MSG_CHANNEL_DATA:
        data_length = data.get_uint_32(5)
        data_msg = ChannelDataMsg(data.get_uint_32(1), data_length, empty_array(data_length))
        data_msg.rest = data.buffer[9:]
        return data_msg
    if element == MSG_CHANNEL_EOF:
        eof_msg = ChannelEOFMsg(data.get_uint_32(1))
        return eof_msg
    if element == MSG_CHANNEL_OPEN:
        open_msg = ChannelOpenMsg(data.get_uint_32(1), data.get_uint_32(5), data.get_uint_32(9))
        return open_msg
    if element == MSG_CHANNEL_OPEN_CONFIRM:
        confirm_msg = ChannelOpenConfirmMsg(data.get_uint_32(1), data.get_uint_32(5), data.get_uint_32(9), data.get_uint_32(13))
        return confirm_msg
    if element == MSG_CHANNEL_OPEN_FAILURE:
        failure_msg = ChannelOpenFailureMsg(data.get_uint_32(1))
        return failure_msg
    if element == MSG_CHANNEL_WINDOW_ADJUST:
        adjust_msg = ChannelWindowAdjustMsg(data.get_uint_32(1), data.get_uint_32(5))
        return adjust_msg
    raise Exception("unknown type")
