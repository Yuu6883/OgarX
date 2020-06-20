#pragma once

#include "QuadTree.hpp"

// Cell data will derive from this class
template<bool cleanup>
struct CircleItemBase : public QuadItem<Circle, cleanup> {
	CircleItemBase(float x, float y, float radius) : QuadItem<Circle, cleanup>(x, y, radius) {};
	using Point::x;
	using Point::y;
	using Circle::r;
protected:

	/* If this cirle is inside a Rect */
	bool inside(const Rect& range) const {
		return
			x - r >= range.x + range.w &&
			x + r <= range.x - range.w &&
			y - r >= range.y + range.h &&
			y + r <= range.y - range.h;
	};

	/* Get which quadrant this circle is relative to a point */
	Quadrant getQuadrant(const Point& point) const {
		if (y - r > point.y) {
			if (x - r < point.x) return Quadrant::TOP_LEFT;
			else if (x + r > point.x) return Quadrant::TOP_RIGHT;
		} else if (y + r < point.y) {
			if (x - r < point.x) return Quadrant::BOTTOM_LEFT;
			else if (x + r > point.x) return Quadrant::BOTTOM_RIGHT;
		}
		return Quadrant::NONE;
	};
};

// Cell will derive from this class
template<typename QueryTarget, bool cleanup>
struct QueryableCircleItemBase : public CircleItemBase<cleanup>, QueryShape<QueryTarget> {
	using Circle::x;
	using Circle::y;
	using Circle::r;

	QueryableCircleItemBase(float x, float y, float radius): 
		CircleItemBase<cleanup>(x, y, radius) {};

	/* Get which quadrants this circle is overlapping */
	OverlapQuadrants getOverlapQuadrant(const Point& point) const {
		return static_cast<OverlapQuadrants>(
			(y + r > point.y && QUAD_T) |
			(y - r < point.y && QUAD_B) |
			(x - r > point.x && QUAD_L) |
			(x + r > point.x && QUAD_R));
	};
};

// Viewport will derive from this class
template<typename QueryTarget>
struct QueryableRectBase : public Rect, QueryShape<QueryTarget> {

	/* Get which quadrants this rect is overlapping */
	OverlapQuadrants getOverlapQuadrant(const Point& point) const {
		return static_cast<OverlapQuadrants>(
			(y + h > point.y && QUAD_T) |
			(y - h < point.y && QUAD_B) |
			(x - w > point.x && QUAD_L) |
			(x + w > point.x && QUAD_R));
	};
};
