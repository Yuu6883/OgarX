const uWS = require("uWebSockets.js");
const Socket = require("./socket");

/** @param {ArrayBuffer} buffer */
const bufferToString = buffer => new Uint8Array(buffer).map(ch => String.fromCharCode(ch)).join("");

module.exports = class SocketServer {

    /** @param {import("../game/game")} game */
    constructor(game) {
        this.game = game;
    }

    open() {
        if (this.listening || this.sock) return;
        this.listening = true;
        return new Promise(resolve => {
            uWS.App().ws("/", {
                idleTimeout: 10,
                maxBackpressure: 1024,
                maxPayloadLength: 512,
                compression: uWS.DEDICATED_COMPRESSOR_4KB,
                upgrade: (res, req, context) => {
                    console.log('Connection received from: "' + req.getUrl() + '" ip: ' + new Uint8Array(res.getRemoteAddress()).join("."));
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
                    console.log(`Disconnected: (handle#${ws.sock.controller.id}) code: ${code}, message: ${bufferToString(message)}`);
                    this.game.removeHandle(ws.sock);
                }
            }).listen("0.0.0.0", 3000, sock => {
                this.listening = false;
                this.sock = sock;
                console.log(`Server opened`);
                resolve(true);
            });
        });
    }

    close() {
        this.sock && uWS.us_listen_socket_close(this.sock);
        this.sock = null;
        console.log(`Server closed`);
    }
}