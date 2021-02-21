
module.exports = class Controller {
    /** @param {import("../physics/engine")} engine */
    constructor(engine, id = 0) {
        this.engine = engine;
        this.id = id;
        this.__name = "";
        this.__skin = "";
        this.spawn = false;
        this.updated = false;
        /** @type {Controller} */
        this.spectate = null;
        this.__mouseX = 0;
        this.__mouseY = 0;
        this.lockDir = false;
        this.linearEquation = new Float32Array(3);
        this.ejectMarco = false;
        this.splitAttempts = 0;
        this.ejectAttempts = 0;
        this.lastPoppedTick = 0;
        this.lastEjectTick = 0;
        this.lastSpawnTick = 0;
        this.viewportX = 0;
        this.viewportY = 0;
        this.viewportHW = 0;
        this.viewportHH = 0;
        this.maxScore = 0;
        this.dead = false;
        this.autoRespawn = false;
        this.kills = 0;
        this.score = 0;
        this.surviveTime = 0;
        this.showOnMinimap = false;
        this.showonLeaderboard = false;

        this.box = { l: 0, r: 0, b: 0, t: 0 };

        /** @type {import("./handle")} */
        this.handle = null;
    }

    get alive() { return !!this.engine.counters[this.id].size; }
    get name() { return this.__name || "Unnamed"; }
    get skin() { return this.__skin; }

    get mouseX() { return this.__mouseX; }
    get mouseY() { return this.__mouseY; }
    set mouseX(v) { if (!this.lockDir) this.__mouseX = v; }
    set mouseY(v) { if (!this.lockDir) this.__mouseY = v; }

    set name(v) {
        if (v != this.__name) {
            this.__name = v.slice(0, this.engine.options.PLAYER_NAME_MAX_LENGTH);
            this.updated = true;
        }
    }

    set skin(v) {
        if (v != this.__skin) {
            this.__skin = v;
            this.updated = true;
        }
    }

    toggleLock() {
        this.lockDir ? this.unlock() : this.lock();
    }

    lock() {
        if (this.engine.counters[this.id].size != 1) return false;
        const cell = this.engine.cells[[...this.engine.counters[this.id]][0]];
        const x1 = this.mouseX, y1 = this.mouseY, x2 = cell.x, y2 = cell.y;
        this.linearEquation[0] = y1 - y2;
        this.linearEquation[1] = x2 - x1;
        this.linearEquation[2] = x1 * y2 - x2 * y1;
        // INVALID LINEAR EQUATION
        if (!this.linearEquation[0] && !this.linearEquation[1]) return false;
        this.lockDir = true;
        return true;
    }

    unlock() {
        this.lockDir = false;
    }

    reset() {
        this.__name = "";
        this.__skin = "";
        this.updated = false;

        this.handle = null;
        this.spectate = null;
        this.lockDir = false;
        this.splitAttempts = 0;
        this.ejectAttempts = 0;
        this.lastPoppedTick = 0;
        this.lastEjectTick = 0;
        this.lastSpawnTick = 0;
        this.viewportX = 0;
        this.viewportY = 0;
        this.viewportHW = 0;
        this.viewportHH = 0;
        this.maxScore = 0;
        this.kills = 0;
        this.score = 0;
        this.dead = false;
        this.autoRespawn = false;
        this.surviveTime = 0;
        this.box = { l: 0, r: 0, b: 0, t: 0 };
        this.showOnMinimap = false;
        this.showonLeaderboard = false;
    }

    afterSpawn() {
        this.spectate = null;
        this.ejectAttempts = 0;
        this.ejectMarco = false;
        this.lastPoppedTick = 0;
        this.lastEjectTick = 0;
        this.updated = false; // reset updated field after spawning
        this.lockDir = false; // reset line lock
        this.maxScore = 0;
        this.kills = 0;
        this.dead = false;
        this.spawn = false;
        this.autoRespawn = false;
        this.surviveTime = 0;
        this.lastSpawnTick = this.engine.__now;
    }

    get canSpawn() {
        const e = this.engine;
        // Player requesting spawn OR player is dead and requested auto respawn
        return (this.spawn || (!this.alive && this.autoRespawn)) && 
            (e.__now <= e.options.PLAYER_SPAWN_DELAY || 
             e.__now >= this.lastSpawnTick + e.options.PLAYER_SPAWN_DELAY);
    }

    requestSpawn() {
        this.spawn = true;
        if (this.canSpawn) this.engine.delayKill(this.id, true);
    }
}