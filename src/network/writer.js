const PoolSize = 1048576;
const BufferPool = new DataView(new ArrayBuffer(PoolSize));

module.exports = class Writer {
    constructor(le = true) {
        this.offset = 0;
        this.le = le;
    }

    get offset() { return offset; }

    /** @param {number} a */
    writeUInt8(a) {
        BufferPool.setUint8(this.offset++, a);
    }
    
    /** @param {number} a */
    writeInt8(a) {
        BufferPool.setInt8(this.offset++, a);
    }

    /** @param {number} a */
    writeUInt16(a) {
        BufferPool.setUint16(this.offset, a, this.le);
        this.offset += 2;
    }

    /** @param {number} a */
    writeInt16(a) {
        BufferPool.setInt16(this.offset, a, this.le);
        this.offset += 2;
    }

    /** @param {number} a */
    writeUInt32(a) {
        BufferPool.setUint32(this.offset, a, this.le);
        this.offset += 4;
    }

    /**
     * @param {number} a
     */
    writeInt32(a) {
        BufferPool.setInt32(this.offset, a, this.le);
        this.offset += 4;
    }

    /** @param {number} a */
    writeFloat32(a) {
        BufferPool.setFloat32(this.offset, a, this.le);
        this.offset += 4;
    }

    /** @param {number} a */
    writeFloat64(a) {
        BufferPool.setFloat64(this.offset, a, this.le);
        this.offset += 8;
    }

    /** @param {string} a */
    writeUTF8String(a) {
        for (let i = 0; i < a.length; i++)
            this.writeUInt8(a.charCodeAt(i));
        this.writeUInt8(0);
    }
    
    finalize() {
        return BufferPool.buffer.slice(0, this.offset);
    }
}
