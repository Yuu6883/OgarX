module.exports = class State {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf) {
        if (!buf) {
            if (self.SharedArrayBuffer) buf = new SharedArrayBuffer(200);
            else buf = new ArrayBuffer(200);
        }

        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get resolution() { return [[1920, 1080], [1280, 720], [854, 480]][this.quality] || [1920, 1080]; }

    get spectate() { return Atomics.load(this.buffer, 0); }
    set spectate(v) { Atomics.store(this.buffer, 0, v); }

    get splits() { return Atomics.load(this.buffer, 1); }
    set splits(v) { Atomics.add(this.buffer, 1, v); }

    get ejects() { return Atomics.load(this.buffer, 2); }
    set ejects(v) { Atomics.add(this.buffer, 2, v); }

    get macro() { return Atomics.load(this.buffer, 3); }
    set macro(v) { Atomics.store(this.buffer, 3, v); }

    get respawn() { return Atomics.load(this.buffer, 4); }
    set respawn(v) { Atomics.store(this.buffer, 4, v); }

    get visible() { return Atomics.load(this.buffer, 5); }
    set visible(v) { Atomics.store(this.buffer, 5, v); }

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

    get auto_respawn() { return Atomics.load(this.buffer, 12); }
    set auto_respawn(v) { Atomics.store(this.buffer, 12, v); }

    get clip() { return Atomics.load(this.buffer, 13); }
    set clip(v) { Atomics.store(this.buffer, 13, v); }
    
    get skin_quality() { return Atomics.load(this.buffer, 14); }
    set skin_quality(v) { Atomics.store(this.buffer, 14, v); }
    
    get text_quality() { return Atomics.load(this.buffer, 15); }
    set text_quality(v) { Atomics.store(this.buffer, 15, v); }
    
    get circle_quality() { return Atomics.load(this.buffer, 16); }
    set circle_quality(v) { Atomics.store(this.buffer, 16, v); }

    get circle_radius() { return [1024, 512, 256, 128][this.circle_quality]; }
    get skin_dim() { return [1024, 512, 256, 128][this.skin_quality]; }
    
    get ignore_skin() { return Atomics.load(this.buffer, 17); }
    set ignore_skin(v) { Atomics.store(this.buffer, 17, v); }
    
    get mouse_sync() { return Atomics.load(this.buffer, 18); }
    set mouse_sync(v) { Atomics.store(this.buffer, 18, v); }

    get quality() { return Atomics.load(this.buffer, 19); }
    set quality(v) { Atomics.store(this.buffer, 19, v); }

    set clicked(v) { Atomics.store(this.buffer, 20, v); }

    exchange() {
        return {
            splits: Atomics.exchange(this.buffer, 1, 0),
            ejects: Atomics.exchange(this.buffer, 2, 0),
            macro: this.macro,
            respawn: Atomics.exchange(this.buffer, 4, 0),
            lineLock: Atomics.exchange(this.buffer, 6, 0),
            clip: Atomics.exchange(this.buffer, 13, 0),
            clicked: Atomics.exchange(this.buffer, 20, 0)
        }
    }
}