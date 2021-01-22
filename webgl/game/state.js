module.exports = class State {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf) {
        if (!buf) {
            if (self.SharedArrayBuffer) buf = new SharedArrayBuffer(100);
            else buf = new ArrayBuffer(100);
        }

        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get spectate() { return Atomics.load(this.buffer, 0); }
    set spectate(v) { Atomics.store(this.buffer, 0, v) }

    get splits() { return Atomics.load(this.buffer, 1); }
    set splits(v) { Atomics.add(this.buffer, 1, v); }

    get ejects() { return Atomics.load(this.buffer, 2); }
    set ejects(v) { Atomics.add(this.buffer, 2, v); }

    get macro() { return Atomics.load(this.buffer, 3); }
    set macro(v) { Atomics.store(this.buffer, 3, v); }

    get respawn() { return Atomics.load(this.buffer, 4); }
    set respawn(v) { Atomics.store(this.buffer, 4, v); }

    get focused() { return Atomics.load(this.buffer, 5); }
    set focused(v) { Atomics.store(this.buffer, 5, v); }

    get lineLock() { return Atomics.load(this.buffer, 6); }
    set lineLock(v) { Atomics.store(this.buffer, 6, v); }

    get skin() { return Atomics.load(this.buffer, 7); }
    set skin(v) { Atomics.store(this.buffer, 7, v) }

    get name() { return Atomics.load(this.buffer, 8); }
    set name(v) { Atomics.store(this.buffer, 8, v); }

    get mass() { return Atomics.load(this.buffer, 9); }
    set mass(v) { Atomics.store(this.buffer, 9, v); }

    get draw() { return Atomics.load(this.buffer, 10); }
    set draw(v) { Atomics.store(this.buffer, 10, v); }

    get zoom() { return Atomics.load(this.buffer, 11); }
    set zoom(v) { Atomics.store(this.buffer, 11, v); }

    get resolution() { return Atomics.load(this.buffer, 12); }
    set resolution(v) { Atomics.store(this.buffer, 12, v); }

    exchange() {
        return {
            spectate: Atomics.exchange(this.buffer, 0, 0),
            splits: Atomics.exchange(this.buffer, 1, 0),
            ejects: Atomics.exchange(this.buffer, 2, 0),
            macro: this.macro,
            respawn: Atomics.exchange(this.buffer, 4, 0),
            lineLock: Atomics.exchange(this.buffer, 6, 0)
        }
    }
}