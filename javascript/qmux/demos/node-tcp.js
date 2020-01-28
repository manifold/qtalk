var qmux = require('qmux');
var net = require('net');

(async () => {

    var listener = await qmux.ListenTCP(7000);

    (async () => {
        var sess = await listener.accept();
        var ch = await sess.open();
        console.log("|Server echoing on channel...");
        while(true) {
            var data = await ch.read(1);
            if (data === undefined) {
                console.log("|Server got EOF");
                break;
            }
            await ch.write(data);
        }
        await listener.close();
    })();

    
    var sess = new qmux.Session(await qmux.DialTCP(7000));
    var ch = await sess.accept();
    await ch.write(Buffer.from("Hello"));
    await ch.write(Buffer.from(" "));
    await ch.write(Buffer.from("world"));
    
    var data = await ch.read(11);
    console.log(data.toString('ascii'));

    await sess.close();

})().catch(async (err) => { 
    console.log(err.stack);
});


