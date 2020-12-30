const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");

window.onload = () => {

    /** @type {Map<number, { name: string, skin: string }>} */
    const players = new Map();

    const usageElem = document.getElementById("usage");
    const cellsElem = document.getElementById("cells");
    const playersElem = document.getElementById("players");
    const playerList = document.getElementById("player-list");

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

    let usage = 0;
    let cells = 0;
    let playerCount = 0;

    setInterval(() => {
        usageElem.textContent = `${(usage * 100).toFixed(2)}%`;
        cellsElem.textContent = cells;
        playersElem.textContent = playerCount;

        playerList.innerHTML = "";

        for (const [pid, player] of players) {
            const elem = document.createElement("p");
            elem.textContent = `[${pid}] ${player.name}`;
            playerList.appendChild(elem);
        }
    }, 500);
    
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
            let id = 0;
            switch (OP) {
                case 1:
                    usage = reader.readFloat32();
                    cells = reader.readUInt16();
                    playerCount = reader.readUInt8();
                    break;
                case 2:
                    id = reader.readUInt16();
                    players.set(id, { name: "", skin: "" });
                    break;
                case 3:
                    id = reader.readUInt16();
                    players.delete(id);
                    break;
                case 4:
                    id = reader.readUInt16();
                    players.set(id, { 
                        name: reader.readUTF16String(), 
                        skin: reader.readUTF16String() 
                    });
                    break;
            }
        }
    });
};