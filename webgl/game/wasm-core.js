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
        const list = [];
        const e = { env: { memory: m, 
            set_camera: (x, y, size) => {
                this.renderer.camera.position[0] = this.renderer.target.position[0] = x;
                this.renderer.camera.position[1] = this.renderer.target.position[1] = y;
            },
            print_list: () => {
                if (list.length) {
                    const set = new Set();
                    let index = 0;
                    for (const item of list) {
                        if (set.has(item)) break;
                        set.add(item);
                        index++;
                    }
                    const repeat = list.slice(0, index + 2);
                    console.log(`List{${repeat.length}}: [${repeat.map(n => ~~n).join(", ")}]`);
                    list.splice(0, list.length);
                }
            },
            list: item => list.push(~~item), 
            log_remove: (prev, curr, next) => {
                console.log(`Remove prev#${prev}, curr#${curr}, next#${next}`);
            },
            log_add: id => console.log(`Add ${id}`),
            log_node: (id, type) => console.log(`Node#${id}, type${type}`),
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