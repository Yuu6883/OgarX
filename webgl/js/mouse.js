module.exports = class Mouse {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(12)) {
        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get x() { return Atomics.load(this.buffer, 0); }
    set x(v) { Atomics.store(this.buffer, 0, v) }

    get y() { return Atomics.load(this.buffer, 1); }
    set y(v) { Atomics.store(this.buffer, 1, v); }

    get scroll() { return Atomics.load(this.buffer, 2); }
    set scroll(v) { Atomics.store(this.buffer, 2, v); }
    
    updateScroll(v) { Atomics.add(this.buffer, 2, v); }
    resetScroll() { return Atomics.exchange(this.buffer, 2, 0); }
}