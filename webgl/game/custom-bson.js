const pako = require("pako");
const Reader = require("../../src/network/reader");

const isArrayBuffer = b => typeof b == "object" && b.byteLength !== undefined;

/** @param {Object<string, ArrayBuffer|ArrayBuffer[]>} indexedBuffers */
const serialize = indexedBuffers => {

    // Delete the fields that's not arraybuffer or array of arraybuffer
    for (const k of Object.keys(indexedBuffers)) {
        const v = indexedBuffers[k];
        if ((Array.isArray(v) && v.every(isArrayBuffer)) || 
            isArrayBuffer(v)) {
            // console.log(`Keeping key "${k}"`);
        } else {
            // console.log(`Deleting key "${k}"`);
            delete indexedBuffers[k];
        }
    }

    let length = 0;
    for (const key in indexedBuffers) {
        length += key.length + 1;
        const bufferOrBuffers = indexedBuffers[key];
        length += 4; // header bytes
        if (Array.isArray(bufferOrBuffers)) {
            bufferOrBuffers.forEach(b => length += b.byteLength + 4); 
        } else {
            length += bufferOrBuffers.byteLength;
        }
    }
    const out = new Uint8Array(length);
    const view = new DataView(out.buffer);
    let offset = 0;
    for (const key in indexedBuffers) {
        for (let i = 0; i < key.length; i++)
            out[offset++] = key.charCodeAt(i);
        out[offset++] = 0;

        const bufferOrBuffers = indexedBuffers[key];

        /** @param {ArrayBuffer} b */
        const writeBuffer = b => {
            view.setInt32(offset, b.byteLength, true);
            offset += 4;
            out.set(new Uint8Array(b), offset);
            offset += b.byteLength;
        }

        if (Array.isArray(bufferOrBuffers)) {
            view.setInt32(offset, -bufferOrBuffers.length, true); // Negative to mark this as an array
            offset += 4;
            for (const buffer of bufferOrBuffers) writeBuffer(buffer);
        } else {
            writeBuffer(bufferOrBuffers);
        }
    }

    console.assert(out.byteLength === offset, "Output bytes should match final offset");
    return pako.deflate(out, { level: 9, raw: true }).buffer;
}

/** @param {ArrayBuffer} buffer */
const deserialize = buffer => {
    const out = {};
    const reader = new Reader(new DataView(pako.inflate(buffer, { raw: true }).buffer));
    const readBuffer = l => reader.readBytes(l || reader.readInt32());
    while (!reader.EOF) {
        const key = reader.readUTF8String();
        const l = reader.readInt32();
        if (l > 0) out[key] = readBuffer(l);
        else out[key] = Array.from({ length: -l }, _ => readBuffer());
    }
    return out;
}

module.exports = { serialize, deserialize };