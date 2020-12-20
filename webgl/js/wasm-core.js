module.exports = class WasmCore {
    async load(page = 1024) {
        if (this.loading || this.instance) return false;
        this.loading = true;
        const res = await fetch("/wasm/client.wasm");
        const m = new WebAssembly.Memory({ initial: page, maximum: page });
        const e = { env: { memory: m, print: console.log } };
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