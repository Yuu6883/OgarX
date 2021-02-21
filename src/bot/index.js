const Handle = require("../game/handle");
const BOTS = require("../../public/static/data/bots.json");

/** @template T @param {T[]} array */
const pick = array => array[~~(Math.random() * array.length)];

module.exports = class Bot extends Handle {

    /** @param {import(".")} game */
    constructor(game) {
        super(game);
        this.join();
        this.controller.name = `[BOT] ${pick(BOTS.names)}`;
        this.controller.skin = BOTS.skins.length ? pick(BOTS.skins) : "";

        this.__nextActionTick = 0;

        this.game.emit("join", this.controller);
    };

    get myCellIDs() { return this.game.engine.counters[this.controller.id]; }
    
    set nextAction(v) { this.__nextActionTick = this.game.engine.__now + 1000 * v; }

    onTick() {

        const c = this.controller;
        const g = this.game;
        const e = g.engine;
        const cells = e.cells;
        const s = e.options.PLAYER_SPAWN_SIZE;
        
        if (e.__now < this.__nextActionTick) return;
        
        // if (!this.controller.alive || this.controller.score < s * s / 500) 
        //     this.controller.spawn = true;
        
        // this.controller.ejectMarco = true;
        // this.controller.splitAttempts = 7;
        // this.controller.mouseX = this.controller.viewportX;
        // this.controller.mouseY = this.controller.viewportY;

        // Less than 20% of or spawn mass and 3 second spawn cooldown
        if (!c.alive || c.score < e.options.BOT_SPAWN_SIZE * e.options.BOT_SPAWN_SIZE * 0.002) {
            c.requestSpawn();
            this.nextAction = 3;
            // console.log("BOT SPAWN");
        } else {
            let canEjectCount = 0;
            for (const cell_id of this.myCellIDs)
                if (cells[cell_id].r > e.options.PLAYER_MIN_EJECT_SIZE) canEjectCount++;

            if (canEjectCount > 3) {
                c.ejectMarco = true;
                c.mouseX = c.viewportX;
                c.mouseY = c.viewportY;

                this.nextAction = 1; // 1 sec
                // console.log("BOT SF");
            } else {
                
                if (this.myCellIDs.size < 20 && Math.random() < 0.1) {
                    // Solotrick to random direction
                    c.ejectMarco = true;
                    c.splitAttempts = 7;
                    const a = Math.random() * Math.PI * 2;
                    c.mouseX = c.viewportX + 1000 * Math.sin(a);
                    c.mouseY = c.viewportY + 1000 * Math.cos(a);
                    this.nextAction = 5;
                    // console.log("BOT SOLOTRICK");
                } else {
                    // Idle
                    c.ejectMarco = false;
                    c.mouseX = c.viewportX;
                    c.mouseY = c.viewportY;
                    this.nextAction = 1;
                    // console.log("BOT IDEL");
                }
            }
        }
    };

    /** @param {string} err */
    onError(err) {};
    /**
     * @param {import("./controller")} sender 
     * @param {string} message 
     */
    onChat(sender, message) {};
}