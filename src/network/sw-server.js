const SocketHandler = require("./socket");
const FakeSocket = require("./fake-socket");

const Chat = require("./chat");
const Game = require("../game");

module.exports = class SharedWorkerServer {

    constructor() {
        this.game = new Game();
        /** @type {Set<MessagePort>} */
        this.ports = new Set();
    }

    open() {
        self.onconnect = e => {
            
            /** @type {MessagePort} */
            const port = e.source;  
            const ws = new FakeSocket(port);
            ws.sock = new SocketHandler(this.game, ws);
            this.game.addHandler(ws.sock);
            this.ports.add(port);

            ws.onmessage = view => {
                port.lastMessage = Date.now();
                ws.sock.onMessage(view);
            }

            ws.onclose = (code, reason) => {
                console.log(`Disconnected: (handle#${ws.sock.controller.id}) code: ${code}, message: ${reason}`);
                this.game.removeHandler(ws);
                this.ports.delete(port);
            }
        }
        this.game.chat = new Chat(this.game);

        // Mimic uWS idleTimeout behavior
        setInterval(() => {
            for (const port of this.ports)
                if (Date.now() - port.lastMessage > 75000) 
                    port.ws.end(1001, "No PING received");
        }, 3000);
    }

    close() {
        for (const port of this.ports) port.close();
    }
}