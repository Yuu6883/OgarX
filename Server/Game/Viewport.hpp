#pragma once

#include "../Cells/Cell.hpp"

struct Viewport : public QueryableRectBase<CellData> {
	// Always interact
	bool interact(const CellData& other) { return true; };
	// Rect laps circle
	bool laps(const CellData& other) {
		float testX = other.x;
		float testY = other.y;

		float lx = x - w;
		float rx = x + w;
		float ty = y + h;
		float by = y - h;

		if (other.x < lx) testX = lx;
		else if (other.x > rx) testX = rx;
		if (other.y < by) testY = by;
		else if (other.y > ty) testY = ty;

		float dx = other.x - testX;
		float dy = other.y - testY;
		float distSqr = dx * dx + dy * dy;

		return distSqr <= other.r * other.r;
	};
};