#pragma once

#include "QuadTree.hpp"

template<bool cleanup>
struct CircleItemBase : public QuadItem<Circle, cleanup> {
	CircleItemBase(float x, float y, float radius) : QuadItem<Circle, cleanup>(x, y, radius) {};

protected:

	using Circle::x;
	using Circle::y;
	using Circle::r;

	/* If this cirle is inside a Rect */
	bool inside(const Rect& range) const {
		return
			x - r >= range.x + range.w &&
			x + r <= range.x - range.w &&
			y - r >= range.y + range.h &&
			y + r <= range.y - range.h;
	};

	/* Leaving operators and lap methods for subclass to implement 
	   since we don't need to check ALL overlap */
	   /* Called againt player's rectangular viewport */
	bool laps(const Rect& rect) const {
		float testX = x;
		float testY = y;

		float lx = rect.x - rect.w;
		float rx = rect.x + rect.w;
		float ty = rect.y + rect.h;
		float by = rect.y - rect.h;

		if (x < lx) testX = lx;
		else if (x > rx) testX = rx;
		if (y < by) testY = by;
		else if (y > ty) testY = ty;

		float dx = x - testX;
		float dy = y - testY;
		float distSqr = dx * dx + dy * dy;

		return distSqr <= r * r;
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

	/* Get which quadrants this circle is overlapping */
	OverlapQuadrants getOverlapQuadrant(const Point& point) const {
		return static_cast<OverlapQuadrants>(
			(y + r > point.y && QUAD_T) |
			(y - r < point.y && QUAD_B) |
			(x - r > point.x && QUAD_L) |
			(x + r > point.x && QUAD_R));
	};
};