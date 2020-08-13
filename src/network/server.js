const uWS = require("uWebSockets.js");
const Socket = require("./socket");

module.exports = class SocketServer {

    /** @param {import("../game/game")} game */
    constructor(game) {
        this.game = game;
    }

    open() {
        uWS.App().ws("/", {
            idleTimeout: 10,
            maxBackpressure: 1024,
            maxPayloadLength: 512,
            compression: uWS.DEDICATED_COMPRESSOR_4KB,
            upgrade: (res, req, context) => {
                console.log('Connection received from: ' + req.getUrl() + " ip: " + res.getRemoteAddressAsText());
                res.upgrade({ url: req.getUrl() },
                    req.getHeader('sec-websocket-key'),
                    req.getHeader('sec-websocket-protocol'),
                    req.getHeader('sec-websocket-extensions'),
                    context);
            },
            open: ws => {
                ws.sock = new Socket(ws);
                this.game.addHandle(ws.sock);
            },
            message: (ws, message, isBinary) => {
                if (!isBinary) ws.end(1003);
                ws.sock.onMessage(new DataView(message));
            },
            close: (ws, code, message) => {
                console.log(`Disconnected: (handle#${ws.sock.id})`);
                this.game.removeHandle(ws.sock);
            }
        });
    }
}