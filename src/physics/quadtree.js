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
 * x, y, hw, hw (4 * 4 = 8 bytes)
 * 4 childpointers (4 * 4 = 16 bytes)
 * count (2 bytes)
 * Total = 34 + 2 * items
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
            const cell = this.tree.cells[cell_id];
            const quadrant = getQuadrant(cell, this);
            if (quadrant < 0) continue;
            this.branches[quadrant].items.add(cell_id);
            cell.__root = this.branches[quadrant];
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

    __serialize() {
        let ptr = this.__ptr = this.tree.__offset;
        this.tree.__offset += 34 + 2 * this.items.size;
        
        const v = this.tree.__view;
        v.setFloat32(ptr, this.x, true);
        ptr += 4;
        v.setFloat32(ptr, this.y, true);
        ptr += 4;
        v.setFloat32(ptr, this.hw, true);
        ptr += 4;
        v.setFloat32(ptr, this.hh, true);
        ptr += 4;

        if (this.branches) {
            this.branches[0].__serialize();
            this.branches[1].__serialize();
            this.branches[2].__serialize();
            this.branches[3].__serialize();

            v.setUint32(ptr, v.byteOffset + this.branches[0].__ptr, true);
            ptr += 4;
            v.setUint32(ptr, v.byteOffset + this.branches[1].__ptr, true);
            ptr += 4;
            v.setUint32(ptr, v.byteOffset + this.branches[2].__ptr, true);
            ptr += 4;
            v.setUint32(ptr, v.byteOffset + this.branches[3].__ptr, true);
            ptr += 4;
        } else {
            v.setUint32(ptr, 0, true);
            ptr += 16;
        }

        v.setUint16(ptr, this.items.size, true);
        ptr += 2;

        for (const cell_id of this.items) {
            v.setUint16(ptr, cell_id, true);
            ptr += 2;
        }
    }

    countItems() {
        if (this.branches) {
            return this.items.size + this.branches[0].countItems() +
                this.branches[1].countItems() +
                this.branches[2].countItems() +
                this.branches[3].countItems();
        } else return this.items.size;
    }

    print() {
        console.log(`QuadNode at ${this.__ptr} has ${this.items.size} items: ${[...this.items].join(", ")}`)
        if (this.branches) {
            this.branches[0].print();
            this.branches[1].print();
            this.branches[2].print();
            this.branches[3].print();
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
    }

    /** @param {import("./cell")} cell */
    insert(cell) {
        if (cell.__root) console.log("INSERTING CELL ALREADY IN QUADTREE");
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
        if (!cell.__root) return console.log("REMOVING CELL NOT IN QUADTREE");
        if (!cell.__root.items.delete(cell.id)) console.log("ITEM NOT IN QUAD??", cell.__root.items);
        cell.__root.merge();
        cell.__root = null;
    }

    /** @param {import("./cell")} cell */
    update(cell) {
        if (!cell.__root) {
            console.log(cell.toString());
            throw new Error("UPDATING CELL NOT IN QUADTREE");
        }
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

    /**
     * Swap cell1 (in the tree) with new cell2
     * @param {import("./cell")} cell1 
     * @param {import("./cell")} cell2 
     */
    swap(cell1, cell2) {
        cell2.__root = cell1.__root;
        cell2.__root.items.delete(cell1.id);
        cell2.__root.items.add(cell2.id);
        cell1.__root = null;
    }

    /** @param {DataView} view */
    serialize(view) {
        this.__view = view;
        this.__offset = 0;
        this.root.__serialize();

        const end = this.__offset;
        this.__offset = 0;
        return end;
    }

    countItems() {
        return this.root.countItems();
    }

    print() {
        this.root.print();
    }
}

QuadTree.Node = QuadNode;

module.exports = QuadTree;