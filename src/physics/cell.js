const CELL_EXISTS = 0x1;
const CELL_UPDATE = 0x2;
const CELL_INSIDE = 0x4;
const CELL_DEAD   = 0x8;
const CELL_AUTO   = 0x10;
const CELL_REMOVE = 0x20;
const CELL_MERGE  = 0x40;
const CELL_POP    = 0x80;

const TYPES_TO_STRING = { 252: "Mother Cell", 253: "Virus", 254: "Pellet", 255: "Ejected" };
const { QuadNode } = require("./quadtree");

module.exports = class Cell {
    /**
     * @param {DataView} view 
     * @param {number} id
     */
    constructor(view, id) {
        /** @type {QuadNode} */
        this.__root = null;
        this.view = view;
        this.id = id;
    }

    get x() {
        return this.view.getFloat32(0, true);
    }

    set x(value) {
        this.view.setFloat32(0, value, true);
    }

    get y() {
        return this.view.getFloat32(4, true);
    }

    set y(value) {
        this.view.setFloat32(4, value, true);
    }

    get r() {
        return this.view.getFloat32(8, true);
    }

    set r(value) {
        this.view.setFloat32(8, value, true);
    }

    get type() {
        return this.view.getUint8(12);
    }

    set type(value) {
        this.view.setUint8(12, value);
    }

    get flags() {
        return this.view.getUint8(13);
    }

    remove() {
        this.view.setUint8(13, CELL_EXISTS | CELL_REMOVE);
    }
    
    resetFlag() {
        if (this.isDead) this.view.setUint8(13, CELL_DEAD | CELL_EXISTS);
        else this.view.setUint8(13, CELL_EXISTS);
    }

    get exists() {
        return this.view.getUint8(13) & CELL_EXISTS;
    }

    get isUpdated() {
        return this.view.getUint8(13) & CELL_UPDATE;
    }

    set updated(value) {
        value && this.view.setUint8(13, this.view.getUint8(13) | CELL_UPDATE);
    }

    get isInside() {
        this.view.getUint8(13) & CELL_INSIDE;
    }

    get isDead() {
        return this.view.getUint8(13) & CELL_DEAD;
    }
    
    get shouldAuto() {
        return this.view.getUint8(13) & CELL_AUTO;
    }

    get shouldRemove() {
        return this.view.getUint8(13) & CELL_REMOVE;
    }

    set merge(value) {
        value && this.view.setUint8(13, this.view.getUint8(13) | CELL_MERGE);
    }

    get popped() {
        return this.view.getUint8(13) & CELL_POP;
    }

    get eatenBy() {
        return this.view.getUint16(14, true);
    }

    get age() {
        return this.view.getUint32(16, true);
    }
    
    get boostX() {
        return this.view.getFloat32(20, true);
    }

    set boostX(value) {
        this.view.setFloat32(20, value, true);
    }

    get boostY() {
        return this.view.getFloat32(24, true);
    }

    set boostY(value) {
        this.view.setFloat32(24, value, true);
    }

    get boost() {
        return this.view.getFloat32(28, true);
    }

    set boost(value) {
        this.view.setFloat32(28, value, true);
    }

    toString() {
        // if (!this.exists) return `Cell[None]`;
        const s = TYPES_TO_STRING[this.type];
        return `Cell#${this.id}[type=${s ? `${s}(${this.type})` : `Player#${this.type}`},x=${this.x.toFixed(2)},y=${this.y.toFixed(2)},r=${this.r.toFixed(2)},mass=${(this.r * this.r / 100000).toFixed(1)}k,flags=${this.flags.toString(2).padStart(8, "0")}]`;
    }
}