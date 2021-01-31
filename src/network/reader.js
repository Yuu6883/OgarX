module.exports = class Reader {
    /** 
     * @param {DataView} view
     * @param {boolean} le
     */
    constructor(view, le = true) {
        this.view = view;
        this.offset = 0;
        this.le = le;
    }

    get length() { return this.view.byteLength; }
    get EOF() { return this.offset === this.view.byteLength; }

    readUInt8() {
        return this.view.getUint8(this.offset++);
    }

    readInt8() {
        return this.view.getInt8(this.offset++);
    }

    readUInt16() {
        const a = this.view.getUint16(this.offset, this.le);
        this.offset += 2;
        return a;
    }

    readInt16() {
        const a = this.view.getUint16(this.offset, this.le);
        this.offset += 2;
        return a;
    }

    readUInt32() {
        const a = this.view.getUint32(this.offset, this.le);
        this.offset += 4;
        return a;
    }

    readInt32() {
        const a = this.view.getInt32(this.offset, this.le);
        this.offset += 4;
        return a;
    }

    readFloat32() {
        const a = this.view.getFloat32(this.offset, this.le);
        this.offset += 4;
        return a;
    }

    readFloat64() {
        const a = this.view.getFloat64(this.offset, this.le);
        this.offset += 8;
        return a;
    }

    /** @param {number} bytes */
    skip(bytes) {
        this.offset += bytes;
    }

    readUTF8String() {
        const chars = [];
        while (this.offset < this.view.byteLength) {
            const ch = this.readUInt8();
            if (!ch) break;
            chars.push(String.fromCharCode(ch));
        }
        return chars.join("");
    }

    readUTF16String() {
        const chars = [];
        while (this.offset < this.view.byteLength) {
            const ch = this.readUInt16();
            if (!ch) break;
            chars.push(String.fromCharCode(ch));
        }
        return chars.join("");
    }

    readBytes(length = 0) {
        const buffer = this.view.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return buffer;
    }
}
