var qmux = require('qmux');

(async () => {

    var listener = await qmux.ListenWebsocket(8000);

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

})().catch(async (err) => { 
    console.log(err.stack);
});


