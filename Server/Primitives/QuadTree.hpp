#pragma once

#pragma once

#include <string>
#include <functional>
#include <iostream>
#include <list>
#include <algorithm>
#include <string>
#include "Rect.hpp"

using std::function;

struct QuadNode;
struct QuadItem : Point {
	QuadNode* root;
	Rect range;
	QuadItem(const float x, const float y) : Point(x, y), root(nullptr) {};
};

struct QuadTree {
	friend std::ostream& operator<<(std::ostream& stream, QuadTree& quad);
	QuadTree(Rect& range, unsigned int maxLevel, unsigned int maxItem);
	~QuadTree();
	void insert(QuadItem*, bool nosplit = false);
	void update(QuadItem*);
	void remove(QuadItem*);
	unsigned int search(Rect&, function<bool(QuadItem*)> callback);
	bool containAny(Rect&, function<bool(QuadItem*)> selector);
protected:
	QuadNode* root;
	unsigned int maxLevel;
	unsigned int maxItem;
	unsigned int maxSearch = 0;
	void split();
};
