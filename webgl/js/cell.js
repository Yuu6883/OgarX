module.exports = class Cell {
    /**
     * 
     * @param {DataView} view 
     * @param {number} id 
     */
    constructor(view, id) {
        this.view = view;
        this.id = id;
    }

    get type() { return this.view.getUint32(0, true); }
    get oldX() { return this.view.getFloat32(4, true); }
    get oldY() { return this.view.getFloat32(8, true); }
    get oldSize() { return this.view.getFloat32(12, true); }
    get currX() { return this.view.getFloat32(16, true); }
    get currY() { return this.view.getFloat32(20, true); }
    get currSize() { return this.view.getFloat32(24, true); }
    get netX() { return this.view.getFloat32(28, true); }
    get netY() { return this.view.getFloat32(32, true); }
    get netSize() { return this.view.getFloat32(36, true); }

    toString() {
        return `Cell#${this.id} [type: ${this.type}, x: ${this.netX}, y: ${this.netY}, size: ${this.netSize}]`;
    }

    toObject() {
        return {
            type: this.type,
            oldX: this.oldX,
            oldY: this.oldY,
            oldSize: this.oldSize,
            currX: this.currX,
            currY: this.currY,
            currSize: this.currSize,
            netX: this.netX,
            netY: this.netY,
            netSize: this.netSize
        }
    }
}