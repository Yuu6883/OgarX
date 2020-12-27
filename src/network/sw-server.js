const Socket = require("./socket");
const FakeSocket = require("./fake-socket");

const Chat = require("./chat");

module.exports = class SharedWorkerServer {

    /** @param {import("../game/game")} game */
    constructor(game) {
        this.game = game;
        /** @type {Set<MessagePort>} */
        this.ports = new Set();
    }

    open() {
        self.onconnect = e => {
            console.log("Received connection");
            /** @type {MessagePort} */
            const port = e.source;
            const ws = new FakeSocket(port);
            ws.sock = new Socket(this.game, ws);
            this.game.addHandle(ws.sock);
            this.ports.add(port);

            ws.onmessage = view => ws.sock.onMessage(view);
            ws.onclose = (code, reason) => {
                console.log(`Disconnected: (handle#${ws.sock.controller.id}) code: ${code}, message: ${reason}`);
                this.game.removeHandle(ws);
                this.ports.delete(port);
            }
        }
        this.game.chat = new Chat(this.game);
    }

    close() {
        for (const port of this.ports) port.close();
    }
}