#pragma once

#include <list>
#include <mutex>
#include <string>
#include <iostream>
#include <algorithm>
#include <functional>

#include "Geometry.hpp"

#define randf (static_cast<float>(rand()) / RAND_MAX)

using std::list;
using std::mutex;
using std::unique_lock;
using std::function;

enum class Quadrant : char {
	NONE = -1, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT
};

enum OverlapQuadrants {
	QUAD_T = 0x1,
	QUAD_B = 0x2,
	QUAD_L = 0x4,
	QUAD_R = 0x8
};

#define QUAD_TL 0x5
#define QUAD_TR 0x9
#define QUAD_BL 0x6
#define QUAD_BR 0xa

template<typename T, bool cleanup>
class QuadTree;

template<class T, bool cleanup>
struct QuadItem : public T {
	using ItemType = typename T;
	friend QuadTree<ItemType, cleanup>;

	QuadTree<ItemType, cleanup>* root = nullptr;
	template<typename ... Args>
	QuadItem(Args&& ... args) : ItemType(std::forward<Args>(args) ...) {};
protected:
	/* If this item is inside a Rect */
	virtual bool inside(const Rect& range) const = 0;
	/* Get which quadrant this item is relative to a point */
	virtual Quadrant getQuadrant(const Point& point) const = 0;
};

template<typename T>
struct QueryShape {
	using QueryType = T;
	/* Get which quadrants this item is overlapping */
	virtual OverlapQuadrants getOverlapQuadrant(const Point& point) const = 0;
	virtual bool interact(const QueryType& other) = 0;
	virtual bool laps(const QueryType& other) = 0;
};

#define isLeaf(quad) quad->branches == nullptr
#define hasSplit(quad) quad->branches != nullptr

// T is the type of shape we want to store in this node
template<typename T, bool cleanup>
class QuadTree {

	using ItemType = typename T;
	/* Modification mutex, needs to be locked whenever we want to modify the items list.
	   NOTE: we don't care when we split/merge because they SHOULD be called in one thread */
	mutex m;

	unsigned int& maxLevel;
	unsigned int& maxItem;
	unsigned int level;

	Rect range;

	QuadTree<ItemType, cleanup>* root;
	QuadTree<ItemType, cleanup>* branches;
	list<ItemType*> items;

	QuadTree(Rect range, unsigned int& maxLevel, unsigned int& maxItem, QuadTree<ItemType, cleanup>* root) :
		maxLevel(maxLevel), maxItem(maxItem), range(range), root(root), branches(nullptr) {
		level = root->level + 1;
	};

public:
	QuadTree(Rect range, unsigned int& maxLevel, unsigned int& maxItem) :
		maxLevel(maxLevel), maxItem(maxItem), range(range), 
		level(1), root(nullptr), branches(nullptr) {
	};

	/* DFS dtor */
	~QuadTree() {
		if (isLeaf(this)) return;
		if (cleanup) for (auto item : items) delete item;
		delete[] branches;
		branches = nullptr;
	};

	/* Called after updating all the items. Thread-UNSAFE */
	void postUpdate() {
		split();
		merge();
	}

	/* Inserts an item (need to call split later!).
	   Thread-SAFE */
	void insert(ItemType* item) {
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
	void update(ItemType* item) {
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
	void remove(ItemType* item) {
		unique_lock<mutex> lock(item->root->m);
		item->root->items.remove(item);
		item->root = nullptr;
	};

	unsigned int search(QueryShape<ItemType>& q) {
		// Shape is a Cell when called from physics engine (laps is implemented in Cell.hpp)
		// Shape is a Rect when called from viewport       (laps is implemented in Circle.hpp)
		unsigned int count = 0;

		/* An item interact with query AND they lap */
		for (auto item : items)
			if (q.interact(*item) && q.laps(*item)) count++;
		/* Done searching */
		if (isLeaf(this)) return count;

		/* Recursive (Depth-First) call on branches */
		auto quads = q.getOverlapQuadrant(range);
		if (quads & QUAD_TL) count += branches[0].searchDFS(q);
		if (quads & QUAD_TR) count += branches[1].searchDFS(q);
		if (quads & QUAD_BL) count += branches[2].searchDFS(q);
		if (quads & QUAD_BR) count += branches[3].searchDFS(q);

		return count;
	};

	bool contains(QueryShape<ItemType>& q, function<bool(ItemType*)> selector) {
		// Called from getSafeSpawnPos
		// Shape would be a Cell
		// laps would be implemented in Cell.hpp

		/* Any items in this node matches */
		for (auto item : items)
			if (q.interact(*item) && q.laps(*item) && selector(item)) return true;
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

private:
	/* Split the node. Thread-UNSAFE */
	void split() {
		/* No need to split this node */
		if (hasSplit(this) || (level > maxLevel) || (items.size() < maxItem)) return;

		float x = range.x;
		float y = range.y;
		float hw = range.w / 2;
		float hh = range.h / 2;

		branches = {
			QuadTree(Rect(x - hw, y - hh, hw, hh), maxLevel, maxItem, this),
			QuadTree(Rect(x + hw, y - hh, hw, hh), maxLevel, maxItem, this),
			QuadTree(Rect(x - hw, y + hh, hw, hh), maxLevel, maxItem, this),
			QuadTree(Rect(x + hw, y + hh, hw, hh), maxLevel, maxItem, this),
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
};

#undef isLeaf
#undef hasSplit

