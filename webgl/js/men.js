/** @type {{ instance: WebAssembly.Instance, HEAPU32: Uint32Array ,HEAPF32: Float32Array }} */
const Module = {
    loading: false,
    instance: null,
    HEAPU32: null,
    HEAPF32: null,
    load: async () => {
        if (Module.instance || Module.loading) return;
        Module.loading = true;
        const res = await fetch("cells.wasm");
        const m = new WebAssembly.Memory({ initial: 1024, maximum: 1024 });
        const e = { env: { m } };
        Module.instance = await WebAssembly.instantiate(await WebAssembly.compile(await res.arrayBuffer()), e);
        Module.HEAPF32 = new Float32Array(m.buffer);
        Module.HEAPU32 = new Uint32Array(m.buffer);
        Module.loading = false;
    }
}