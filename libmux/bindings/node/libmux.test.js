const libmux = require("./libmux");

const testAddr = "localhost:2111";
const testMessage = "this is a test message";

test("listen and dial over tcp", async () => {
  var listener = await libmux.ListenTCP(testAddr);
  var session = await libmux.DialTCP(testAddr);
  await session.close();
  await listener.close();
});

test("listen and dial over websocket", async () => {
  var listener = await libmux.ListenWebsocket(testAddr);
  var session = await libmux.DialWebsocket(testAddr);
  await session.close();
  await listener.close();
});


test("open, accept, read, write", async () => {
  var listener = await libmux.ListenTCP(testAddr);
  (async () => {
    // the "server"
    var sess = await listener.accept();
    var inputCh = await sess.open();
    var buf = await inputCh.read(testMessage.length);
    var inputMessage = buf.toString('ascii');
    expect(inputMessage).toBe(testMessage);
    await inputCh.close();
    var outputCh = await sess.accept();
    await outputCh.write(Buffer.from(inputMessage));
    await outputCh.close();
    await sess.close();
    await listener.close();
  })();

  // the "client"
  var session = await libmux.DialTCP(testAddr);
  var inputCh = await session.accept();
  await inputCh.write(Buffer.from(testMessage));
  await inputCh.close();
  var outputCh = await session.open();
  var buf = await outputCh.read(testMessage.length);
  var outputMessage = buf.toString('ascii');
  expect(outputMessage).toBe(testMessage);
  await outputCh.close();
  await session.close();
});