class TextureWrapper {
    /** @param {import("./texture-store")} store */
    constructor(store, key = "", persist = false) {
        this.store = store;
        this.persist = persist;
        this.key = key;
        /** @type {WebGLTexture} */
        this.tex = null;
        this.dim = [0, 0];
        this.ref = 1;
    }

    incre() { 
        if (this.persist) return;
        this.ref++;
        // console.log(`Incremented texture[${this.key}] to ${this.ref}`);
    }

    decre() { 
        if (this.persist) return;
        this.ref--;
        // console.log(`Decremented texture[${this.key}] to ${this.ref}`);
        if (this.ref <= 0) return this.destroy();
        return false;
    }

    destroy() {
        if (this.persist) return false;
        if (this.tex) {
            this.store.gl.deleteTexture(this.tex);
            this.tex = null;
            // console.log(`Destroyed texture[${this.key}]`);
            return true;
        } else return false;
    }
}

module.exports = class TextureStore {

    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        this.renderer = renderer;
        /** @type {Map<string, TextureWrapper>} */
        this.textures = new Map();
    }

    get gl() { return this.renderer.gl; }

    add(key = "", persist = false) {
        if (!key) return;
        if (this.textures.has(key)) {
            this.textures.get(key).incre();
            return false;
        } else {
            // console.log(`Added "${key}" to texture store`);
            this.textures.set(key, new TextureWrapper(this, key, persist));
            return true;
        }
    }

    get(key = "") { return this.textures.get(key); }

    /** @param {ImageBitmap} bitmap */
    setData(key = "", bitmap) {
        if (!bitmap) return;
        const T = this.get(key);

        if (T) {
            const gl = this.gl;
            gl.bindTexture(gl.TEXTURE_2D, T.tex = gl.createTexture());
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            T.dim = [bitmap.width, bitmap.height];
        } else console.warn(`Trying to call store.setData on none-existing key: "${key}"`);

        bitmap.close();
    }

    replace(oldKey = "", newKey = "") {
        if (oldKey == newKey) return;
        if (this.textures.has(oldKey) && this.textures.get(oldKey).decre()) this.textures.delete(oldKey);
        return this.add(newKey);
    }

    clear() {
        // console.log("Clearing texture store");
        for (const [key, T] of [...this.textures.entries()]) 
            T.persist || (T.destroy(), this.textures.delete(key));
    }
}