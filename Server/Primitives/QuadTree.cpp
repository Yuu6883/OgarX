#include <mutex>
#include "QuadTree.hpp"

#define isLeaf(quad) quad->branches == nullptr
#define hasSplit(quad) quad->branches != nullptr

using std::list;
using std::mutex;
using std::unique_lock;

static OverlapQuadrants rectOverlapQuadrant(Rect& rect, Point& point) {
	return static_cast<OverlapQuadrants>(
		(rect.y + rect.h > point.y && QUAD_T) |
		(rect.y - rect.h < point.y && QUAD_B) |
		(rect.x - rect.w > point.x && QUAD_L) |
		(rect.x + rect.w > point.x && QUAD_R));
}

// T is the type of shape we want to store in this node
template<class T, bool cleanup>
struct QuadNode {

	/* Modification mutex, needs to be locked whenever we want to modify the items list.
	   NOTE: we don't care when we split/merge because they SHOULD be called in one thread */
	mutex m;

	unsigned int& maxLevel;
	unsigned int& maxItem;
	unsigned int level;

	Rect range;
	
	QuadNode<T, cleanup>* root;
	QuadNode<T, cleanup>* branches;
	list<QuadItem<T, cleanup>*> items;

	QuadNode(Rect range, unsigned int& maxLevel, unsigned int& maxItem, QuadNode<T, cleanup>* root, bool cleanup) :
		maxLevel(maxLevel), maxItem(maxItem), range(range), root(root), branches(nullptr) {
		level = root ? root->level + 1 : 1;
	};

	/* DFS dtor */
	~QuadNode() {
		if (isLeaf(this)) return;
		if (cleanup) for (auto item : items) delete item;
		delete[] branches;
		branches = nullptr;
	};

	/* Inserts an item (need to call split later!).
	   Thread-SAFE */
	void insert(QuadItem<T, cleanup>* item) {
		auto quad = this;
		/* Traverse DOWN in the tree to the quad where the item belongs */
		while (true) {
			if (isLeaf(quad)) break;
			Quadrant quadrant = item->getQuadrant(quad->range);
			if (quadrant == Quadrant::NONE) break;
			quad = &branches[static_cast<char>(quadrant)];
		}
		item->root = quad;
		/* Lock the quad */
		unique_lock<mutex> lock(quad->m);
		quad->items.push_back(item);
	};

	/* Updates an item (need to call merge and split later!) 
	   Thread-SAFE */
	void update(QuadItem<T, cleanup>* item) {
		if (!item->root) return;
		auto oldQuad = item->root;
		auto newQuad = item->root;

		/* Traverse UP in the tree */
		while (true) {
			if (!newQuad->root) break;
			newQuad = newQuad->root;
			if (item->inside(newQuad->range)) break;
		}

		/* Traverse DOWN in the tree */
		while (true) {
			if (isLeaf(newQuad)) break;
			Quadrant quadrant = item->getQuadrant(newQuad->range);
			if (quadrant == Quadrant::NONE) break;
			newQuad = &branches[static_cast<char>(quadrant)];
		}

		/* Same quad, do nothing */
		if (oldQuad == newQuad) return;

		/* Lazy update */
		{
			/* Lock oldQuad */
			unique_lock<mutex> lock(oldQuad->m);
			oldQuad->items.remove(item);
		}
		{
			/* Lock newQuad */
			unique_lock<mutex> lock(newQuad->m);
			newQuad->items.push_back(item);
			item->root = newQuad;
		}
	};

	/* Updates an item (need to call merge later!)
	   Thread-SAFE */
	void remove(QuadItem<T, cleanup>* item) {
		unique_lock<mutex> lock(item->root->m);
		item->root->items.remove(item);
		item->root = nullptr;
	};

	/* Split the node. Thread-UNSAFE */
	void split() {
		/* No need to split this node */
		if (hasSplit(this) || (level > maxLevel) || (items.size() < maxItem)) return;

		float x = range.x;
		float y = range.y;
		float hw = range.w / 2;
		float hh = range.h / 2;

		branches = {
			QuadNode(Rect(x - hw, y - hh, hw, hh), maxLevel, maxItem, this, cleanup),
			QuadNode(Rect(x + hw, y - hh, hw, hh), maxLevel, maxItem, this, cleanup),
			QuadNode(Rect(x - hw, y + hh, hw, hh), maxLevel, maxItem, this, cleanup),
			QuadNode(Rect(x + hw, y + hh, hw, hh), maxLevel, maxItem, this, cleanup),
		};

		/* Insert the items to branches if they can */
		auto iter = items.begin();
		while (iter != items.cend()) {
			Quadrant quadrant = (*iter)->getQuadrant(range);
			if (quadrant == Quadrant::NONE) {
				iter++;
				continue;
			}
			/* NOT calling insert directly because this function is thread-unsafe,
			   and we don't need to traverse down since the branches are already leaves */
			branches[static_cast<char>(quadrant)].items.push_back(*iter);
			iter = items.erase(iter);
		}

		/* Recursively split the branches */
		branches[0].split();
		branches[1].split();
		branches[2].split();
		branches[3].split();
	};

	/* Merge the node. Thread-UNSAFE. Returns if merge is successful.
	   Different from other QuadTree implementation, using DFS. */
	bool merge() {
		bool allMerged = true;

		/* Recursively merge branches */
		if (hasSplit(this)) {
			allMerged &= branches[0].merge();
			allMerged &= branches[1].merge();
			allMerged &= branches[2].merge();
			allMerged &= branches[3].merge();
		}

		/* Not all children merged, then we definitely can't merge this node */
		if (!allMerged) return false;
		/* If the code gets here it means all branches are leaves */

		/* If any branch has items, we can't merge this node */
		if (hasSplit(this) && (
			branches[0].items.size() ||
			branches[1].items.size() ||
			branches[2].items.size() ||
			branches[3].items.size())) return false;

		/* Delete branches since they are all leaves and doesn't have items */
		delete[] branches;
		branches = nullptr;

		/* Return success */
		return true;
	};

	template<class Shape>
	unsigned int searchDFS(Shape& search, function<void(QuadItem<T, cleanup>*)> callback) {
		// Shape is a Cell when called from physics engine (laps is implemented in Cell.hpp)
		// Shape is a Rect when called from viewport       (laps is implemented in Circle.hpp)
		unsigned int count = 0;
		for (auto item : items) {
			/* They are both interactive AND they interact with each other AND they overlap */
			if (search && *item && search & *item && search.laps(*item)) {
				callback(item);
				count++;
			}
		}
		/* Done searching */
		if (isLeaf(this)) return count;

		/* Recursive (Depth-First) call on branches */
		auto quads = search.getOverlapQuadrant(range);
		if (quads & QUAD_TL) count += branches[0].searchDFS(search, callback);
		if (quads & QUAD_TR) count += branches[1].searchDFS(search, callback);
		if (quads & QUAD_BL) count += branches[2].searchDFS(search, callback);
		if (quads & QUAD_BR) count += branches[3].searchDFS(search, callback);

		return count;
	};

	template<class Shape>
	bool containAny(Shape& q, function<bool(QuadItem<T, cleanup>*)> selector) {
		// Called from getSafeSpawnPos
		// Shape would be a Cell
		// laps would be implemented in Cell.hpp

		/* Any items in this node matches */
		for (auto item : items)
			if (q->laps(*item) && selector(item)) return true;
		/* No split no match */
		if (isLeaf(this)) return false;
		/* Recursive matching */
		auto quads = q.getOverlapQuadrant(range);
		if (quads & QUAD_TL && branches[0].containAny(q, selector) ||
			quads & QUAD_TR && branches[1].containAny(q, selector) ||
			quads & QUAD_BL && branches[2].containAny(q, selector) ||
			quads & QUAD_BR && branches[3].containAny(q, selector)) return true;
		return false;
	};
};

template<class T, bool cleanup>
QuadTree<T, cleanup>::QuadTree(Rect& range, unsigned int maxLevel, unsigned int maxItem) :
	maxLevel(maxLevel), maxItem(maxItem) {
	root = new QuadNode(range, this->maxLevel, this->maxItem, nullptr);
};

template<class T, bool cleanup>
QuadTree<T, cleanup>::~QuadTree() {
	delete root;
};

template<class T, bool cleanup>
void QuadTree<T, cleanup>::insert(QuadItem<T, cleanup>* item) {
	root->insert(item);
};

template<class T, bool cleanup>
void QuadTree<T, cleanup>::update(QuadItem<T, cleanup>* item) {
	root->update(item); 
};

template<class T, bool cleanup>
void QuadTree<T, cleanup>::remove(QuadItem<T, cleanup>* item) {
	root->remove(item); 
};

template<class T, bool cleanup>
template<class Shape>
unsigned int QuadTree<T, cleanup>::search(Shape& item, function<bool(QuadItem<T, cleanup>*)> callback) {
	return root->searchDFS(item, callback);
};

template<class T, bool cleanup>
template<class Shape>
bool QuadTree<T, cleanup>::contains(Shape& item, function<bool(QuadItem<T, cleanup>*)> selector) {
	return root->containAny(item, selector);
};

template<class T, bool cleanup>
void QuadTree<T, cleanup>::postUpdate() {
	root->split(); 
	root->merge();
};
