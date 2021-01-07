
module.exports = class Controller {
    constructor(id = 0) {
        this.id = id;
        this.__name = "";
        this.__skin = "";
        this.spawn = false;
        this.updated = false;
        this.alive = false;
        this.spectate = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.ejectMarco = false;
        this.splitAttempts = 0;
        this.ejectAttempts = 0;
        this.lastEjectTick = 0;
        this.lastSpawnTick = 0;
        this.viewportX = 0;
        this.viewportY = 0;
        this.viewportHW = 0;
        this.viewportHH = 0;
        this.maxScore = 0;
        this.score = 0;

        this.viewportScale = 1;

        /** @type {import("./handle")} */
        this.handle = null;
    }

    get name() { return this.__name; }
    get skin() { return this.__skin; }

    set name(v) {
        if (v != this.__name) {
            this.__name = v;
            this.updated = true;
        }
    }

    set skin(v) {
        if (v != this.__skin) {
            this.__skin = v;
            this.updated = true;
        }
    }

    reset() {
        this.__name = "";
        this.__skin = "";
        this.updated = false;

        this.handle = null;
        this.alive = false;
        this.spectate = null;
        this.splitAttempts = 0;
        this.ejectAttempts = 0;
        this.lastEjectTick = 0;
        this.lastSpawnTick = 0;
        this.viewportX = 0;
        this.viewportY = 0;
        this.viewportHW = 0;
        this.viewportHH = 0;
        this.score = 0;
    }
}