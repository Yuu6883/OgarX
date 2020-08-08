const { performance } = require("perf_hooks");

/**
 * @param {import("./cell")} cell
 * @param {QuadNode} node
 */
const getQuadrant = (cell, node) => {
    if (cell.y - cell.r > node.y) {
        if (cell.x + cell.r < node.x) return 0;
        else if (cell.x - cell.r > node.x) return 1;
    } else if (cell.y + cell.r < node.y) {
        if (cell.x + cell.r < node.x) return 2;
        else if (cell.x - cell.r > node.x) return 3;
    }
    return -1;
}

/**
 * @param {import("./cell")} cell
 * @param {QuadNode} node
 */
const insideQuad = (cell, node) => {
    return cell.x - cell.r > node.l &&
           cell.x + cell.r < node.r &&
           cell.y + cell.r < node.t &&
           cell.y - cell.r > node.b;
}

/**
 * QuadNode serialize to:
 * x, y (2 * 4 = 8 bytes)
 * 4 childpointers (4 * 4 = 16 bytes)
 * count (2 bytes)
 * Total = 26 + 2 * items
 */

class QuadNode {

    /**
     * @param {QuadTree} tree
     * @param {number} x
     * @param {number} y
     * @param {number} hw
     * @param {number} hh
     * @param {QuadNode} root
     */
    constructor(tree, x, y, hw, hh, root) {
        this.__ptr = 0;
        this.tree = tree;
        this.root = root;
        this.level = root ? root.level + 1 : 1;
        this.x = x;
        this.y = y;
        this.hw = hw;
        this.hh = hh;
        this.t = y + hh;
        this.b = y - hh;
        this.l = x - hw;
        this.r = x + hw;
        /** @type {[QuadNode, QuadNode, QuadNode, QuadNode]} */
        this.branches = null;
        /** @type {Set<number>} */
        this.items = new Set();
    }

    split() {
        if (this.branches || 
            this.items.size < this.tree.maxItems ||
            this.level > this.tree.maxLevel) return;
        const qw = this.hw / 2;
        const qh = this.hh / 2;
        this.branches = [
            new QuadNode(this.tree, this.x - qw, this.y + qh, qw, qh, this),
            new QuadNode(this.tree, this.x + qw, this.y + qh, qw, qh, this),
            new QuadNode(this.tree, this.x - qw, this.y - qh, qw, qh, this),
            new QuadNode(this.tree, this.x + qw, this.y - qh, qw, qh, this),
        ];
        for (const cell_id of this.items) {
            const quadrant = getQuadrant(this.tree.cells[cell_id], this);
            if (quadrant < 0) continue;
            this.branches[quadrant].items.add(cell_id);
            this.items.delete(cell_id);
        }
    }

    merge() {
        let node = this;
        while (node != null) {
            if (!node.branches) { node = node.root; continue; }
            if (node.branches[0].branches || node.branches[0].items.size ||
                node.branches[1].branches || node.branches[1].items.size ||
                node.branches[2].branches || node.branches[2].items.size ||
                node.branches[3].branches || node.branches[3].items.size) return;
            node.branches = null;
        }
    }

    __init_ptr() {
        this.__ptr = this.tree.__offset;
        this.tree.__offset += 26 + 2 * this.items.size;
        if (this.branches) {
            this.branches[0].__init_ptr();
            this.branches[1].__init_ptr();
            this.branches[2].__init_ptr();
            this.branches[3].__init_ptr();
        }
    }

    /** @param {DataView} view */
    __write(view) {
        view.setFloat32(this.__ptr,      this.x, true);
        view.setFloat32(this.__ptr + 4,  this.y, true);

        if (this.branches) {
            view.setUint32(this.__ptr + 8,  view.byteOffset + this.branches[0].__ptr, true);
            view.setUint32(this.__ptr + 12, view.byteOffset + this.branches[1].__ptr, true);
            view.setUint32(this.__ptr + 16, view.byteOffset + this.branches[2].__ptr, true);
            view.setUint32(this.__ptr + 20, view.byteOffset + this.branches[3].__ptr, true);
        } else {
            view.setUint32(this.__ptr + 8, 0, true);
        }

        this.tree.__serialized += this.items.size;
        view.setUint16(this.__ptr + 24, this.items.size, true);
        let ptr = this.__ptr + 26;

        for (const cell_id of this.items) {
            view.setUint16(ptr, cell_id, true);
            ptr += 2;
        }

        // console.log(view.buffer.slice(view.byteOffset + this.__ptr, 
        //     view.byteOffset + this.__ptr + 26 + this.items.size * 2));

        if (this.branches) {
            this.branches[0].__write(view);
            this.branches[1].__write(view);
            this.branches[2].__write(view);
            this.branches[3].__write(view);
        }
    }
}

class QuadTree {

    /**
     * @param {import("./cell")[]} cells
     * @param {number} x
     * @param {number} y
     * @param {number} hw
     * @param {number} hh
     * @param {number} maxLevel 
     * @param {number} maxItems
     */
    constructor(cells, x, y, hw, hh, maxLevel, maxItems) {
        this.__offset = 0;
        this.cells = cells;
        this.root = new QuadNode(this, x, y, hw, hh, null);
        this.maxLevel = maxLevel;
        this.maxItems = maxItems;

        this.__serialized = 0;
    }

    /** @param {import("./cell")} cell */
    insert(cell) {
        let node = this.root;
        while (true) {
            if (!node.branches) break;
            const quadrant = getQuadrant(cell, node);
            if (quadrant < 0) break;
            node = node.branches[quadrant];
        }
        cell.__root = node;
        node.items.add(cell.id);
        node.split();
    }

    /** @param {import("./cell")} cell */
    remove(cell) {
        cell.__root.items.delete(cell.id);
        cell.__root.merge();
        cell.__root = null;
    }

    /** @param {import("./cell")} cell */
    update(cell) {
        const oldNode = cell.__root;
        let newNode = cell.__root;
        while (true) {
            if (!newNode.root) break;
            newNode = newNode.root;
            if (insideQuad(cell, newNode)) break;
        }
        while (true) {
            if (!newNode.branches) break;
            const quadrant = getQuadrant(cell, newNode);
            if (quadrant < 0) break;
            newNode = newNode.branches[quadrant];
        }
        if (oldNode === newNode) return;
        oldNode.items.delete(cell.id);
        newNode.items.add(cell.id);
        cell.__root = newNode;
        oldNode.merge();
        newNode.split();
    }

    /** @param {DataView} view */
    serialize(view) {
        this.__offset = 0;
        this.__serialized = 0;
        this.root.__init_ptr();
        this.root.__write(view);
        const end = this.__offset;
        this.__offset = 0;
        return end;
    }
}

module.exports = { QuadNode, QuadTree };