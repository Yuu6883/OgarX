
if (typeof performance == "undefined") {
    eval(`global.performance = require("perf_hooks").performance;`);
}

/** @template T @param {T[]} array */
const pick = array => array[~~(Math.random() * array.length)];

/**
 * @param {number} v 
 * @param {number} min 
 * @param {number} max 
 */
const clamp = (v, min, max) => v <= min ? min : v >= max ? max : v;

/**
 * @param {number} min 
 * @param {number} max 
 */
const range = (min, max) => Math.random() * (max - min) + min;

const Cell = require("./cell");
const QuadTree = require("./quadtree");
const Controller = require("../game/controller");
const Bot = require("../bot");

const CELL_LIMIT = 65536;

const DefaultSettings = {
    TIME_SCALE: 1,
    PHYSICS_TPS: 20,
    MINIMAP_TPS: 5,
    LEADERBOARD_TPS: 2,
    MAX_CELL_PER_TICK: 50,
    QUADTREE_MAX_ITEMS: 24,
    QUADTREE_MAX_LEVEL: 16,
    MAP_HW: 20000, // MAX signed short = 32767
    MAP_HH: 20000,
    SAFE_SPAWN_TRIES: 64,
    PLAYER_SAFE_SPAWN_RADIUS: 1.5,
    VIRUS_SAFE_SPAWN_RADIUS: 3,
    PELLET_COUNT: 1000,
    PELLET_SIZE: 10,
    VIRUS_PUSH: false,
    VIRUS_COUNT: 30,
    VIRUS_SIZE: 100,
    VIRUS_FEED_TIMES: 20,
    VIRUS_PUSH_BOOST: 780,
    VIRUS_SPLIT_BOOST: 120,
    VIRUS_MAX_BOOST: 1000,
    VIRUS_MONOTONE_POP: false,
    // MOTHER_CELL_COUNT: 0,
    // MOTHER_CELL_SIZE: 149,
    PLAYER_SPEED: 1.5,
    PLAYER_SPAWN_DELAY: 3000,
    PLAYER_AUTOSPLIT_SIZE: 1500,
    PLAYER_AUTOSPLIT_DELAY: 100,
    PLAYER_MAX_CELLS: 16,
    PLAYER_SPAWN_SIZE: 32,
    PLAYER_SPLIT_BOOST: 800,
    PLAYER_SPLIT_DIST: 40,
    PLAYER_SPLIT_CAP: 4,
    PLAYER_MIN_SPLIT_SIZE: 60,
    PLAYER_MIN_EJECT_SIZE: 60,
    NORMALIZE_THRESH_MASS: 0,
    PLAYER_NO_MERGE_DELAY: 650,
    PLAYER_NO_COLLI_DELAY: 650,
    PLAYER_NO_EJECT_DELAY: 200,
    PLAYER_NO_EJECT_POP_DEALY: 500,
    PLAYER_MERGE_TIME: 1,
    PLAYER_MERGE_INCREASE: 1,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_VIEW_SCALE: 1,
    PLAYER_VIEW_MIN: 4000,
    PLAYER_DEAD_DELAY: 5000,
    PLAYER_NAME_MAX_LENGTH: 16,
    STATIC_DECAY: 1,
    DYNAMIC_DECAY: 1,
    DECAY_MIN: 1000,
    BOTS: 1,
    BOT_SPAWN_SIZE: 1000,
    EJECT_DISPERSION: 0.3,
    EJECT_SIZE: 38,
    EJECT_LOSS: 43,
    EJECT_BOOST: 780,
    EJECT_DELAY: 100, // ms
    EJECT_MAX_AGE: 10000,
    WORLD_RESTART_MULT: 0.75,
    WORLD_KILL_OVERSIZE: false,
    WORLD_OVERSIZE_MESSAGE: "${c.name} died from oversize",
    EAT_OVERLAP: 3,
    EAT_MULT: 1.140175425099138,
    SOCKET_MOUSE_SYNC: true,
    SOCKET_WATERMARK: 1024 * 512, // 500kb
    IGNORE_TYPE: 253
}

const DEAD_CELL_TYPE = 251;
// const MOTHER_CELL_TYPE = 252;
const VIRUS_TYPE = 253;
const PELLET_TYPE = 254;
const EJECTED_TYPE = 255;

/**
 * x (float) 4 bytes
 * y (float) 4 bytes
 * r (float) 4 bytes
 * type (player_id/cell type) 1 byte
 * flags (inside|updated|exist|etc) 1 byte
 * eatenBy 2 bytes
 * age 4 bytes
 * boost { 3 float } = 12 bytes
 */

module.exports = class Engine {

    /** @param {import("../game")} game */
    constructor(game) {
        this.game = game;
        this.options = Object.assign({}, DefaultSettings);
        this.collisions = 0;
        this.shouldRestart = false;

        /** @type {Bot[]} */
        this.bots = [];
    }
    
    /** @param {typeof DefaultSettings} options */
    setOptions(options) {
        Object.assign(this.options, options);
    }

    /** @param {ArrayBuffer|Buffer} wasm_buffer */
    async init(wasm_buffer) {
        if (this.wasm) return;

        this.__start = performance.now();
        this.__ltick = performance.now();

        // 12.8mb ram (more than enough)
        this.memory = new WebAssembly.Memory({ initial: 200 });

        // Load wasm module
        const module = await WebAssembly.instantiate(
            wasm_buffer, { env: { 
                memory: this.memory,
                powf: Math.pow,
                unlock_line: id => this.game.controls[id].unlock(),
                get_score: id => this.game.controls[id].score,
                get_line_a: id => this.game.controls[id].linearEquation[0],
                get_line_b: id => this.game.controls[id].linearEquation[1],
                get_line_c: id => this.game.controls[id].linearEquation[2],
                remove_cell: (id, type, eatenBy, eatenByType) => this.removeCell(id, type, eatenBy, eatenByType),
                split_virus: (x, y, bx, by) => this.splitVirus(x, y, bx, by),
                pop_player: (id, type, mass) => this.popPlayer(id, type, mass),
                tree_update: id => this.tree.update(this.cells[id]),
                console_log: console.log
            }
        });

        this.wasm = module.instance.exports;
        /** @type {number} */
        this.BYTES_PER_CELL = this.wasm.bytes_per_cell();
        this.bindBuffers();
    }

    bindBuffers() {
        
        /** @type {Set<number>[]} */
        this.counters = Array.from({ length: 256 }, _ => new Set());
        this.__next_cell_id = 1;

        // Fill 0 in case we are reusing the buffer
        new Uint32Array(this.memory.buffer).fill(0);

        // Default CELL_LIMIT uses 2mb ram
        this.cells = Array.from({ length: CELL_LIMIT }, (_, i) =>
            new Cell(new DataView(this.memory.buffer, i * this.BYTES_PER_CELL, this.BYTES_PER_CELL), i));
        this.cellCount = 0;
        
        this.tree = new QuadTree(this.cells, 0, 0, 
            this.options.MAP_HW, this.options.MAP_HH, 
            this.options.QUADTREE_MAX_LEVEL,
            this.options.QUADTREE_MAX_ITEMS);

        this.indices = 0;
        this.indicesPtr = this.BYTES_PER_CELL * CELL_LIMIT;
        this.resolveIndices = new DataView(this.memory.buffer, this.indicesPtr);

        // Not defined here since it's dynamically changed (after indices)
        this.treePtr = 0;
        this.treeBuffer = null;

        /** @type {number[]} */
        this.removedCells = [];
        /** @type {[number, boolean][]} */
        this.killArray = [];
        /** @type {Set<number>} */
        this.spawnSet = new Set();
    }

    get running() { return !!this.updateInterval; }

    start() {
        if (this.running) return;
        this.__ltick = performance.now();

        this.tickDelay = 1000 / this.options.PHYSICS_TPS;
        this.updateInterval = setInterval(() => {
            this.__now = performance.now();
            this.tick((this.__now - this.__ltick) * this.options.TIME_SCALE);
            this.__ltick = this.__now;
            this.usage = (performance.now() - this.__now) / this.tickDelay;
        }, this.tickDelay);

        this.lbDelay = 1000 / this.options.LEADERBOARD_TPS;
        this.leaderboardInterval = setInterval(() => {
            const lb = this.game.controls.filter(c => c.alive).sort((a, b) => b.score - a.score);
            this.game.emit("leaderboard", lb);
        }, this.lbDelay);

        this.minimapDelay = 1000 / this.options.MINIMAP_TPS;
        this.minimapInterval = setInterval(() => {
            const minimap = this.game.controls.filter(c => c.showOnMinimap && c.alive);
            this.game.emit("minimap", minimap);
        }, this.minimapDelay);
    }

    stop() {
        if (this.running) {
            clearInterval(this.updateInterval);
            clearInterval(this.leaderboardInterval);
            clearInterval(this.minimapInterval);
        }
        this.updateInterval = null;
        this.leaderboardInterval = null;
        this.minimapInterval = null;
    }

    restart() {
        this.shouldRestart = false;
        this.game.emit("restart");
        this.bindBuffers();
    }
    
    /** @param {Controller} controller */
    delaySpawn(controller) {
        controller.spawn = false;
        this.spawnSet.add(controller.id);
    }

    delayKill(id = 0, replace = false) {
        if (!this.game.controls[id].alive) return; // not alive, nothing to kill
        this.killArray.push([id, replace]);
    }

    /** @param {number} dt */
    tick(dt) {

        if (this.shouldRestart) this.restart();

        // Has player
        if (this.game.handles > this.bots.length &&
            this.bots.length < this.options.BOTS)
            this.bots.push(new Bot(this.game));

        this.alivePlayers = this.game.controls.filter(c => c.alive && !(c.handle instanceof Bot));

        // No need to reserve space for indices now since we are only going to query it
        this.treePtr = this.BYTES_PER_CELL * CELL_LIMIT;
        this.treeBuffer = new DataView(this.memory.buffer, this.treePtr);
        // Serialize again so client can query viewport
        this.serialize();

        // Emit tick
        this.game.emit("tick");

        this.spawnCells();
        this.handleInputs(dt);
        this.updateIndices();
        this.updateCells(dt);
        this.updatePlayerCells(dt);
        this.updateTree();
        this.handleKills();

        // Sort indices (because we added new cells and we need to sort by size)
        this.sortIndices();
        // Serialize quadtree, preparing for collision/eat resolution
        this.serialize();

        this.resolve();
    }

    spawnCells() {
        // Spawn new cells
        for (let i = 0; i < this.options.MAX_CELL_PER_TICK; i++) {
            if (this.counters[PELLET_TYPE].size < this.options.PELLET_COUNT) {
                const [x, y] = this.randomPoint(this.options.PELLET_SIZE);
                this.newCell(x, y, this.options.PELLET_SIZE, PELLET_TYPE);
            } else break;
        }

        for (let i = 0; i < this.options.MAX_CELL_PER_TICK; i++) {
            if (this.counters[VIRUS_TYPE].size < this.options.VIRUS_COUNT) {
                const [x, y, success] = this.getSafeSpawnPoint(this.options.VIRUS_SIZE * this.options.VIRUS_SAFE_SPAWN_RADIUS);
                success && this.newCell(x, y, this.options.VIRUS_SIZE, VIRUS_TYPE);
            } else break;
        }

        for (const id of [...this.spawnSet]) {
            const c = this.game.controls[id];
            // Somehow still alive
            if (c.alive) {
                this.spawnSet.delete(id);
                continue;
            }

            // Success varaible
            let s;
            if (c.handle instanceof Bot) {
                const [x, y, success] = this.getSafeSpawnPoint(this.options.BOT_SPAWN_SIZE * this.options.PLAYER_SAFE_SPAWN_RADIUS);
                success && this.newCell(x, y, this.options.BOT_SPAWN_SIZE, id);
                s = success;
            } else {
                const [x, y, success] = this.getPlayerSpawnPoint();
                success && this.newCell(x, y, this.options.PLAYER_SPAWN_SIZE, id);
                s = success;
            }

            if (s) {
                this.spawnSet.delete(id);
                this.game.emit("spawn", c);
                c.afterSpawn();
            }
        }
    }

    handleInputs(dt) {
        for (const id in this.game.controls) {
            const controller = this.game.controls[id];
            if (!controller.handle) continue;
            
            const MULTI = this.options.NORMALIZE_THRESH_MASS ? 
                Math.max(Math.sqrt(controller.score / this.options.NORMALIZE_THRESH_MASS), 1) : 1;
            const MIN_SPLIT_SIZE = MULTI * this.options.PLAYER_MIN_SPLIT_SIZE;
            const SPLIT_R_THRESH = Math.sqrt(this.options.NORMALIZE_THRESH_MASS * 100);
            const boost = this.options.PLAYER_SPLIT_BOOST;

            // Split
            let attempts = this.options.PLAYER_SPLIT_CAP;
            while (controller.splitAttempts > 0 && attempts-- > 0) {
                for (const cell_id of [...this.counters[id]]) {
                    const cell = this.cells[cell_id];
                    if (this.counters[id].size >= this.options.PLAYER_MAX_CELLS) break;
                    const r = cell.r;
                    if (r < MIN_SPLIT_SIZE) continue;
                    let dx = controller.mouseX - cell.x;
                    let dy = controller.mouseY - cell.y;
                    let d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 1) dx = 1, dy = 0, d = 1;
                    else dx /= d, dy /= d;
                    const MULTI_2 = SPLIT_R_THRESH ? Math.max(r / SPLIT_R_THRESH, 1) : 1;
                    this.splitFromCell(cell, cell.r * Math.SQRT1_2, dx, dy, MULTI_2 * boost);
                }
                controller.splitAttempts--;
            }

            let ejected = 0;
            let maxEjectPerTick = dt / this.options.EJECT_DELAY;
            // Eject
            if (this.__now > controller.lastPoppedTick + this.options.PLAYER_NO_EJECT_POP_DEALY) {

                while (controller.lastEjectTick <= this.__now + dt && 
                    (controller.ejectAttempts > 0 || controller.ejectMarco) && 
                    maxEjectPerTick--) {
                    controller.ejectAttempts = Math.max(controller.ejectAttempts - 1, 0);
                    ejected++;

                    const r_th = Math.sqrt(this.options.NORMALIZE_THRESH_MASS * 100);

                    for (const cell_id of [...this.counters[id]]) {
                        const cell = this.cells[cell_id];
                        
                        const r = cell.r;
                        const MULTI = r_th ? Math.max(r / r_th, 1) : 1;
                        const LOSS = MULTI * MULTI * this.options.EJECT_LOSS * this.options.EJECT_LOSS;
                        const EJECT_SIZE = this.options.EJECT_SIZE * MULTI;
                        const MIN_EJECT_SIZE = this.options.PLAYER_MIN_EJECT_SIZE * MULTI;
                        const EJECT_BOOST = this.options.EJECT_BOOST * MULTI;
                        
                        if (r < MIN_EJECT_SIZE) continue;
                        if (cell.age < this.options.PLAYER_NO_EJECT_DELAY) continue;
                        
                        const x = cell.x, y = cell.y;
                        let dx = controller.mouseX - x;
                        let dy = controller.mouseY - y;
                        let d = Math.sqrt(dx * dx + dy * dy);
                        if (d < 1) dx = 1, dy = 0, d = 1;
                        else dx /= d, dy /= d;
                        const sx = x + dx * r;
                        const sy = y + dy * r;
                        const a = Math.atan2(dx, dy) - this.options.EJECT_DISPERSION + 
                            Math.random() * 2 * this.options.EJECT_DISPERSION;
                        
                        this.newCell(sx, sy, EJECT_SIZE, EJECTED_TYPE, 
                            Math.sin(a), Math.cos(a), EJECT_BOOST);
                        cell.r = Math.sqrt(r * r - LOSS);
                        cell.updated = true;
                    }
    
                    controller.lastEjectTick = this.__now + ejected * this.options.EJECT_DELAY;
                }
            }

            // Idle spectate
            // if (!this.counters[id].size && !controller.spawn) {
            //     controller.viewportX = 0;
            //     controller.viewportY = 0;
            //     controller.viewportHW = 1920 / 2;
            //     controller.viewportHH = 1080 / 2;
            //     continue;
            // }

            if (controller.alive) {
                // Update viewport
                let size = 0, size_x = 0, size_y = 0;
                let x = 0, y = 0, score = 0, factor = 0;
                let min_x = this.options.MAP_HW, max_x = -this.options.MAP_HW;
                let min_y = this.options.MAP_HH, max_y = -this.options.MAP_HH;

                for (const cell_id of this.counters[id]) {
                    const cell = this.cells[cell_id];
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

                controller.box.l = min_x;
                controller.box.r = max_x;
                controller.box.b = min_y;
                controller.box.t = max_y;

                size = size || 1;
                factor = Math.pow(this.counters[id].size + 50, 0.05);
                controller.viewportX = x / size;
                controller.viewportY = y / size;
                size = (factor + 1) * Math.sqrt(score * 100);
                size_x = size_y = Math.max(size, this.options.PLAYER_VIEW_MIN) * this.options.PLAYER_VIEW_SCALE;
                size_x = Math.max(size_x, (controller.viewportX - min_x) * 1.75);
                size_x = Math.max(size_x, (max_x - controller.viewportX) * 1.75);
                size_y = Math.max(size_y, (controller.viewportY - min_y) * 1.75);
                size_y = Math.max(size_y, (max_y - controller.viewportY) * 1.75);
                controller.viewportHW = size_x;
                controller.viewportHH = size_y;
    
                controller.score = score;
                controller.maxScore = score > controller.maxScore ? score : controller.maxScore;
                if (controller.score > this.options.MAP_HH * this.options.MAP_HW / 100 * this.options.WORLD_RESTART_MULT) {
                    this.game.emit("oversize", controller);
                    if (this.options.WORLD_KILL_OVERSIZE) {
                        this.delayKill(id);
                    } else {
                        this.shouldRestart = true;
                    }
                }
            }

            // Spawn
            if (controller.canSpawn) this.delaySpawn(controller);
        }
    }

    updateIndices() {
        let offset = 0;
        for (let type = 0; type < this.counters.length; type++) {
            const iter = type ? this.counters[type] : this.removedCells;
            for (const cell_id of iter) {
                this.resolveIndices.setUint16(offset, cell_id, true);
                offset += 2;
            }
        }
        
        this.resolveIndices.setUint16(offset, 0, true);
        offset += 2;

        this.indices = offset >> 1;
        this.treePtr = this.indicesPtr + offset;
        this.treeBuffer = new DataView(this.memory.buffer, this.treePtr);
    }

    updateCells(dt) {
        this.wasm.update(0, this.indicesPtr, dt,
            this.options.EJECT_MAX_AGE,
            this.options.PLAYER_AUTOSPLIT_SIZE,
            this.options.DECAY_MIN,
            this.options.STATIC_DECAY,
            this.options.DYNAMIC_DECAY,
            -this.options.MAP_HW, this.options.MAP_HW,
            -this.options.MAP_HH, this.options.MAP_HH);
    }

    updatePlayerCells(dt) {
        const initial = Math.round(1000 * this.options.PLAYER_MERGE_TIME);
        
        let ptr = this.indicesPtr + (this.removedCells.length << 1);
        for (const id in this.game.controls) {
            const c = this.game.controls[~~id];
            if (!c.handle) continue;
            const s = this.counters[~~id].size;
            const norm = this.options.NORMALIZE_THRESH_MASS ?
                Math.min(Math.sqrt(this.options.NORMALIZE_THRESH_MASS / c.score), 1) : 1;

            s && this.wasm.update_player_cells(0, ptr, s,
                c.mouseX, c.mouseY, 
                c.lockDir, c.linearEquation[0], c.linearEquation[1], c.linearEquation[2],
                dt,
                initial, this.options.PLAYER_MERGE_INCREASE, this.options.PLAYER_SPEED, norm,
                this.options.PLAYER_MERGE_TIME, this.options.PLAYER_NO_MERGE_DELAY, this.options.PLAYER_MERGE_NEW_VER);
            ptr += s << 1;
        }
    }

    updateTree() {
        // Autosplit and update quadtree
        if (this.options.PLAYER_AUTOSPLIT_SIZE) {
            // starting after removed cells
            for (let i = this.removedCells.length; i < this.indices - 1; i++) {
                const index = this.resolveIndices.getUint16(i * 2, true);
                const cell = this.cells[index];

                if (cell.shouldAuto && cell.age > this.options.PLAYER_AUTOSPLIT_DELAY) {
                    // const cellsLeft = 1 + this.options.PLAYER_MAX_CELLS - this.counters[cell.type].size;
                    // if (cellsLeft <= 0) continue;
                    const splitTimes = Math.ceil(cell.r * cell.r / this.options.PLAYER_AUTOSPLIT_SIZE / this.options.PLAYER_AUTOSPLIT_SIZE);
                    const splitSizes = Math.min(Math.sqrt(cell.r * cell.r / splitTimes), this.options.PLAYER_AUTOSPLIT_SIZE);
                    for (let i = 1; i < splitTimes; i++) {
                        const angle = Math.random() * 2 * Math.PI;
                        this.splitFromCell(cell, splitSizes, Math.sin(angle), Math.cos(angle), this.options.PLAYER_SPLIT_BOOST);
                    }
                    cell.r = splitSizes;
                    cell.updated = true;
                }

                // Update quadtree
                if (cell.type > 250 && !cell.isUpdated) continue;
                this.tree.update(cell);
            }
        } else {
            // Only update quadtree (starting after removed cells)
            for (let i = this.removedCells.length; i < this.indices - 1; i++) {
                const index = this.resolveIndices.getUint16(i * 2, true);
                const cell = this.cells[index];
                // Update quadtree
                if (cell.type > 250 && !cell.isUpdated) continue;
                this.tree.update(cell);
            }
        }
    }

    handleKills() {
        // Delayed kill, so the flags will be read after resolve and update quadtree
        for (const [id, replace] of this.killArray) 
            this.kill(id, replace);
        this.killArray = [];
    }

    /**
     * Only set the bit for remove
     * @param {number} id
     * @param {boolean} replace
     */
    kill(id, replace) {
        if (replace) {
            for (const cell_id of this.counters[id]) {
                const cell = this.cells[cell_id];
                const deadCell = this.newCell(cell.x, cell.y, cell.r, DEAD_CELL_TYPE, 
                    cell.boostX, cell.boostY, cell.boost, false); // Don't insert it because we just swap it
                this.tree.swap(cell, deadCell); // Swap it with current cell, no need to update the tree
                this.wasm.clear_cell(0, cell_id); // 0 out memory of this cell because it's not needed anymore
            }
            this.game.controls[id].deadTick = true;
        } else {
            for (const cell_id of this.counters[id]) this.cells[cell_id].remove();
        }
        this.counters[id].clear();
    }

    resolve() {
        this.removedCells = [];
        const VIRUS_MAX_SIZE = Math.sqrt(this.options.VIRUS_SIZE * this.options.VIRUS_SIZE +
            this.options.EJECT_SIZE * this.options.EJECT_SIZE * this.options.VIRUS_FEED_TIMES);

        // Magic goes here
        this.collisions = this.wasm.resolve(0,
            this.indicesPtr, this.counters[PELLET_TYPE].size,
            this.treePtr, this.stackPtr,
            this.options.PLAYER_NO_MERGE_DELAY, this.options.PLAYER_NO_COLLI_DELAY,
            this.options.EAT_OVERLAP, this.options.EAT_MULT, 
            this.options.VIRUS_PUSH_BOOST, this.options.VIRUS_MAX_BOOST,
            this.options.VIRUS_SIZE, VIRUS_MAX_SIZE, this.options.PLAYER_DEAD_DELAY);
    }

    /**
     * 
     * @param {number} id 
     * @param {number} type 
     * @param {number} eatenBy 
     * @param {number} eatenByType 
     */
    removeCell(id, type, eatenBy, eatenByType) {
        this.tree.remove(this.cells[id]);
        this.counters[type].delete(id);
        this.removedCells.push(id);
        this.cellCount--;
        if (type <= 250 && !this.counters[type].size) {
            eatenBy && this.game.controls[eatenByType].kills++;
            this.game.controls[type].surviveTime = this.__now - this.game.controls[type].lastSpawnTick;
            this.game.controls[type].lastSpawnTick = this.__now;
            this.game.controls[type].dead = true;
            this.game.controls[type].score = 0;
        }
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {number} boostX 
     * @param {number} boostY 
     */
    splitVirus(x, y, boostX, boostY) {
        const angle = Math.atan2(boostX, boostY);
        this.newCell(x, y, this.options.VIRUS_SIZE, VIRUS_TYPE, 
            Math.sin(angle), Math.cos(angle), this.options.VIRUS_SPLIT_BOOST);
    }

    /**
     * @param {number} id
     * @param {number} type
     * @param {number} mass
     */
    popPlayer(id, type, mass) {
        this.game.controls[type].lastPoppedTick = this.__now;
        const splits = this.distributeCellMass(type, mass);
        splits.length && (this.game.controls[type].lockDir = false);
        for (const mass of splits) {
            const angle = Math.random() * 2 * Math.PI;
            this.splitFromCell(this.cells[id], Math.sqrt(mass * 100),
                Math.sin(angle), Math.cos(angle), this.options.PLAYER_SPLIT_BOOST);
        }
    }

    /**
     * @param {Cell} cell
     * @param {number} size
     * @param {number} boostX
     * @param {number} boostY
     * @param {number} boost
     */
    splitFromCell(cell, size, boostX, boostY, boost) {
        cell.r = Math.sqrt(cell.r * cell.r - size * size);
        cell.updated = true;
        const x = cell.x + this.options.PLAYER_SPLIT_DIST * boostX;
        const y = cell.y + this.options.PLAYER_SPLIT_DIST * boostY;
        this.newCell(x, y, size, cell.type, boostX, boostY, boost);
    }

    /**
     * @param {number} type
     * @param {number} mass
     * @returns {number[]}
     */
    distributeCellMass(type, mass) {
        let cellsLeft = this.options.PLAYER_MAX_CELLS - this.counters[type].size;
        if (cellsLeft <= 0) return [];
        let splitMin = this.options.PLAYER_MIN_SPLIT_SIZE;
        splitMin = splitMin * splitMin / 100;
        const cellMass = mass;
        if (this.options.VIRUS_MONOTONE_POP) {
            const amount = Math.min(Math.floor(cellMass / splitMin), cellsLeft);
            const perPiece = cellMass / (amount + 1);
            return new Array(amount).fill(perPiece);
        }
        if (cellMass / cellsLeft < splitMin) {
            let amount = 2, perPiece = NaN;
            while ((perPiece = cellMass / (amount + 1)) >= splitMin && amount * 2 <= cellsLeft)
                amount *= 2;
            return new Array(amount).fill(perPiece);
        }
        const splits = [];
        let nextMass = cellMass / 2;
        let massLeft = cellMass / 2;
        while (cellsLeft > 0) {
            if (nextMass / cellsLeft < splitMin) break;
            while (nextMass >= massLeft && cellsLeft > 1)
                nextMass /= 2;
            splits.push(nextMass);
            massLeft -= nextMass;
            cellsLeft--;
        }
        nextMass = massLeft / cellsLeft;
        return splits.concat(new Array(cellsLeft).fill(nextMass));
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {number} size
     * @param {number} type
     * @return {Cell}
     */
    newCell(x, y, size, type, boostX = 0, boostY = 0, boost = 0, insert = true) {
        
        if (this.cellCount >= CELL_LIMIT - 1) {
            this.stop();
            return console.log("CAN NOT SPAWN NEW CELL: " + this.cellCount);
        }

        let tries = 0;
        while (this.cells[this.__next_cell_id].exists) {
            this.__next_cell_id = ((this.__next_cell_id + 1) % CELL_LIMIT) || 1;
            tries++;
            if (tries >= 65536) {
                console.log("CAN NOT SPAWN NEW CELL: " + this.cellCount);
                process.exit(1);
            }
        }

        const cell = this.cells[this.__next_cell_id];
        cell.x = x;
        cell.y = y;
        cell.r = size;
        cell.type = type;
        cell.boostX = boostX;
        cell.boostY = boostY;
        cell.boost = boost;
        cell.resetFlag();
        
        if (insert) {
            this.tree.insert(cell);
            this.cellCount++;
        }

        this.counters[cell.type].add(cell.id);
        return cell;
    }

    /** @param {number} size */
    randomPoint(size, xmin = -this.options.MAP_HW, xmax = this.options.MAP_HW,
        ymin = -this.options.MAP_HH, ymax = this.options.MAP_HH) {

        xmin = clamp(xmin, -this.options.MAP_HW + size, this.options.MAP_HW - size);
        xmax = clamp(xmax, -this.options.MAP_HW + size, this.options.MAP_HW - size);

        ymin = clamp(ymin, -this.options.MAP_HH + size, this.options.MAP_HH - size);
        ymax = clamp(ymax, -this.options.MAP_HH + size, this.options.MAP_HH - size);

        return [range(xmin, xmax), range(ymin, ymax)];
    }

    /** @returns {[number, number, boolean]} */
    getPlayerSpawnPoint() {
        const s = this.options.PLAYER_SPAWN_SIZE;
        const safeRadius = s * this.options.PLAYER_SAFE_SPAWN_RADIUS;

        if (this.alivePlayers.length) {

            const target = pick(this.alivePlayers);

            const xmin = target.box.l - this.options.PLAYER_VIEW_MIN;
            const xmax = target.box.r + this.options.PLAYER_VIEW_MIN;
            const ymin = target.box.b - this.options.PLAYER_VIEW_MIN;
            const ymax = target.box.t + this.options.PLAYER_VIEW_MIN;
            
            let tries = this.options.SAFE_SPAWN_TRIES;
            while (--tries) {
                const [x, y] = this.randomPoint(s, xmin, xmax, ymin, ymax);
                if (this.wasm.is_safe(0, x, y, safeRadius, this.treePtr, this.stackPtr, this.options.IGNORE_TYPE) > 0)
                    return [x, y, true];
            }
        }

        return this.getSafeSpawnPoint(safeRadius);
    }

    /** 
     * @param {number} size 
     * @returns {[number, number, boolean]}
     */
    getSafeSpawnPoint(size) {
        if (!this.treePtr) return [null, null, false];

        let tries = this.options.SAFE_SPAWN_TRIES;
        while (--tries) {
            const [x, y] = this.randomPoint(size);
            const res = this.wasm.is_safe(0, x, y, size, this.treePtr, this.stackPtr, this.options.IGNORE_TYPE);
            if (res >= 0) return [x, y, true];
        }
        return [null, null, false];
    }

    // Sort all the cell indices according to their size (to make solotrick work)
    sortIndices() {

        let offset = 0;
        for (let type = 0; type < this.counters.length; type++) {
            const iter = this.counters[type];
            for (const cell_id of iter) {
                this.resolveIndices.setUint16(offset, cell_id, true);
                offset += 2;
            }
        }
        
        this.resolveIndices.setUint16(offset, 0, true);
        offset += 2;

        this.indices = offset >> 1;

        let ptr = this.indicesPtr;
        for (let type = 0; type <= 250; type++) {
            const s = this.counters[type].size;
            s && this.wasm.sort_indices(0, ptr, s);
            ptr += s << 1;
        }

        this.treePtr = this.indicesPtr + offset;
        this.treeBuffer = new DataView(this.memory.buffer, this.treePtr);
    }

    serialize() {
        this.stackPtr = this.tree.serialize(this.treeBuffer) + this.treePtr;
    }

    /** @param {Controller} controller */
    query(controller) {
        // 4 = pointer size, second 4 is because 4 nodes per level so we need to reserve enough space for the stack
        let listPtr = this.stackPtr + 4 * 4 * this.options.QUADTREE_MAX_LEVEL;
        listPtr % 2 && listPtr++; // Multiple of 2

        const length = this.wasm.select(0, this.treePtr, 
            this.stackPtr, listPtr,
            controller.viewportX - controller.viewportHW, controller.viewportX + controller.viewportHW,
            controller.viewportY - controller.viewportHH, controller.viewportY + controller.viewportHH);
        
        return new Uint16Array(this.memory.buffer, listPtr, length);
    }
}

module.exports.DefaultSettings = DefaultSettings;