const pm2 = require("pm2");
const { existsSync, unlinkSync } = require("fs");
const { execSync } = require("child_process");

const net = require("net");
const path = require("path");
const uWS = require("uWebSockets.js");

const pipename = str => process.platform == "win32" ? `\\\\.\\pipe\\${str.replace(/^\//, "").replace(/\//g, "-")}` : str;
const SOCKET_FILE = path.resolve(__dirname, "unix.sock");

if (existsSync(SOCKET_FILE)) unlinkSync(SOCKET_FILE);

const SSL_FOLDER_PATH = path.resolve(__dirname, "..", "ssl");
const SSL_PATH = path.resolve(SSL_FOLDER_PATH, "options.json");
let sslOptions = null;
if (!existsSync(SSL_FOLDER_PATH)) fs.mkdirSync(SSL_FOLDER_PATH);
if (existsSync(SSL_PATH)) sslOptions = require(SSL_PATH);

const server = net.createServer();

/** @type {Set<net.Socket>} */
const sockets = new Set();

server.on("connection", sock => {
    sockets.add(sock);
    sock.on("data", buffer => sock.data = JSON.parse(buffer.toString()))
        .on("close", () => sockets.delete(sock));
});

server.listen(pipename(SOCKET_FILE));
const port = process.env.GATEWAY_PORT || 443;

/** @type {Set<uWS.HttpResponse>} */
const connections = new Set();

const interval = setInterval(() => {
    const data = "event: ping\ndata: " + JSON.stringify({ servers: [...sockets].map(s => s.data), timestamp: Date.now() }) + "\n\n";
    for (const res of connections) res.write(data);
}, 500);

let token = process.env.OGARX_TOKEN;

(sslOptions ? uWS.SSLApp(sslOptions) : uWS.App())
    .get(`/gateway`, (res, _) => {
        res.writeStatus("200 OK");
        res.writeHeader("Content-type", "text/event-stream");
        res.writeHeader("Cache-Control", "no-cache");
        res.writeHeader("Access-Control-Allow-Origin", process.env.GATEWAY_ORIGIN || "*");
        res.onAborted(() => connections.delete(res));
        connections.add(res);
    })
    .get("/update/:token", (res, req) => {
        const authorization = req.getParameter(0);
        if (token) {
            if (token == authorization) {
                const result = execSync("git pull origin master", 
                    { stdio: ['ignore', 'pipe', 'ignore'] }).toString("utf-8");
                if (result == "Already up to date.\n") {
                    res.end("Already updated");
                } else {
                    res.end(result);
                }
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
    .get("/restart/:token", (res, req) => {
        const authorization = req.getParameter(0);
        if (token) {
            if (token == authorization) {
                res.end("Restarting all processes");
                setTimeout(() => pm2.restart("all"), 1000);
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
    .get("/*", (res, _) => res.end("Hello OGARX Gateway"))
    .listen("0.0.0.0", port, sock => {
        process.on("SIGINT", () => {
            server.close();
            uWS.us_listen_socket_close(sock);
            clearInterval(interval);
            process.exit(0);
        });
        console.log((sock ? "Gateway Server listening" : "Gateway Server failed to listen") + 
            ` on port ${port} ` + (token ? "WITH token" : "WITHOUT token"));
        process.send("ready");
    });