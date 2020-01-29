var qmux = require('../dist/qmux_node');
var net = require('net');

(async () => {    
    var sess = new qmux.Session(await qmux.DialTCP(9998));
    
    var ch = await sess.accept();
    var buf = Buffer.from("");
    while (true) {
        var data = await ch.read(1)
        if (data === undefined) {
            break;
        }
        buf = Buffer.concat([buf, data], buf.length+data.length);
    }
    await ch.close();
    
    ch = await sess.open();
    await ch.write(buf);
    await ch.close();

    await sess.close();

})().catch(async (err) => { 
    console.log(err.stack);
});
