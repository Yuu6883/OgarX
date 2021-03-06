const net = require("net");
const path = require("path");
const uWS = require("uWebSockets.js");
const crypto = require("crypto");

const pipename = str => process.platform == "win32" ? `\\\\.\\pipe\\${str.replace(/^\//, "").replace(/\//g, "-")}` : str;
const SOCKET_FILE = path.resolve(__dirname, "..", "unix.sock");

const Protocols = require("./protocols");
const Game = require("../game");

const CONN_THROTTLE = 0;

module.exports = class SocketServer {

    constructor(name) {
        this.uid = crypto.randomBytes(12).toString("hex");
        this.modes = require("../modes");
        this.game = new Game(name);
    }

    setGameMode(mode = "") {
        if (this.modes.has(mode)) {
            this.game.engine.setOptions(this.modes.get(mode));
            console.log(`Gamemode is set to "${mode}"`);
        } else {
            console.error(`Gamemode "${mode}" doesn't exist`);
        }
    }

    ipcConnect() {
        if (this.ipcClient) return;
        this.ipcClient = net.connect(pipename(SOCKET_FILE))
            .on("error", this.ipcReconnect.bind(this))
            .on("close", this.ipcReconnect.bind(this));
    }

    ipcReconnect() {
        delete this.ipcClient;
        console.log("Reconnecting to Gateway");
        setTimeout(() => this.ipcConnect(), 5000);
    }

    /**
     * @param {Object} arg0
     * @param {uWS.AppOptions} arg0.sslOptions
     * @param {number} [arg0.port=443]
     * @param {string} [arg0.token=""]
     * @param {string} [arg0.endpoint=""]
     * @return {Promise<boolean>}
     */
    open({ sslOptions, port = 3000, endpoint = "", token = "" }) {
        if (this.listening || this.sock) return false;
        this.listening = true;

        this.ipcConnect();

        const g = this.game;
        this.ipcInterval = setInterval(() => {
            try {
                this.ipcClient.write(JSON.stringify({
                    pid: process.pid,
                    uid: this.uid,
                    name: g.name,
                    endpoint: `${port}/${endpoint}`,
                    bot: g.engine.bots.length,
                    real: g.playerCount,
                    players: g.handles,
                    total: 250 // Number in theory
                }));
            } catch (_) {}
        }, 1000);

        let conn = 0;
        /** @type {[uWS.HttpResponse, string, string, string, string, uWS.us_socket_context_t][]} */
        const upgradeQueue = [];

        this.upgradeInterval = setInterval(() => {
            conn = 0;
            if (!upgradeQueue.length) return;
            for (let i = Math.min(CONN_THROTTLE || 1, upgradeQueue.length); i > 0; i--) {
                const [res, url, key, protocol, ext, context] = upgradeQueue.shift();
                res.upgrade({ url }, key, protocol, ext, context);
            }
        }, 250);

        return new Promise(resolve => {
            (sslOptions ? uWS.SSLApp(sslOptions) : uWS.App()).ws(`/${endpoint}`, {
                idleTimeout: 10,
                maxBackpressure: 1024,
                maxPayloadLength: 512,
                compression: uWS.DEDICATED_COMPRESSOR_4KB,
                upgrade: (res, req, context) => {

                    const url = req.getUrl();
                    const key = req.getHeader("sec-websocket-key");
                    const pro = req.getHeader('sec-websocket-protocol');
                    const ext = req.getHeader('sec-websocket-extensions');

                    if (conn < CONN_THROTTLE) {
                        res.upgrade({ url }, key, pro, ext, context);
                        conn++;
                    } else {
                        upgradeQueue.push([res, url, key, pro, ext, context]);
                        res.onAborted(() => {
                            const index = upgradeQueue.findIndex(item => item[0] === res);
                            upgradeQueue.splice(index, 1);
                        });
                    }
                },
                open: ws => () => {
                    ws.ip = new Uint8Array(ws.getRemoteAddress()).join("."); // save ip
                    console.log(`WS connected from ${ws.ip}`);
                    // Client does not exchange protocol info within 3 seconds
                    setTimeout(() => ws.p || ws.end(1003), 3000);
                },
                message: (ws, message, isBinary) => {
                    if (!isBinary) ws.end(1003);
                    if (!ws.p) {
                        const Protocol = Protocols.find(p => p.handshake(new DataView(message)));
                        if (!Protocol) ws.end(1003, "Ambiguous protocol");
                        else ws.p = new Protocol(this.game, ws, message);
                    } else {
                        try {
                            ws.p.onMessage(new DataView(message));
                        } catch (e) {}
                    }
                },
                drain: ws => ws.p && ws.p.onDrain(),
                close: (ws, code, message) => ws.p && ws.p.off()
            })
            .get("/restart/:token", (res, req) => {
                const authorization = req.getParameter(0);
                if (token) {
                    if (token == authorization) {
                        res.end("Restarting");
                        setTimeout(() => process.exit(0), 1000);
                    } else {
                        res.writeStatus("401 Unauthorized");
                        res.end();
                    }
                } else {
                    res.writeStatus("302");
                    res.writeHeader("location", "/");
                    res.end();
                }
            })
            .get("/*", (res, _) => res.end(`Hello OGARX ${this.game.name}`))
            .listen("0.0.0.0", port, sock => {
                this.listening = false;
                if (sock) {
                    this.sock = sock;
                    console.log(`WS-Server opened on :${port}/${endpoint} ` +
                        `${token ? "WITH" : "WITHOUT"} token`);
                    resolve(true);
                } else {
                    console.error(`WS-Server failed to open on :${port}/${endpoint} ` +
                        `${token ? "WITH" : "WITHOUT"} token`);
                    resolve(false);
                }
            });
        });
    }

    close() {
        this.sock && uWS.us_listen_socket_close(this.sock);
        this.sock = null;
        clearInterval(this.ipcInterval);
        clearInterval(this.upgradeInterval);
        try { this.ipcClient.destroy(); } catch (e) {}
        console.log(`Server closed`);
    }
}