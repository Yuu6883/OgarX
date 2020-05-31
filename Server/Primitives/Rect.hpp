#pragma once

#include <iostream>

typedef unsigned char Quadrant;

#define QUAD_T 0x1
#define QUAD_B 0x2
#define QUAD_L 0x4
#define QUAD_R 0x8

#define IS_QUAD_T(quad) quad & 0x1
#define IS_QUAD_B(quad) quad & 0x2
#define IS_QUAD_L(quad) quad & 0x4
#define IS_QUAD_R(quad) quad & 0x8

struct Point {
	float x, y;
	Point() : x(0), y(0) {};
	Point(float x, float y) : x(x), y(y) {};
};

struct Rect : public Point {
	float w, h;
	Rect() : Point(), w(0), h(0) {};
	Rect(float x, float y, float w, float h) : Point(x, y), w(w), h(h) {};

	bool intersects(const Rect& other) {
		return x - w <= other.x + other.w && \
			x + w >= other.x - other.w && \
			y - h <= other.y + other.h && \
			y + h >= other.y - other.h;
	}

	bool fullyIntersects(const Rect& other) {
		return x - w >= other.x + other.w && \
			x + w <= other.x - other.w && \
			y - h >= other.y + other.h && \
			y + h <= other.y - other.h;
	}

	Quadrant getQuadIntersect(const Rect& other) {
		return ((y - h < other.y || y + h < other.y) && QUAD_T) |
			   ((y - h > other.y || y + h > other.y) && QUAD_B) |
			   ((x - w < other.x || x + w < other.x) && QUAD_L) |
			   ((x - w > other.x || x + w > other.x) && QUAD_R);
	}

	Quadrant getQuadFullIntersect(const Rect& other) {
		return ((y - h < other.y && y + h < other.y) && QUAD_T) |
			   ((y - h > other.y && y + h > other.y) && QUAD_B) |
			   ((x - w < other.x && x + w < other.x) && QUAD_L) |
			   ((x - w > other.x && x + w > other.x) && QUAD_R);
	}
};

struct ViewArea : public Rect {
public:
	float s;
	ViewArea() : Rect(), s(0) {};
	ViewArea(float x, float y, float w, float h, float s) : Rect(x, y, w, h), s(s) {};
};
