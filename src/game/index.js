const Controller = require("./controller");
const Engine = require("../physics/engine");

const MAX_PLAYER = 250;

module.exports = class Game {

    constructor() {
        this.controls = Array.from({ length: MAX_PLAYER }, (_, i) => new Controller(i));
        this.engine = new Engine(this);
        this.handles = 0;
    }

    /** @param {import("./handle")} handle */
    addHandler(handle) {
        if (this.isFull) handle.onError("Server full");
        if (handle.controller) return;
        let i = 1; // 0 is occupied ig
        while (this.controls[i].handle) i++;
        this.controls[i].handle = handle;
        handle.controller = this.controls[i];
        this.handles++;
    }

    /** @param {import("./handle")} handle */
    removeHandler(handle) {
        if (!handle.controller) return;
        this.engine.kill(handle.controller.id);
        handle.controller.reset();
        handle.controller = null;
        this.handles--;
    }

    get isFull() { return this.handles == MAX_PLAYER; }
}