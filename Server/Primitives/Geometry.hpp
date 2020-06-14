#pragma once

#include <iostream>

struct Point {
	float x, y;
	Point() : x(0), y(0) {};
	Point(float x, float y) : x(x), y(y) {};
};

struct Rect : public Point {
	float w, h;
	Rect() : Point(), w(0), h(0) {};
	Rect(float x, float y, float w, float h) : Point(x, y), w(w), h(h) {};
};

struct Circle : public Point {
	float r;
	Circle() : Point(), r(0) {}
	Circle(float x, float y) : Point(x, y), r(0) {};
	Circle(float x, float y, float r) : Point(x, y), r(r) {};
};