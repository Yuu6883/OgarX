
module.exports = class Controller {
    constructor() {
        this.spawn = false;
        this.alive = false;
        this.spectate = null;
        this.mouseX = 0;
        this.mouseY = 0;
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
        /** @type {import("./handle")} */
        this.handle = null;
    }

    reset() {
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