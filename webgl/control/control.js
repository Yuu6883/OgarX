const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");

window.onload = () => {

    const usageElem = document.getElementById("usage");

    const sharedServer = new SharedWorker("js/sw.min.js", "ogar-x-server");
    sharedServer.onerror = console.error;
    const port = sharedServer.port;

    port.start();

    /** @param {ArrayBuffer} buffer */
    const send = buffer => port.postMessage({ event: "message", message: buffer }, [buffer]);

    const writer = new Writer();
    writer.writeInt16(420);
    writer.writeUInt8(69);
    send(writer.finalize());

    let pingInterval = null;
    
    port.addEventListener("message", e => {

        if (e.data.event === "open") {
            
            pingInterval = self.setInterval(() => {
                const PING = new ArrayBuffer(1);
                new Uint8Array(PING)[0] = 69;
                send(PING);
            }, 1000);

            return console.log("Connected to server");
        }

        if (e.data.event === "close") {
            clearInterval(pingInterval);

            return console.log("Disconnected");
        }
        
        if (e.data.event === "message") {
            const reader = new Reader(new DataView(e.data.message));
            const OP = reader.readUInt8();

            switch (OP) {
                case 1:
                    const usage = reader.readFloat32();
                    usageElem.textContent = `${(usage * 100).toFixed(2)}%`;
                    break;
            }
        }
    });
};