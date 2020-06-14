#include "World.hpp"

World::World() : 
	pool(CFG.game.threads), 
	core(CFG.border, CFG.quadtree.maxLevel, CFG.quadtree.maxItems), 
	core_copy(nullptr) {};

void World::update() {};
