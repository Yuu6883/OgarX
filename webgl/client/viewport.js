module.exports = class Viewport {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(8)) {
        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get width() { return Atomics.load(this.buffer, 0); }
    set width(v) { Atomics.store(this.buffer, 0, v) }

    get height() { return Atomics.load(this.buffer, 1); }
    set height(v) { Atomics.store(this.buffer, 1, v); }
}