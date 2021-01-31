const { EventEmitter } = require("events");
// const BSON = require("bson/dist/bson.browser.umd");
const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");
const FakeSocket = require("./fake-socket");

// const uuidv4 = () => ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
//     (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

class ReplaySnapshot {
    constructor(length = 0) {
        this.score = 0;
        this.state = new ArrayBuffer(length);
        this.view = new Uint8Array(this.state);

        /** @type {number[]} */
        this.packetTimestamps = [];
        /** @type {ArrayBuffer[]} */
        this.packets = [];
    }
}

const REPLAY_LENGTH = 10;

class ReplaySystem {

    /**
     * @param {import("./renderer")} renderer
     * @param {import("./protocol")} protocol
     * @param {number} length
     */
    constructor(renderer, protocol, length) {
        this.t = 0;
        this.i = 0;

        this.encoder = new OffscreenCanvas(0, 0);
        this.encoderCTX = this.encoder.getContext("bitmaprenderer");

        this.thumbnail = new ArrayBuffer(0); // Placeholder
        this.thumbnailUint8View = new Uint8Array(this.thumbnail);
        this.thumbnailUint8ClampedView = new Uint8ClampedArray(this.thumbnail);

        this.protocol = protocol;
        this.renderer = renderer;

        this.source = new Uint8Array(renderer.core.buffer, 0, renderer.cellDataBufferLength);
        this.snapshots = Array.from({ length }, _ => new ReplaySnapshot(this.source.byteLength));
    }

    async init() {
        /** @type {IDBDatabase} */
        this.db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("ogar69-replay");
            req.onupgradeneeded = e => {
                console.log("Creating replay object store");
                /** @type {IDBDatabase} */
                const db = e.target.result;
                db.createObjectStore("replay-meta");
                db.createObjectStore("replay-data");
            }
            req.onsuccess = _ => resolve(req.result);
            req.onerror = reject;
        });
        console.log("Connected to replay database");
    }

    resizeBuffer() {
        if (this.renderer.RGBABytes > this.thumbnail.byteLength) {
            this.thumbnail = new ArrayBuffer(this.renderer.RGBABytes);
            this.thumbnailUint8View = new Uint8Array(this.thumbnail);
            this.thumbnailUint8ClampedView = new Uint8ClampedArray(this.thumbnail);
            this.thumbnailData = new ImageData(new Uint8ClampedArray(this.thumbnail), 
                this.renderer.gl.drawingBufferWidth, this.renderer.gl.drawingBufferHeight);
        }
    }

    encodePlayerData() {
        const writer = new Writer();
        writer.skip(1);
        const w = this.renderer.playerData.filter((p, i) => {
            if (!i || i > 250 || !p) return;
            writer.writeUInt8(i);
            writer.writeUTF16String(p.name || "");
            writer.writeUTF16String(p.skin || "");
            return true;
        });
        const end = writer.offset;
        writer.offset = 0;
        writer.writeUInt8(w.length);
        writer.offset = end;
        return writer.finalize();
    }

    async save() {
        await new Promise(async (resolve, reject) => {
            const snapshots = this.snapshots.filter(s => s.packets.length).map(s => s);

            /** @type {ArrayBuffer[]} */
            const buffers = snapshots.reduceRight((prev, curr) => prev.concat(curr.packets), []);

            /** @type {number[]} */
            let tArray = snapshots.reduceRight((prev, curr) => prev.concat(curr.packetTimestamps), []);
            const minTimestamp = Math.min(...tArray);
            tArray = tArray.map(t => t - minTimestamp);
            const packetSizeTotal = buffers.reduce((prev, curr) => prev + curr.byteLength, 0);
            const players = this.encodePlayerData();

            const timestamps = new Float32Array(tArray).buffer;

            const initial = snapshots[snapshots.length - 1].state;

            this.encoder.width = this.thumbnailData.width >> 2;
            this.encoder.height = this.thumbnailData.height >> 2;
            this.encoderCTX.transferFromImageBitmap(await createImageBitmap(this.thumbnailData, {
                imageOrientation: "flipY", 
                resizeWidth: this.encoder.width, 
                resizeHeight: this.encoder.height,
                resizeQuality: "high"
            }));
            const blob = await this.encoder.convertToBlob({ type: "image/jpeg", quality: 1 });
            // Bytes to store
            const size = initial.byteLength + blob.size + players.byteLength +
                timestamps.byteLength + packetSizeTotal;

            const tx = this.db.transaction(["replay-meta", "replay-data"], "readwrite");
            const metaStore = tx.objectStore("replay-meta");
            const dataStore = tx.objectStore("replay-data");
            const uid = Date.now();

            metaStore.add({
                date: Date.now(),
                thumbnail: blob,
                size,
            }, uid);

            const toStore = { initial, buffers, timestamps, players };
            dataStore.add(toStore, uid);
            // console.log(BSON.deserialize(BSON.serialize(toStore)));

            tx.oncomplete = () => {
                self.postMessage({ event: "replay" });
                resolve()
            };
            tx.onerror = reject;
        });
    }

    set score(v) {
        if (v > this.maxScore) {
            this.resizeBuffer();
            this.renderer.screenshot(this.thumbnailUint8View);
        }
        this.snapshots[0].score = Math.max(v, this.snapshots[0].score);
    }

    get maxScore() { return Math.max(...this.snapshots.map(s => s.score)); }

    // Record current state
    recordState() {
        const tail = this.snapshots.pop();
        this.free(tail);
        this.snapshots.unshift(tail);
        tail.view.set(this.source);
        
        this.score = this.renderer.stats.score;
    }

    /** @param {ArrayBuffer} packet */
    recordPacket(packet) {
        this.snapshots[0].packets.push(packet);
        this.snapshots[0].packetTimestamps.push(performance.now());
    }

    /** @param {ReplaySnapshot} snapshot */
    free(snapshot) {
        this.renderer.loader.postMessage(snapshot.packets, snapshot.packets);
        snapshot.score = 0;
        snapshot.view.fill(0);
        snapshot.packets = [];
        snapshot.packetTimestamps = [];
    }

    resetSnapshots() {
        this.snapshots.forEach(s => this.free(s));
    }

    async load(id = 0) {
        /** @type {{ buffers: ArrayBuffer[], players: ArrayBuffer }} */
        const data = await new Promise((resolve, reject) => {
            const tx = this.db.transaction(["replay-data"], "readonly");
            const dataStore = tx.objectStore("replay-data");
            const req = dataStore.get(id);
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = reject;
        });

        const initial = new Uint8Array(data.initial);
        const timestamps = new Float32Array(data.timestamps);
        this.curr = { initial, timestamps, packets: data.buffers };

        console.assert(this.curr.timestamps.length === this.curr.packets.length,
            "Packet and timestamp length MUST match");
        this.protocol.parsePlayers(data.players);
    }

    update(dt = 0) {
        if (!this.curr) return;
        // Overwrite state
        if (!this.t) this.source.set(this.curr.initial);
        // "Receive" packet
        while (this.curr.timestamps[this.i] < this.t) 
            this.protocol.onMessage({ data: this.curr.packets[this.i++] });

        // Loop
        if (this.i >= this.curr.timestamps.length) this.resetTrack();
        else this.t += dt;
    }

    resetTrack() {
        this.i = 0;
        this.t = 0;
        this.renderer.shouldTP = true;
    }
}

const RecordOPs = [2, 4];

module.exports = class Protocol extends EventEmitter {
    
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        super();
        this.pid = 0;
        this.bandwidth = 0;
        this.renderer = renderer;
        this.replay = new ReplaySystem(renderer, this, REPLAY_LENGTH);
        this.setupIntervals();
        this.onMessage = this.onMessage.bind(this);
    }

    get connecting() { return this.ws && this.ws.readyState == WebSocket.CONNECTING; }
    get connected() { return this.ws && this.ws.readyState == WebSocket.OPEN; }

    disconnect() {
        this.connected && this.ws.close();
        
        delete this.replay.curr;
        this.replay.resetTrack();
    }

    connect(urlOrPort, name = "", skin = "") {

        this.disconnect();
        const currWs = this.ws = typeof urlOrPort == "string" ? new WebSocket(urlOrPort) : new FakeSocket(urlOrPort);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            this.renderer.clearCells();

            const writer = new Writer();
            writer.writeUInt8(69);
            writer.writeInt16(420);
            writer.writeUTF16String(name);
            writer.writeUTF16String(skin);
            this.ws.send(writer.finalize());
            this.emit("open");

            delete this.ping;
        }

        this.ws.onmessage = this.onMessage;

        this.ws.onerror = _ => self.postMessage({
            event: "error",
            message: "Connection failed"
        });

        this.ws.onclose = e => {
            this.bandwidth = 0;
            delete this.map;
            delete this.ping;
            delete this.lastName;
            delete this.lastSkin;

            this.emit("close");

            if (this.ws == currWs) {
                self.postMessage({ 
                    event: "disconnect", 
                    code: e.code, 
                    reason: e.reason 
                });
            }
        }
    }

    setupIntervals() {
        this.pingInterval = self.setInterval(() => {
            this.renderer.stats.bandwidth = this.bandwidth;
            this.bandwidth = 0;
            
            if (!this.connected || !this.pid || this.ping) return;
            
            const PING = new ArrayBuffer(1);
            new Uint8Array(PING)[0] = 69;
            this.send(PING);
            this.ping = Date.now();
            this.replay.recordState();
        }, 1000);

        const state = this.renderer.state;
        this.mouseInterval = self.setInterval(() => {
            if (!this.connected || !this.pid) return;

            const writer = new Writer();
            writer.writeUInt8(3);
            writer.writeFloat32(this.renderer.cursor.position[0]);
            writer.writeFloat32(this.renderer.cursor.position[1]);

            const currState = state.exchange();

            writer.writeUInt8(currState.spectate);
            writer.writeUInt8(currState.splits);
            writer.writeUInt8(currState.ejects);
            writer.writeUInt8(currState.macro);
            writer.writeUInt8(currState.lineLock);

            this.send(writer.finalize());

            if (currState.respawn) this.spawn();
            if (currState.clip) this.replay.save();
        }, 1000 / 33); // TODO?
    }

    send(data) {
        this.connected && this.ws.send(data);
    }

    /** @param {{ data: ArrayBuffer }} e */
    onMessage(e) {
        const reader = new Reader(new DataView(e.data));
        const OP = reader.readUInt8();
        this.bandwidth += e.data.byteLength;

        switch (OP) {
            case 1:
                this.pid = reader.readUInt16();
                this.map = { 
                    hw: reader.readUInt16(), 
                    hh: reader.readUInt16()
                };
                console.log(`Map Dimension: ${this.map.hw << 1}x${this.map.hh << 1}`);
                const server = reader.readUTF16String();
                this.emit("protocol");
                self.postMessage({ event: "connect", server });
                break;
            case 2:
                this.renderer.clearCells();
                break;
            case 3:
                const id = reader.readUInt16();
                const name = reader.readUTF16String();
                const skin = reader.readUTF16String();
                this.renderer.loadPlayerData({ id, name, skin });
                break;
            case 4:
                this.parseCellData(e.data);
                break;
            // Leaderboard
            case 5:
                this.parseLeaderboard(reader);
                break;
            // Minimap
            case 6:
                this.parseMinimap(reader);
                break;
            // Stats
            case 7:
                this.parseStats(reader);
                if (this.renderer.state.auto_respawn) {
                    const RESPAWN = new ArrayBuffer(1);
                    new Uint8Array(RESPAWN)[0] = 7;
                    this.send(RESPAWN);
                }
                break;
            // Chat
            case 10:
                const pid = reader.readUInt16();
                const message = reader.readUTF16String();
                const player = this.renderer.playerData[pid];
                if (!player) return console.warn(`Received unknown pid: ${pid}, message: ${message}`);
                self.postMessage({ event: "chat", pid, player, message });
                break;
            // PONG
            case 69:
                if (!this.ping) return;
                this.renderer.stats.ping = Date.now() - this.ping;
                delete this.ping;
                break;
        }
        
        if (!this.replaying && RecordOPs.includes(OP))
            this.replay.recordPacket(e.data);
    }

    get player() { return this.renderer.playerData[this.pid]; }

    /** @param {ArrayBuffer} buffer */
    parsePlayers(buffer) {
        const reader = new Reader(new DataView(buffer));
        const length = reader.readUInt8();
        for (let i = 0; i < length; i++) {
            const data = { 
                id: reader.readUInt8(),
                name: reader.readUTF16String(), 
                skin: reader.readUTF16String()
            };
            this.renderer.loadPlayerData(data);
        }
    }

    /** @param {ArrayBuffer} buffer */
    parseCellData(buffer) {
        this.lastPacket = this.renderer.lastTimestamp;

        const core = this.renderer.core;
        const header = new DataView(buffer, 1, 15);

        const prev = this.renderer.stats.mycells;
        const curr = header.getUint16(0);
        if (!prev && curr) this.renderer.shouldTP = true;
        this.renderer.stats.mycells = curr;
        this.renderer.stats.linelocked = header.getUint8(2);
        this.renderer.stats.score = header.getFloat32(3, true);
        this.renderer.target.position[0] = header.getFloat32(7, true);
        this.renderer.target.position[1] = header.getFloat32(11, true);
        
        core.HEAPU8.set(new Uint8Array(buffer, 16), this.renderer.cellTypesTableOffset);                 
        core.instance.exports.deserialize(0, this.renderer.cellTypesTableOffset);
    }

    /** @param {Reader} reader */
    parseLeaderboard(reader) {
        const rank = reader.readInt16();
        const count = reader.readUInt8();
        const lb = { rank, me: this.player, players: [] }
        for (let i = 0; i < count; i++) lb.players.push(
            this.renderer.playerData[reader.readUInt8()]);
        self.postMessage({ event: "leaderboard", lb });
    }

    /** @param {Reader} reader */
    parseMinimap(reader) {
        const count = reader.readUInt8();
        const minimap = [];
        for (let i = 0; i < count; i++) {
            const pid = reader.readUInt8();
            const player = this.renderer.playerData[pid] || {};
            player.id = pid;
            if (pid == this.pid) player.me = true;
            const x = reader.readFloat32(), y = reader.readFloat32();
            player.x = x / (this.map.hw << 1) + 0.5;
            player.y = y / (this.map.hh << 1) + 0.5;
            player.score = reader.readFloat32();
            minimap.push(player);
        }
        self.postMessage({ event: "minimap", minimap });
    }

    /** @param {Reader} reader */
    parseStats(reader) {
        const kills = reader.readUInt32();
        const score = reader.readFloat32();
        const surviveTime = reader.readFloat32();
        self.postMessage({ event: "stats", kills, score, surviveTime });
    }

    /**
     * @param {string} name 
     * @param {string} skin 
     */
    spawn(name = this.lastName, skin = this.lastSkin) {
        this.lastName = name;
        this.lastSkin = skin;

        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUTF16String(name);
        writer.writeUTF16String(skin);
        this.send(writer.finalize());
    }

    sendChat(message) {
        const writer = new Writer();
        writer.writeUInt8(10);
        writer.writeUTF16String(message);
        this.send(writer.finalize());

        if (this.pid) self.postMessage({ 
            event: "chat", 
            pid: this.pid, 
            player: this.player, 
            message 
        });
    }

    get replaying() { return !!this.replay.curr; }

    async startReplay(id = 0) {
        this.disconnect();  
        this.renderer.cleanup();      
        await this.replay.load(id);
    }
}