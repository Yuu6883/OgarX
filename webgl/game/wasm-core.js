module.exports = class WasmCore {
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        this.renderer = renderer;
    }
    async load(page = 1024) {
        if (this.loading || this.instance) return false;
        this.loading = true;
        const res = await fetch("/static/wasm/client.wasm");
        const m = new WebAssembly.Memory({ initial: page, maximum: page });
        const e = { env: { memory: m, 
            set_camera: (x, y, size) => {
                this.renderer.camera.position[0] = this.renderer.target.position[0] = x;
                this.renderer.camera.position[1] = this.renderer.target.position[1] = y;
            },
            debug: () => {
                console.log(this.renderer.cellTypesTable.slice(251));
            }
        } };
        this.instance = await WebAssembly.instantiate(await WebAssembly.compile(await res.arrayBuffer()), e);
        this.buffer = m.buffer;
        this.HEAPU8  = new Uint8Array(m.buffer);
        this.HEAPU16 = new Uint16Array(m.buffer);
        this.HEAPF32 = new Float32Array(m.buffer);
        this.HEAPU32 = new Uint32Array(m.buffer);
        this.loading = false;
        return true;
    }
}