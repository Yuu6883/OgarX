const { EventEmitter } = require("events");

const Controller = require("./controller");
const Engine = require("../physics/engine");
const Chat = require("./chat");

const MAX_PLAYER = 250;

module.exports = class Game extends EventEmitter {

    constructor() {
        super();
        this.controls = Array.from({ length: MAX_PLAYER }, (_, i) => new Controller(i));
        this.chat = new Chat(this);
        this.engine = new Engine(this);
        this.handles = 0;
    }

    /** @param {import("./handle")} handle */
    addHandler(handle) {
        if (this.isFull) handle.onError("Server full");
        if (handle.controller) return;
        let id = 1; // 0 is occupied ig
        while (this.controls[id].handle) id++;
        this.controls[id].handle = handle;
        handle.controller = this.controls[id];
        this.handles++;
        this.emit("join", handle.controller);
    }

    /** @param {import("./handle")} handle */
    removeHandler(handle) {
        if (!handle.controller) return;
        const c = handle.controller;
        this.engine.kill(c.id);
        c.reset();
        handle.controller = null;
        this.handles--;
        this.emit("leave", c);
    }

    get isFull() { return this.handles == MAX_PLAYER; }
}