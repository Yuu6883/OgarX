const FakeSocketHandler = require("./socket");
const FakeSocket = require("./fake-socket");
const WebConsoleProtocol = require("./protocols/web-console");

const Chat = require("./chat");
const Game = require("../game");

// Register console protocol
FakeSocketHandler.protocols.push(WebConsoleProtocol);

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
            ws.sock = new FakeSocketHandler(this.game, ws);
            
            this.ports.add(port);

            ws.onmessage = view => {
                port.lastMessage = Date.now();
                ws.sock.onMessage(view);
            }

            ws.onclose = (code, reason) => {

                if (ws.sock.controller) {
                    console.log(`Disconnected: (handle#${ws.sock.controller.id}) code: ${code}, message: ${reason}`);
                } else {
                    console.log(`Disconnected: code: ${code}, message: ${reason}`);
                }

                this.game.removeHandler(ws.sock);
                this.ports.delete(port);
                ws.sock.onDisconnect(code, reason);
            }
        }
        this.game.chat = new Chat(this.game);

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