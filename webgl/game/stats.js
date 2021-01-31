module.exports = class Mouse {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf) {
        if (!buf) {
            if (self.SharedArrayBuffer) buf = new SharedArrayBuffer(32);
            else buf = new ArrayBuffer(32);
        }

        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get fps() { return Atomics.load(this.buffer, 0); }
    set fps(v) { Atomics.store(this.buffer, 0, v) }

    get ping() { return Atomics.load(this.buffer, 1); }
    set ping(v) { Atomics.store(this.buffer, 1, v); }

    get cells() { return Atomics.load(this.buffer, 2); }
    set cells(v) { Atomics.store(this.buffer, 2, v); }

    get text() { return Atomics.load(this.buffer, 3); }
    set text(v) { Atomics.store(this.buffer, 3, v); }

    get bandwidth() { return Atomics.load(this.buffer, 4); }
    set bandwidth(v) { Atomics.store(this.buffer, 4, v); }

    get mycells() { return Atomics.load(this.buffer, 5); }
    set mycells(v) { Atomics.store(this.buffer, 5, v); }

    get linelocked() { return Atomics.load(this.buffer, 6); }
    set linelocked(v) { Atomics.store(this.buffer, 6, v); }

    get score() { return Atomics.load(this.buffer, 7); }
    set score(v) { Atomics.store(this.buffer, 7, v); }

    reset() { this.buffer.fill(0); }
}