#include "QuadTree.hpp"

using std::list;

struct QuadNode {

	unsigned int& maxLevel;
	unsigned int& maxItem;
	unsigned int level;

	Rect range;
	QuadNode* root;
	QuadNode* branches;
	list<QuadItem*> items;

	QuadNode(Rect range, unsigned int& maxLevel, unsigned int& maxItem, QuadNode* root) :
		maxLevel(maxLevel), maxItem(maxItem), range(range), root(root), branches(nullptr) {
		level = root ? root->level + 1 : 1;
	};

	~QuadNode() {
		if (!hasSplit()) return;
		delete[] branches;
		branches = nullptr;
	};

	bool hasSplit() {
		return branches != nullptr;
	};

	void insert(QuadItem* item) {
		auto quad = this;
		while (true) {
			if (!quad->hasSplit()) break;
			unsigned char quadrant = quad->getQuadrant(item->range);
			if (quadrant == 255) break;
			quad = &quad->branches[quadrant];
		}
		item->root = quad;
		quad->items.push_back(item);
		quad->split();
	};

	void update(QuadItem* item) {
		if (!item->root) return;
		auto oldQuad = item->root;
		auto newQuad = item->root;
		while (true) {
			if (!newQuad->root) break;
			newQuad = newQuad->root;
			if (newQuad->range.fullyIntersects(item->range)) break;
		}
		while (true) {
			if (!newQuad->hasSplit()) break;
			unsigned char quadrant = newQuad->getQuadrant(item->range);
			if (quadrant == 255) break;
			newQuad = &newQuad->branches[quadrant];
		}
		if (oldQuad == newQuad) return;

		oldQuad->items.remove(item);
		newQuad->items.push_back(item);
		item->root = newQuad;
		oldQuad->merge();
		newQuad->split();
	};

	void remove(QuadItem* item) {
		auto quad = item->root;
		quad->items.remove(item);
		item->root = nullptr;
		quad->merge();
	};

	void split() {
		if (hasSplit() || (level > maxLevel) || (items.size() < maxItem)) return;
		float x = range.x;
		float y = range.y;
		float hw = range.w / 2;
		float hh = range.h / 2;
		branches = new QuadNode[4]{
			QuadNode(Rect(x - hw, y - hh, hw, hh), maxLevel, maxItem, this),
			QuadNode(Rect(x + hw, y - hh, hw, hh), maxLevel, maxItem, this),
			QuadNode(Rect(x - hw, y + hh, hw, hh), maxLevel, maxItem, this),
			QuadNode(Rect(x + hw, y + hh, hw, hh), maxLevel, maxItem, this),
		};
		auto iter = items.begin();
		while (iter != items.cend()) {
			unsigned char quadrant = getQuadrant((*iter)->range);
			if (quadrant == 255) {
				iter++;
				continue;
			}
			branches[quadrant].insert(*iter);
			iter = items.erase(iter);
		}
	};

	void merge() {
		auto quad = this;
		while (quad) {
			if (!quad->hasSplit()) {
				quad = quad->root;
				continue;
			}
			for (int i = 0; i < 4; i++)
				if (quad->branches[i].hasSplit() || quad->branches[i].items.size() > 0)
					return;
			delete[] quad->branches;
			quad->branches = nullptr;
		}
	};

	size_t getItemCount() {
		if (!hasSplit()) return items.size();
		return items.size() +
			branches[0].getItemCount() + \
			branches[1].getItemCount() + \
			branches[2].getItemCount() + \
			branches[3].getItemCount();
	};

	unsigned int getBranchCount() {
		if (hasSplit()) {
			return 1 + \
				branches[0].getBranchCount() + branches[1].getBranchCount() + \
				branches[2].getBranchCount() + branches[3].getBranchCount();
		}
		return 1;
	};

	unsigned char getQuadrant(Rect& r) {
		auto quad = r.getQuadFullIntersect(range);
		if (IS_QUAD_T(quad)) {
			if (IS_QUAD_L(quad)) return 0;
			if (IS_QUAD_R(quad)) return 1;
		}
		if (IS_QUAD_B(quad)) {
			if (IS_QUAD_L(quad)) return 2;
			if (IS_QUAD_R(quad)) return 3;
		}
		return 255;
	};

	unsigned int searchDFS(Rect& r, function<void(QuadItem*)> callback) {
		unsigned int count = 0;
		for (auto item : items) {
			if (r.intersects(item->range)) {
				callback(item);
				count++;
			}
		}
		if (!hasSplit()) return count;
		auto quad = r.getQuadIntersect(range);
		if (IS_QUAD_T(quad)) {
			if (IS_QUAD_L(quad)) count += branches[0].searchDFS(r, callback);
			if (IS_QUAD_R(quad)) count += branches[1].searchDFS(r, callback);
		}
		if (IS_QUAD_B(quad)) {
			if (IS_QUAD_L(quad)) count += branches[2].searchDFS(r, callback);
			if (IS_QUAD_R(quad)) count += branches[3].searchDFS(r, callback);
		}
		return count;
	};

	unsigned int search(Rect& r, function<bool(QuadItem*)> callback) {
		unsigned int count = 0;
		for (auto item : items) {
			if (r.intersects(item->range))
				if (callback(item)) count++;
			return count;
		};
	};

	bool containAny(Rect& r, function<bool(QuadItem*)> selector) {
		for (auto item : items) {
			if (r.intersects(item->range) && (!selector || selector(item)))
				return true;
		}
		if (!hasSplit()) return false;
		auto quad = r.getQuadIntersect(range);
		if (IS_QUAD_T(quad)) {
			if (IS_QUAD_L(quad) && branches[0].containAny(r, selector)) return true;
			if (IS_QUAD_R(quad) && branches[1].containAny(r, selector)) return true;
		}
		if (IS_QUAD_B(quad)) {
			if (IS_QUAD_L(quad) && branches[2].containAny(r, selector)) return true;
			if (IS_QUAD_R(quad) && branches[3].containAny(r, selector)) return true;
		}
		return false;
	};
};

std::ostream& operator<<(std::ostream& stream, QuadNode& quad) {
	stream << "items " << quad.items.size() << "/" << quad.maxItem << "/" << \
		quad.getItemCount() << " level " << quad.level << " x " << quad.range.x << " y " << quad.range.y << \
		" w " << quad.range.w << " h " << quad.range.h << std::endl;
	if (quad.hasSplit())
		for (int i = 0; i < 4; i++)
			stream << std::string(quad.level * 2, ' ') << quad.branches[i];
	return stream;
};

std::ostream& operator<<(std::ostream& stream, QuadTree& tree) {
	if (tree.root) {
		return stream << *tree.root;
	} else {
		return stream << "[ROOTLESS TREE]" << std::endl;
	}
};

QuadTree::QuadTree(Rect& range, unsigned int maxLevel, unsigned int maxItem) :
	maxLevel(maxLevel), maxItem(maxItem) {
	root = new QuadNode(range, this->maxLevel, this->maxItem, nullptr);
};

QuadTree::~QuadTree() {
	if (root) delete root;
};

void QuadTree::insert(QuadItem* item, bool nosplit) {
	if (root) nosplit ? root->items.push_back(item) : root->insert(item);
};

void QuadTree::split() { if (root) root->split(); };
void QuadTree::update(QuadItem* item) { if (root) root->update(item); };
void QuadTree::remove(QuadItem* item) { if (root) root->remove(item); };

unsigned int QuadTree::search(Rect& rect, function<bool(QuadItem*)> callback) {
	if (!root) return 0;
	unsigned int count = 0;

	if (maxSearch) {
		list<QuadNode*> queue;
		queue.push_back(root);

		while (!queue.empty()) {
			auto node = queue.front();
			count += node->search(rect, callback);
			queue.pop_front();

			if (count >= maxSearch) break;
			if (node->hasSplit()) {
				queue.push_back(&node->branches[0]);
				queue.push_back(&node->branches[1]);
				queue.push_back(&node->branches[2]);
				queue.push_back(&node->branches[3]);
			}
		}
	} else {
		count = root->searchDFS(rect, callback);
	}

	return count;
}

bool QuadTree::containAny(Rect& rect, function<bool(QuadItem*)> selector) {
	if (root) return root->containAny(rect, selector);
	return false;
};
