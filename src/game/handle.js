module.exports = class Handle {
    /** @param {import(".")} game */
    constructor(game) {
        this.game = game;
        /** @type {import("./controller")} */
        this.controller = null; 
        /** @type {Set<number>} */
        this.pids = new Set();
        
        this.onTick = this.onTick.bind(this);
        this.onJoin = this.onJoin.bind(this);
        this.onChat = this.onChat.bind(this);
        this.onLeave = this.onLeave.bind(this);
        this.onSpawn = this.onSpawn.bind(this);
        this.onError = this.onError.bind(this);
        this.onMinimap = this.onMinimap.bind(this);
        this.onLeaderboard = this.onLeaderboard.bind(this);

        this.game
            .on("tick", this.onTick)
            .on("join", this.onJoin)
            .on("chat", this.onChat)
            .on("leave", this.onLeave)
            .on("spawn", this.onSpawn)
            .on("error", this.onError)
            .on("minimap", this.onMinimap)
            .on("leaderboard", this.onLeaderboard);

        /** @type {[string, Function][]} */
        this.extraEvents = [];
    };
    
    join() { 
        this.game.addHandler(this); 
        this.pids.add(this.controller.id);
    }

    remove() { 
        this.game.removeHandler(this);
    }

    calculateViewport() {
        const g = this.game;
        const e = g.engine;
        const o = g.options;
        const cells = g.engine.cells;

        let size = 0, size_x = 0, size_y = 0;
        let x = 0, y = 0, factor = 0;
        let min_x = o.MAP_HW, max_x = -o.MAP_HW;
        let min_y = o.MAP_HH, max_y = -o.MAP_HH;

        let cell_count = 0;
        let total_score = 0;

        for (const id of this.pids) {
            let score = 0;

            cell_count += g.engine.counters[id].size;
            for (const cell_id of e.counters[id]) {
                const cell = cells[cell_id];
                const sqr = cell.r * cell.r;
                let cell_x = cell.x, cell_y = cell.y;
                x += cell_x * sqr;
                y += cell_y * sqr;
                min_x = cell_x < min_x ? cell_x : min_x;
                max_x = cell_x > max_x ? cell_x : max_x;
                min_y = cell_y < min_y ? cell_y : min_y;
                max_y = cell_y > max_y ? cell_y : max_y;
                score += sqr * 0.01;
                size += sqr;
            }
            g.controls[id].score = score;
            total_score += score;
        }

        if (!cell_count) return;

        size = size || 1;
        factor = Math.pow(cell_count + 100, 0.05);
        const factored_size = (factor + 1) * Math.sqrt(total_score * 100);
        const vx = x / size, vy = y / size;
        size_x = size_y = Math.max(factored_size, o.PLAYER_VIEW_MIN) * o.PLAYER_VIEW_SCALE;
        size_x = Math.max(size_x, (vx - min_x) * 1.75);
        size_x = Math.max(size_x, (max_x - vx) * 1.75);
        size_y = Math.max(size_y, (vy - min_y) * 1.75);
        size_y = Math.max(size_y, (max_y - vy) * 1.75);

        for (const id of this.pids) {
            const c = this.game.controls[id];
            c.box.l = min_x;
            c.box.r = max_x;
            c.box.b = min_y;
            c.box.t = max_y;
            c.viewportX = vx;
            c.viewportY = vy;
            c.viewportHW = size_x;
            c.viewportHH = size_y;
            c.maxScore = Math.max(c.maxScore, total_score);

            if (c.score > o.MAP_HH * o.MAP_HW / 100 * o.WORLD_RESTART_MULT) {
                g.emit("oversize", c);
                if (o.WORLD_KILL_OVERSIZE) {
                    e.delayKill(id);
                } else {
                    e.shouldRestart = true;
                }
            }
        }
    }


    register(event, callback) {
        this.game.on(event, callback);
        this.extraEvents.push([event, callback]);
    }

    off() {
        this.remove();
        this.game
            .off("tick", this.onTick)
            .off("join", this.onJoin)
            .off("chat", this.onChat)
            .off("leave", this.onLeave)
            .off("spawn", this.onSpawn)
            .off("error", this.onError)
            .off("minimap", this.onMinimap)
            .off("leaderboard", this.onLeaderboard);
        for (const [event, cb] of this.extraEvents)
            this.game.off(event, cb);
        this.extraEvents = [];
    }

    // Virtual methods
    onTick() {};
    onJoin(controller) {};
    onChat(sender, message) {};
    onLeave(controller) {};
    onSpawn(controller) {};
    onError(err) {};
    onMinimap(controllers) {};
    onLeaderboard(controllers) {};
}