module.exports = class State {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(6)) {
        this.sharedBuffer = buf;
        this.buffer = new Uint8Array(this.sharedBuffer);
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

    exchange() {
        return {
            spectate: Atomics.exchange(this.buffer, 0, 0),
            splits: Atomics.exchange(this.buffer, 1, 0),
            ejects: Atomics.exchange(this.buffer, 2, 0),
            macro: this.macro,
            respawn: Atomics.exchange(this.buffer, 4, 0)
        }
    }
}