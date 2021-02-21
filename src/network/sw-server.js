const FakeSocket = require("./fake-socket");

const Protocols = require("./protocols");
// Register console protocol
Protocols.push(require("./protocols/web-console"));

const Game = require("../game");

module.exports = class SharedWorkerServer {

    constructor() {
        this.game = new Game();
        /** @type {Set<MessagePort & { ws: FakeSocket }>} */
        this.ports = new Set();
    }

    open() {
        self.onconnect = e => {
            
            /** @type {MessagePort} */
            const port = e.source;  
            const ws = new FakeSocket(port);
            
            this.ports.add(port);

            ws.onmessage = message => {
                if (!ws.p) {
                    const Protocol = Protocols.find(p => p.handshake(new DataView(message)));
                    if (!Protocol) {
                        console.log(message);
                        ws.end(1003, "Ambiguous protocol");
                    }
                    else ws.p = new Protocol(this.game, ws, message);
                } else {
                    port.lastMessage = Date.now();
                    try {
                        ws.p.onMessage(new DataView(message));
                    } catch(e) {};
                }
            }

            ws.onclose = (code, reason) => {

                if (ws.p && ws.p.controller) {
                    console.log(`Disconnected: (handle#${ws.p.controller.id}) code: ${code}, message: ${reason}`);
                } else {
                    console.log(`Disconnected: code: ${code}, message: ${reason}`);
                }

                this.ports.delete(port);
                ws.p && ws.p.off();
                if (!this.ports.size) self.close();
            }

            // Wait for server to start running (load wasm modules)
            const onopen = () => {
                if (!this.game.engine.running) {
                    setTimeout(() => onopen(), 1000);
                } else {
                    port.postMessage({ event: "open" });
                }
            }
            onopen();
        }

        // Mimic uWS idleTimeout behavior
        setInterval(() => {
            for (const port of this.ports)
                if (Date.now() - port.lastMessage > 3000) 
                    port.ws.end(1001, "No PING received");
        }, 1000);
    }

    close() {
        for (const port of this.ports) port.close();
    }
}