#pragma once

#include <string>
#include <functional>
#include <iostream>
#include <list>
#include <algorithm>
#include <string>
#include "Geometry.hpp"

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

template<class T, bool cleanup>
struct QuadNode;
template<class T, bool cleanup>
struct QuadTree;

template<class T, bool cleanup>
struct QuadItem : public T {
	friend QuadTree<T, cleanup>;
	friend QuadNode<T, cleanup>;

	template<typename ... Args>
	QuadItem(Args&& ... args) : T(std::forward<Args>(args) ...) {};
protected:
	/* If this item is interactive */
	virtual explicit operator bool() const = 0;
	/* If this item is inside a Rect */
	virtual bool inside(const Rect& range) const = 0;
	/* Get which quadrant this item is relative to a point */
	virtual Quadrant getQuadrant(const Point& point) const = 0;
	/* Get which quadrants this item is overlapping */
	virtual OverlapQuadrants getOverlapQuadrant(const Point& point) const = 0;

	// Templated member functions required to interact with each other within QuadTree
	// Not implemented here because member function templates cannot be virtual

	/* If this item interact with another item of same template */
	virtual bool operator &(const QuadItem<T, cleanup>& other) const = 0;
	/* If this item laps another item (Should be implemented in subclass) */
	// virtual bool laps (const QuadItem& item) const = 0;
private:
	QuadNode<T, cleanup>* root = nullptr;
};

template<class T, bool cleanup>
struct QuadTree {

	QuadTree(Rect& range, unsigned int maxLevel, unsigned int maxItem);
	~QuadTree();

	/* Delegates of QuadNode thread-SAFE methods */
	void insert(QuadItem<T, cleanup>*);
	void update(QuadItem<T, cleanup>*);
	void remove(QuadItem<T, cleanup>*);

	/* Delegates of QuadNode thread-UNSAFE methods */
	void postUpdate();

	/* Query methods using lap with QuadItem& (thread-SAFE since they only read the data) */
	template<class Shape>
	unsigned int search(Shape& item, function<bool(QuadItem<T, cleanup>*)> callback);
	template<class Shape>
	bool contains(Shape& item, function<bool(QuadItem<T, cleanup>*)> selector);

private:
	QuadNode<T, cleanup>* root;
	unsigned int maxLevel;
	unsigned int maxItem;
};

