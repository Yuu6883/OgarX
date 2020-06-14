#pragma once
#include <math.h>
#include "../Primitives/Circle.hpp"

struct World;
struct Player;

struct Boost {
	float dx;
	float dy;
	float d;
};

enum CellType : unsigned char {
	PLAYER,
	PELLET,
	VIRUS,
	EJECTED_CELL,
	MOTHER_CELL,
	NONE
};

/* Pure data with no pointers or methods, auto cleanup */
struct CellData : CircleItemBase<true> {

	CellType type;
	unsigned int id;
	unsigned int eatenById;

	CellData(CellType type, unsigned int id, float x, float y, float size, unsigned int eatenById):
		CircleItemBase(x, y, size), id(id), type(type), eatenById(eatenById) {};

	/* Data should always interact with others */
	explicit operator bool() const { return true; };
	bool operator &(const QuadItem<Circle, true>& other) const { return true; };

	/* This function should NOT be called since there's no need to check collision on data */
	bool laps(const QuadItem<Circle, true>& item) const { return false; };
};

/* Macros for the ULTIMATE SPEED */
#define getSqrSize(cell) cell->r * cell->r
#define setSqrSize(cell, squredSize) cell-> sqrt(squredSize)
#define getMass(cell) getSqrSize(cell) / 100.0f
#define setMass(cell, mass) setSqrSize(cell, mass * 100.0f)
#define isBoosting(cell) cell->boost.d > 1
#define EAT(cell1, cell2) setSqrSize(cell1, getSqrSize(cell1) + getSqrSize(cell2)); cell2->eatenById = cell1->id

/* Cell with pointer to world and owner */
struct Cell : CircleItemBase<false> {

	/* Primitives */
	CellType type;
	bool exist = true;
	bool dead = false;
	bool inside = false;
	unsigned int id;
	unsigned int age = 0;
	Boost boost = { 0.0f, 0.0f, 0.0f };

	/* Pointers */
	World* world;
	Player* owner;
	Cell* eatenBy;

	Cell(World* world, CellType type, unsigned int id, float x, float y, float size, Player* owner = nullptr) :
		CircleItemBase(x, y, size), type(type), id(id), world(world), owner(owner), eatenBy(nullptr) {};

	virtual void onTick() = 0;

	/* Get the pure data of this cell */
	CellData* getData() {
		return new CellData(type, id, x, y, r, eatenBy ? eatenBy->id : 0);
	}
};

