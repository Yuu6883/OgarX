const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const Cell = require("./cell");
const { QuadTree } = require("./quadtree");

const CORE_PATH = path.resolve(__dirname, "..", "wasm", "core.wasm");
const DefaultSettings = {
    CELL_LIMIT: 65536,
    QUADTREE_MAX_ITEMS: 16,
    QUADTREE_MAX_LEVEL: 16,
    MAP_HW: 32767, // MAX signed short
    MAP_HH: 32767, // MAX signed short,
    SAFE_SPAWN_TRIES: 64,
    SAFE_SPAWN_RADIUS: 1.5,
    PELLET_COUNT: 1000,
    PELLET_SIZE: 10,
    VIRUS_COUNT: 30,
    VIRUS_SIZE: 100,
    MOTHER_CELL_COUNT: 0,
    MOTHER_CELL_SIZE: 149,
    PLAYER_SPEED: 1,
    PLAYER_SPAWN_DELAY: 3000,
    PLAYER_DECAY_SPEED: 0.001,
    PLAYER_DECAY_MIN_SIZE: 1000,
    PLAYER_AUTOSPLIT_SIZE: 1500,
    PLAYER_MAX_CELLS: 16,
    PLAYER_SPLIT_BOOST: 780,
    PLAYER_SPLIT_DIST: 40,
    PLAYER_SPLIT_CAP: 255,
    PLAYER_MIN_SPLIT_SIZE: 60,
    PLAYER_MIN_EJECT_SIZE: 60,
    PLAYER_NO_MERGE_DELAY: 15,
    PLAYER_NO_COLLI_DELAY: 13,
    PLAYER_MERGE_TIME: 1,
    PLAYER_MERGE_INCREASE: 0.02,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_VIEW_SCALE: 1,
    EJECT_DISPERSION: 0.3,
    EJECT_SIZE: 38,
    EJECT_LOSS: 43,
    EJECT_BOOST: 780,
    EJECT_DELAY: 75, // ms
    WORLD_RESTART_MULT: 0.75,
    WORLD_KILL_OVERSIZE: false,
}

const MOTHER_CELL_TYPE = 252;
const VIRUS_TYPE = 253;
const PELLET_TYPE = 254;
const EJECTED_TYPE = 255;

/**
 * x (float) 4 bytes
 * y (float) 4 bytes
 * r (float) 4 bytes
 * type (player_id/cell type) 1 byte
 * flags (dead|inside|updated|exist) 1 byte
 * eatenBy 2 bytes
 * age 4 bytes
 * boost { 3 float } = 12 bytes
 */

const BYTES_PER_CELL = 32;

module.exports = class Engine {

    /** 
     * @param {import("../game/game")} game
     * @param {typeof DefaultSettings} options */
    constructor(game, options) {
        this.game = game;
        this.options = Object.assign({}, DefaultSettings);
        Object.assign(this.options, options);

        /** @type {Set<number>[]} */
        this.counters = Array.from({ length: 256 }, _ => new Set());
        this.shouldRestart = false;
        this.__next_cell_id = -1;
    }

    async init() {
        if (this.__start) return;

        this.__start = Date.now();
        // 60mb ram
        this.memory = new WebAssembly.Memory({ initial: 1000 });

        // Load wasm module
        const module = await WebAssembly.instantiate(
            fs.readFileSync(CORE_PATH), { env: { 
                memory: this.memory
            }});

        this.wasm = module.instance.exports;

        // Default CELL_LIMIT uses 2mb ram
        this.cells = Array.from({ length: this.options.CELL_LIMIT }, (_, i) =>
            new Cell(new DataView(this.memory.buffer, i * BYTES_PER_CELL, BYTES_PER_CELL), i));
        this.cellCount = 0;
        
        this.tree = new QuadTree(this.cells, 0, 0, 
            this.options.MAP_HW, this.options.MAP_HH, 
            this.options.QUADTREE_MAX_LEVEL,
            this.options.QUADTREE_MAX_ITEMS);

        this.treePtr = BYTES_PER_CELL * this.options.CELL_LIMIT;
        this.treeBuffer = new DataView(this.memory.buffer, this.treePtr);
        this.stackPtr = this.treePtr + 69; // hmm
    }

    get __tick() { return Date.now() - this.__start; }

    tick(dt = 1) {

        // Spawn new cells
        if (this.counters[PELLET_TYPE].size < this.options.PELLET_COUNT) {
            const point = this.getSafeSpawnPoint(this.options.PELLET_SIZE);
            this.newCell(point[0], point[1], this.options.PELLET_SIZE, PELLET_TYPE);
        }

        if (this.counters[VIRUS_TYPE].size < this.options.VIRUS_COUNT) {
            const point = this.getSafeSpawnPoint(this.options.VIRUS_SIZE);
            this.newCell(point[0], point[1], this.options.VIRUS_SIZE, VIRUS_TYPE);
        }

        if (this.counters[MOTHER_CELL_TYPE].size < this.options.MOTHER_CELL_COUNT) {
            const point = this.getSafeSpawnPoint(this.options.MOTHER_CELL_SIZE);
            this.newCell(point[0], point[1], this.options.MOTHER_CELL_SIZE, MOTHER_CELL_TYPE);
        }

        // Boost cells, reset flags, increment age
        this.wasm.update(0, this.treePtr, dt);

        // Move cells based on controller
        for (const id in this.game.controls) {
            const controller = this.game.controls[id];
            if (!controller.handle) continue;
            // Loop through all player cells (not dead)
            for (const cell_id of this.counters[id]) {
                const cell = this.cells[cell_id];

                // Calculate can merge
                if (this.options.PLAYER_MERGE_TIME > 0) {
                    const initial = Math.round(25 * this.options.PLAYER_MERGE_TIME);
                    const increase = Math.round(25 * cell.r * this.options.PLAYER_MERGE_INCREASE);
                    cell.merge = cell.age >= Math.max(this.options.PLAYER_NO_MERGE_DELAY, this.options.PLAYER_MERGE_NEW_VER ? 
                        Math.max(initial, increase) : initial + increase);
                } else cell.merge = cell.age >= this.options.PLAYER_NO_MERGE_DELAY;

                // Move cells
                let dx = controller.mouseX - cell.x;
                let dy = controller.mouseY - cell.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 1) continue; dx /= d; dy /= d;
                const speed = 88 * Math.pow(cell.r, -0.4396754) * this.options.PLAYER_SPEED;
                const m = Math.min(speed, d) * dt;
                cell.x += dx * m;
                cell.y += dy * m;
            }
        }

        // Decay player cells
        this.wasm.decay_and_auto(0, this.treePtr, dt,
            this.options.PLAYER_AUTOSPLIT_SIZE,
            this.options.PLAYER_DECAY_SPEED,
            this.options.PLAYER_DECAY_MIN_SIZE);
        
        // Autosplit
        for (const cell of this.cells) {
            if (cell.shouldAuto) {
                const cellsLeft = 1 + this.options.PLAYER_MAX_CELLS - this.counters[cell.type].size;
                if (cellsLeft <= 0) continue;
                const splitTimes = Math.min(Math.ceil(cell.r * cell.r / this.options.PLAYER_AUTOSPLIT_SIZE / this.options.PLAYER_AUTOSPLIT_SIZE), cellsLeft);
                const splitSizes = Math.min(Math.sqrt(cell.r * cell.r / splitTimes), this.options.PLAYER_AUTOSPLIT_SIZE);
                for (let i = 1; i < splitTimes; i++) {
                    const angle = Math.random() * 2 * Math.PI;
                    this.splitFromCell(cell, splitSizes, Math.sin(angle), Math.cos(angle), this.options.PLAYER_SPLIT_BOOST);
                }
                cell.r = splitSizes;
                cell.updated = true;
            }
        }

        // Bound & bounce cells
        this.wasm.bound(0, this.treePtr, 
            -this.options.MAP_HW, this.options.MAP_HW,
            -this.options.MAP_HH, this.options.MAP_HH);

        // Update quadtree
        for (const cell of this.cells) {
            if (!cell.isUpdated) continue;
            this.tree.update(cell);
            cell.resetFlag();
        }

        // Serialize quadtree, preparing for collision/eat resolution
        this.stackPtr = this.tree.serialize(this.treeBuffer) + this.treePtr;

        // Magic goes here
        this.wasm.resolve(0, this.treePtr, this.treePtr, this.stackPtr, 
            this.options.PLAYER_NO_MERGE_DELAY, this.options.PLAYER_NO_COLLI_DELAY);

        // Handle pop, update quadtree, remove dead cells

        const __now = this.__tick;
        // Handle inputs
        for (const id in this.game.controls) {
            const controller = this.game.controls[id];
            if (!controller.handle) continue;
            // Split
            let attempts = this.options.PLAYER_SPLIT_CAP;
            while (controller.splitAttempts-- > 0 && attempts-- > 0) {
                for (const cell_id of [...this.counters[id]]) {
                    const cell = this.cells[cell_id];
                    if (cell.r > this.options.PLAYER_MIN_SPLIT_SIZE) continue;
                    let dx = controller.mouseX - cell.x;
                    let dy = controller.mouseY - cell.y;
                    let d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 1) dx = 1, dy = 0, d = 1;
                    else dx /= d, dy /= d;
                    this.splitFromCell(cell, cell.r / Math.SQRT2, dx, dy, this.options.PLAYER_SPLIT_BOOST);
                }
            }

            // Eject
            if (__now >= controller.lastEjectTick + this.options.EJECT_DELAY) {
                const LOSS = this.options.EJECT_LOSS * this.options.EJECT_LOSS;
                for (const cell_id of [...this.counters[id]]) {
                    const cell = this.cells[cell_id];
                    if (cell.r < this.options.PLAYER_MIN_EJECT_SIZE) continue;
                    let dx = controller.mouseX - cell.x;
                    let dy = controller.mouseY - cell.y;
                    let d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 1) dx = 1, dy = 0, d = 1;
                    else dx /= d, dy /= d;
                    const sx = cell.x + dx * cell.r;
                    const sy = cell.y + dy * cell.r;
                    const a = Math.atan2(dx, dy) - this.options.EJECT_DISPERSION + 
                        Math.random() * 2 * this.options.EJECT_DISPERSION;
                    this.newCell(sx, sy, this.options.EJECT_SIZE, EJECTED_TYPE, 
                        Math.sin(a), Math.cos(a), this.options.EJECT_BOOST);
                    cell.r = Math.sqrt(cell.r * cell.r - LOSS);
                    cell.updated = true;
                }
                controller.lastEjectTick = __now;
            }
            
            // Update viewport
            let size = 0, size_x = 0, size_y = 0;
            let x = 0, y = 0, score = 0, factor = 0;
            let min_x = this.options.MAP_HW, max_x = -this.options.MAP_HW;
            let min_y = this.options.MAP_HH, max_y = -this.options.MAP_HH;
            for (const cell_id of this.counters[id]) {
                const cell = this.cells[cell_id];
                x += cell.x * cell.r;
                y += cell.y * cell.r;
                min_x = x < min_x ? x : min_x;
                max_x = x > max_x ? x : max_x;
                min_y = y < min_y ? y : min_y;
                max_y = y > max_y ? y : max_y;
                score += cell.r * cell.r / 100;
                size += cell.r;
            }
            factor = Math.pow(this.counters[id].size + 50, 0.1);
            controller.viewportX = x / size;
            controller.viewportY = y / size;
            size = (factor + 1) * Math.sqrt(score * 100);
            size_x = Math.max(size_x, (controller.viewportX - min_x) * 1.75);
            size_x = Math.max(size_x, (max_x - controller.viewportX) * 1.75);
            size_y = Math.max(size_x, (controller.viewportY - min_y) * 1.75);
            size_y = Math.max(size_x, (max_y - controller.viewportY) * 1.75);
            controller.viewportHW = size_x * this.options.PLAYER_VIEW_SCALE;
            controller.viewportHH = size_y * this.options.PLAYER_VIEW_SCALE;

            controller.score = score;
            controller.maxScore = score > controller.maxScore ? score : controller.maxScore;
            if (controller.score > this.options.MAP_HH * this.options.MAP_HW / 100 * this.options.WORLD_RESTART_MULT) {
                if (this.options.WORLD_KILL_OVERSIZE) {
                    // TODO: kill the player and the cells
                } else {
                    this.shouldRestart = true;
                }
            }

            if (controller.spawn && __now >= controller.lastSpawnTick + this.options.PLAYER_SPAWN_DELAY) {
                controller.spawn = false;
                controller.lastSpawnTick = __now;

                for(const cell_id of this.counters[id])
                    this.cells[cell_id].dead = true;
                this.counters[id].clear();
            }


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
     * @param {number} x 
     * @param {number} y 
     * @param {number} size
     * @param {number} type
     */
    newCell(x, y, size, type, boostX = 0, boostY = 0, boost = 0) {
        if (this.cellCount >= this.options.CELL_LIMIT)
            return console.log("CAN NOT SPAWN NEW CELL")

        while (this.cells[++this.__next_cell_id % this.options.CELL_LIMIT].exists);
        this.__next_cell_id %= this.options.CELL_LIMIT;

        const cell = this.cells[this.__next_cell_id];
        cell.x = x;
        cell.y = y;
        cell.r = size;
        cell.type = type;
        cell.boostX = boostX;
        cell.boostY = boostY;
        cell.boost = boost;
        cell.exists = true;
        this.tree.insert(cell);
        this.counters[cell.type].add(cell.id);
        this.cellCount++;
        return cell;
    }

    /** @param {number} size */
    randomPoint(size) {
        const coord_x = this.options.MAP_HW - size;
        const coord_y = this.options.MAP_HH - size;
        return [2 * Math.random() * coord_x - coord_x, 2 * Math.random() * coord_y - coord_y];
    }

    /** @param {number} size */
    getSafeSpawnPoint(size) {
        let tries = this.options.SAFE_SPAWN_TRIES;
        while (--tries) {
            const point = this.randomPoint(size);
            if (this.wasm.is_safe(0, point[0], point[1],
                size * this.options.SAFE_SPAWN_RADIUS,
                this.treePtr, this.stackPtr) > 0)
                return point;
        }
        return this.randomPoint(size);
    }

    query() {
        this.stackPtr = this.tree.serialize(this.treeBuffer) + this.treePtr;
        const q = this.wasm.is_safe(0, 0, 0, 65536, this.treePtr, this.stackPtr);
        console.log(this.tree.__serialized, q);
    }
}