#pragma once
#include <math.h>
#include <thread>
#include "../Primitives/QuadItems.hpp"
#include "../Game/Game.hpp"

using std::pair;

static const float PI = atan(1.f) * 4;

#define MAX_PLAYER 250
#define VIRUS  255
#define PELLET 254
#define EJECTED_CELL 253
#define MOTHER_CELL 252
#define DEAD_CELL 251
#define IS_PLAYER(type) type < MAX_PLAYER

struct Player;

struct Boost {
	float dx;
	float dy;
	float d;
};

typedef unsigned char CellType;

/* Pure data with no pointers or methods, auto cleanup */
struct CellData : public CircleItemBase<true> {

	CellType type;
	unsigned short id;
	unsigned short eatenById;

	CellData(CellType type, unsigned int id, float x, float y, float size, unsigned int eatenById):
		CircleItemBase<true>(x, y, size), id(id), type(type), eatenById(eatenById) {};
};

/* Macros for the ULTIMATE SPEED */
#define getSqrSize(cell) cell->r * cell->r
#define setSqrSize(cell, squredSize) cell->r = sqrt(squredSize)
#define getMass(cell) getSqrSize(cell) / 100.0f
#define setMass(cell, mass) setSqrSize(cell, mass * 100.0f)
#define isBoosting(cell) cell->boost.d > 1
#define eat(cell1, cell2) setSqrSize(cell1, getSqrSize(cell1) + getSqrSize(cell2)); cell2->eatenBy = cell1->id;

struct Cell;

struct EatIDPair {
	unsigned short a_id;
	unsigned short b_id;
};

struct CollisionData {
	unsigned short a_id;
	unsigned short b_id;
	float a_dx;
	float a_dy;
	float b_dx;
	float b_dy;
};

static inline thread_local list<EatIDPair>     EAT_THREAD_RESULT;
static inline thread_local list<CollisionData> RIGID_THREAD_RESULT;

struct Cell : QueryableCircleItemBase<Cell, false> {

	/* Primitives */
	CellType type;
	bool exist;
	bool dead;
	bool isInside = false;
	unsigned short id;
	unsigned short eatenBy = 0;
	unsigned int age = 0;
	Point target;
	Boost boost = { 0.0f, 0.0f, 0.0f };

	Cell() : QueryableCircleItemBase(0.0f, 0.0f, 0.0f), type(0), id(0), dead(true), exist(false) {};
	
	bool interact(const Cell& other) {
		if (isInside || other.isInside) return false;
		if (id == other.id) return false;
	};

	bool laps(const Cell& other) {
		return true;
	};

	/* Get the pure data of this cell */
	CellData* getData() {
		return new CellData(type, id, x, y, r, eatenBy);
	}
};

