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
        /** @type {number[]} */
        this.items = [];
    }

    update() {
        // Using filter as a linear algorithm
        this.items = this.items.filter(cell_id => {
            const cell = this.tree.cells[cell_id];

            if (cell.shouldRemove) {
                cell.__root = null;
                this.tree.removed.push(cell.id);
                return false; // Remove cell from items
            }

            if (!cell.isUpdated) return true; // Keep the cell in items

            let newNode = this;
            // Traverse up the tree
            while (true) {
                if (!newNode.root) break;
                newNode = newNode.root;
                if (insideQuad(cell, newNode)) break;
            }
            // Traverse down the tree
            while (true) {
                if (!newNode.branches) break;
                const quadrant = getQuadrant(cell, newNode);
                if (quadrant < 0) break;
                newNode = newNode.branches[quadrant];
            }
            if (newNode === this) return true; // Keep the cell in items
            cell.updated = false; // Avoid duplicate check in whichever node this cell moved to
            newNode.items.push(cell.id);
            cell.__root = newNode;
            // Not returning anything means we remove the cell from this node in O(n) time
        });

        // Recursively update sub-nodes
        if (this.branches) {
            this.branches[0].update();
            this.branches[1].update();
            this.branches[2].update();
            this.branches[3].update();
        }
    }

    restructure() {
        // Try to merge the sub-nodes
        if (this.branches) {
            this.branches[0].restructure();
            this.branches[1].restructure();
            this.branches[2].restructure();
            this.branches[3].restructure();
    
            if (this.branches[0].branches || this.branches[0].items.length ||
                this.branches[1].branches || this.branches[1].items.length ||
                this.branches[2].branches || this.branches[2].items.length ||
                this.branches[3].branches || this.branches[3].items.length) return;
            this.branches = null;
        // Try to split the nodes into sub-nodes
        } else if (this.items.length > this.tree.maxItems &&
                   this.level < this.tree.maxLevel) {    
            const qw = this.hw / 2;
            const qh = this.hh / 2;
            this.branches = [
                new QuadNode(this.tree, this.x - qw, this.y + qh, qw, qh, this),
                new QuadNode(this.tree, this.x + qw, this.y + qh, qw, qh, this),
                new QuadNode(this.tree, this.x - qw, this.y - qh, qw, qh, this),
                new QuadNode(this.tree, this.x + qw, this.y - qh, qw, qh, this),
            ];
            
            // Keep the items that can not be inserted to sub-node
            this.items = this.items.filter(cell_id => {
                const cell = this.tree.cells[cell_id];
                const quadrant = getQuadrant(cell, this);
                if (quadrant < 0) return true;
                this.branches[quadrant].items.push(cell_id);
                cell.__root = this.branches[quadrant];
            });

            this.branches[0].restructure();
            this.branches[1].restructure();
            this.branches[2].restructure();
            this.branches[3].restructure();
        }
    }

    __init_ptr() {
        this.__ptr = this.tree.__offset;
        this.tree.__offset += 26 + 2 * this.items.length;
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

        this.tree.__serialized += this.items.length;
        view.setUint16(this.__ptr + 24, this.items.length, true);
        let ptr = this.__ptr + 26;

        for (const cell_id of this.items) {
            view.setUint16(ptr, cell_id, true);
            ptr += 2;
        }

        // console.log(view.buffer.slice(view.byteOffset + this.__ptr, 
        //     view.byteOffset + this.__ptr + 26 + this.items.length * 2));

        if (this.branches) {
            this.branches[0].__write(view);
            this.branches[1].__write(view);
            this.branches[2].__write(view);
            this.branches[3].__write(view);
        }
    }

    countItems() {
        if (this.branches) {
            return this.items.length + this.branches[0].countItems() +
                this.branches[1].countItems() +
                this.branches[2].countItems() +
                this.branches[3].countItems();
        } else return this.items.length;
    }

    print(level) {
        if (this.level > level) return;
        console.log(`QuadNode[${this.level}] ${this.items.length} items`);
        if (this.branches) {
            this.branches[0].print(level);
            this.branches[1].print(level);
            this.branches[2].print(level);
            this.branches[3].print(level);
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

        /** @type {number[]} */
        this.removed = [];
        this.__serialized = 0;
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
        node.items.push(cell.id);
    }
    
    update() {
        this.root.update();
    }

    /**
     * Swap cell1 (in the tree) with new cell2
     * @param {import("./cell")} cell1 
     * @param {import("./cell")} cell2 
     */
    swap(cell1, cell2) {
        cell2.__root = cell1.__root;
        const items = cell1.__root.items;
        // O(n) ?
        items[items.indexOf(cell1.id)] = cell2.id;
        cell1.__root = null;
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

    restructure() {
        this.root.restructure();
    }

    countItems() {
        return this.root.countItems();
    }

    print(level = 3) {
        this.root.print(level);
    }
}

QuadTree.Node = QuadNode;

module.exports = QuadTree;