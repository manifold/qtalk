from typing import Callable, Dict, List
from abc import ABC, abstractmethod
from functools import reduce
import asyncio

class DataView():
    def __init__(self, buffer):
        self.buffer = [element.to_bytes(1, 'little') for element in buffer] # changed bytes(element) to element.to_bytes so 0 is converted into b'\x00' instead of b'' (None)

    def get_uint_8(self, index):
        try:
            return int.from_bytes(int.from_bytes(self.buffer[index], 'big').to_bytes(1, 'little'), 'big')
        except OverflowError:
            if int.from_bytes(self.buffer[index], 'big') <= 65535:
                return int.from_bytes(int.from_bytes(self.buffer[index], 'big').to_bytes(2, 'little'), 'little') // 256
            return int.from_bytes(int.from_bytes(self.buffer[index], 'big').to_bytes(4, 'little'), 'big') // 4294967296

    def set_uint_8(self, index, number):
        if number > 255 or number < 0:
            number = 0
        self.buffer[index] = number.to_bytes(1, 'little')

    def get_uint_16(self, index):
        try:
            if int.from_bytes(self.buffer[index], 'big') <= 255:
                return int.from_bytes(int.from_bytes(self.buffer[index], 'big').to_bytes(2, 'little'), 'big')
            return int.from_bytes(int.from_bytes(self.buffer[index], 'big').to_bytes(2, 'little'), 'big')
        except OverflowError:
            return int.from_bytes(int.from_bytes(self.buffer[index], 'big').to_bytes(4, 'little'), 'big') // 65536


    def set_uint_16(self, index, number):
        if number > 65535 or number < 0:
            number = 0
        self.buffer[index] = number.to_bytes(2, 'little')

    def get_uint_32(self, index):
        return int.from_bytes(int.from_bytes(self.buffer[index], 'big').to_bytes(4, 'little'), 'big')

    def set_uint_32(self, index, number):
        if number > 4294967295 or number < 0:
            number = 0
        self.buffer[index] = number.to_bytes(4, 'little')

    def bytes(self):
        return reduce(lambda a, b: a + b, self.buffer)

#    def from_bytes(self):
#        return [int.from_bytes(element, 'little') for element in self.buffer]

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
    def __init__(self, peers_window: int, max_packet_size: int, peers_id: int):
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
    def __init__(self, q: list = [], waiters: List[Callable] = [], closed: bool = None):
        self.q = q
        self.waiters = waiters
        self.closed = closed

    def push(self, obj):
        if self.closed:
            raise Exception("closed Queue")
        if self.waiters:
            self.waiters.pop(0).set_result(obj)
            return
        self.q.append(obj)

    def shift(self) -> 'asyncio.Future':
        promise: 'asyncio.Future' = asyncio.Future()
        if self.closed:
            return promise
        if self.q:
            promise.set_result(self.q.pop(0))
            return promise
        self.waiters.append(promise)
        return promise

    def close(self):
        if self.closed:
            return
        for waiter in self.waiters:
            waiter(None)

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

    async def read(self, length: int) -> 'asyncio.Future': # should this return a future?
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
            view = DataView(empty_array(rest))
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
        c = self.new_channel()
        c.remote_id = msg.peers_id
        c.max_remote_pay_load = msg.max_packet_size
        c.remote_win = msg.peers_window
        c.max_incoming_pay_load = CHANNEL_MAX_PACKET
        self.incoming.push(c)
        await self.conn.write(encode(MSG_CHANNEL_OPEN_CONFIRM, ChannelOpenConfirmMsg(c.remote_id, c.local_id, c.my_window, c.max_incoming_pay_load)))

    async def open(self):
        ch = self.new_channel()
        ch.max_incoming_pay_load = CHANNEL_MAX_PACKET
        await self.conn.write(encode(MSG_CHANNEL_OPEN, ChannelOpenMsg(ch.my_window, ch.max_incoming_pay_load, ch.local_id)))
        if ch.ready.shift():
            return ch
        raise Exception("failed to open")

    def new_channel(self) -> 'Channel':
        ch = Channel()
        ch.remote_win = 0
        ch.my_window = CHANNEL_WINDOW_SIZE
        ch.ready = Queue()
        ch.read_buf = []
        ch.readers = []
        ch.session = self
        ch.local_id = self.addCh(ch)
        return ch

    async def loop(self):
        try:
            while True:
                packet = await self.read_packet()
                if not packet.result():
                    self.close()
                    return
                try:
                    if packet.result()[0] == MSG_CHANNEL_OPEN:
                        await self.handle_channel_open(packet.result())
                        continue
                except TypeError:
                    pass
                data = DataView(packet.result())
                id = data.get_uint_32(1)
                ch = self.getCh(id)
                if not ch:
                    raise Exception("invalid channel (%s) on op %s" % (id, packet[0]))
                ch.handle_packet(data)
        except:
            raise Exception("session readloop")

    def getCh(self, id: int) -> 'Channel':
        ch = self.channels[id]
        if ch.local_id != id:
            print("bad ids: %s, %s, %s" % (id, ch.local_id, ch.remote_id))
        return ch

    def addCh(self, ch: 'Channel') -> int:
        for i, v in enumerate(self.channels):
            if not v:
                self.channels[i] = ch
                return i
        self.channels.append(ch)
        return len(self.channels)-1

    def rm_ch(self, id: int):
        self.channels[id] = None

    async def accept(self):
        return await self.incoming.shift()

    def close(self):
        for id in range(len(self.channels)-1):
            if not self.channels[id]:
                self.channels[id].shutdown()
        self.conn.close()

class Channel():
    local_id = 0
    remote_id = 0
    max_incoming_pay_load = 0
    max_remote_pay_load = 0
    session = Session
    ready = Queue
    sent_EOF = None
    got_EOF = None
    sent_close = None
    remote_win = 0
    my_window = 0
    read_buf: list = []
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

    def send_message(self, type: int, msg) -> 'asyncio.Future':
        data = DataView(encode(type, msg))
        data.set_uint_32(1, self.remote_id)
        promise: 'asyncio.Future' = asyncio.Future()
        promise.set_result(self.send_packet(empty_array(len(data.buffer))))
        return promise

    def handle_packet(self, packet: 'DataView'):
        if packet.get_uint_8(0) == MSG_CHANNEL_DATA:
            self.handle_data(packet)
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_CLOSE:
            self.handle_close()
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_EOF:
            # TODO
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_OPEN_FAILURE:
            fmsg: 'ChannelOpenFailureMsg' = decode(packet.buffer)
            self.session.rm_ch(fmsg.peers_id) # fix this one later
            self.ready.push(False) # fix this one later
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_OPEN_CONFIRM:
            cmsg: 'ChannelOpenConfirmMsg' = decode(packet.buffer)
            if cmsg.max_packet_size < MIN_PACKET_LENGTH or cmsg.max_packet_size > 1<<30:
                raise Exception("invalid max packet size")
            self.remote_id = cmsg.my_id
            self.max_remote_pay_load = cmsg.max_packet_size
            self.remote_win += cmsg.my_window
            self.ready.push(True) # fix this one later
            return
        if packet.get_uint_8(0) == MSG_CHANNEL_WINDOW_ADJUST:
            amsg: 'ChannelWindowAdjustMsg' = decode(packet.buffer)
            self.remote_win += amsg.additional_bytes

    async def handle_data(self, packet: 'DataView'):
        length = packet.get_uint_32(5)
        if length == 0:
            return
        if length > self.max_incoming_pay_load:
            raise Exception("incoming packet exceeds maximum payload size")
        data = packet.buffer[9:]
        if self.my_window < length:
            raise Exception("remote side wrote too much")
        self.my_window -= length
        self.read_buf = [self.read_buf, data, len(self.read_buf)+len(data)]
        if self.readers:
            self.readers.pop(0)()

    async def adjust_window(self, num: int):
        # TODO
        return num

    def read(self, length) -> 'asyncio.Future':
        def try_read():
            promise: 'asyncio.Future' = asyncio.Future()
            if not self.read_buf:
                promise.set_result(None)
                return promise
            if len(self.read_buf) >= length:
                data = self.read_buf[0:length]
                self.read_buf = self.read_buf[:length]
                promise.set_result(data)
                if not self.read_buf and self.got_EOF:
                    self.read_buf = None
                return promise
            self.readers.append(try_read)
        return try_read()

    def write(self, buffer: list) -> 'asyncio.Future':
        if self.sent_EOF:
            raise Exception("EOF")
        header = DataView(empty_array(9))
        header.set_uint_8(0, MSG_CHANNEL_DATA)
        header.set_uint_32(1, self.remote_id)
        header.set_uint_32(5, len(buffer))
        packet = empty_array(9+len(buffer))
        packet[0] = header.buffer
        packet[9] = empty_array(len(buffer))
        actual_packet = [*header.buffer, *empty_array(8), *packet[9], *empty_array(len(buffer))]
        actual_packet = reduce(lambda a, b: a + b, [bytes(element) for element in actual_packet]) # check whether this should return a list or a bytes-like string
        promise: 'asyncio.Future' = asyncio.Future()
        promise.set_result(self.send_packet(actual_packet))
        return promise

    def handle_close(self):
        raise Exception("channel closed")

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

def encode(type: int, obj) -> bytes:
    if type == MSG_CHANNEL_CLOSE:
        data = DataView(empty_array(5))
        data.set_uint_8(0, type)
        data.set_uint_32(1, obj.peers_id)
        return data.bytes()
    if type == MSG_CHANNEL_DATA:
        data = DataView(empty_array(9))
        data.set_uint_8(0, type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.length)
        buf: list = empty_array(9+obj.length)
        buf[0] = data.buffer
        buf[9] = obj.rest
        return bytes(buf)
    if type == MSG_CHANNEL_EOF:
        data = DataView(empty_array(5))
        data.set_uint_8(0, type)
        data.set_uint_32(1, obj.peers_id)
        return data.bytes()
    if type == MSG_CHANNEL_OPEN:
        data = DataView(empty_array(13))
        data.set_uint_8(0, type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.peers_window)
        data.set_uint_32(9, obj.max_packet_size)
        return data.bytes()
    if type == MSG_CHANNEL_OPEN_CONFIRM:
        data = DataView(empty_array(17))
        data.set_uint_8(0, type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.my_id)
        data.set_uint_32(9, obj.my_window)
        data.set_uint_32(13, obj.max_packet_size)
        return data.bytes()
    if type == MSG_CHANNEL_OPEN_FAILURE:
        data = DataView(empty_array(5))
        data.set_uint_8(0, type)
        data.set_uint_32(1, obj.peers_id)
        return data.bytes()
    if type == MSG_CHANNEL_WINDOW_ADJUST:
        data = DataView(empty_array(9))
        data.set_uint_8(0, type)
        data.set_uint_32(1, obj.peers_id)
        data.set_uint_32(5, obj.additional_bytes)
        return data.bytes()
    raise Exception("unknown type")

def decode(packet: list):
    element = int.from_bytes(packet[0], 'little')
    data = DataView([]) # since packet is a bytes list, we can't use it as the argument in DataView. (can't convert bytes with to_bytes again)
    if element == MSG_CHANNEL_CLOSE:
        data.buffer = packet
        close_msg = ChannelCloseMsg(data.get_uint_32(1))
        return close_msg
    if element == MSG_CHANNEL_DATA:
        data.buffer = packet
        data_length = data.get_uint_32(5)
        dataMsg = ChannelDataMsg(data.get_uint_32(1), data_length, empty_array(data_length))
        dataMsg.rest = empty_array(9)
        return dataMsg
    if element == MSG_CHANNEL_EOF:
        data.buffer = packet
        eof_msg = ChannelEOFMsg(data.get_uint_32(1))
        return eof_msg
    if element == MSG_CHANNEL_OPEN:
        data.buffer = packet
        open_msg = ChannelOpenMsg(data.get_uint_32(1), data.get_uint_32(5), data.get_uint_32(9))
        return open_msg
    if element == MSG_CHANNEL_OPEN_CONFIRM:
        data.buffer = packet
        confirm_msg = ChannelOpenConfirmMsg(data.get_uint_32(1), data.get_uint_32(5), data.get_uint_32(9), data.get_uint_32(13))
        return confirm_msg
    if element == MSG_CHANNEL_OPEN_FAILURE:
        data.buffer = packet
        failure_msg = ChannelOpenFailureMsg(data.get_uint_32(1))
        return failure_msg
    if element == MSG_CHANNEL_WINDOW_ADJUST:
        data.buffer = packet
        adjust_msg = ChannelWindowAdjustMsg(data.get_uint_32(1), data.get_uint_32(5))
        return adjust_msg
    raise Exception("unknown type")
