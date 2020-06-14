#pragma once

#include "../Primitives/Config.hpp"
#include "../Primitives/ThreadPool.hpp"
#include "../Primitives/QuadTree.hpp"
#include "../Cells/Cell.hpp"

#include <memory>

using std::shared_ptr;

struct World {
	ThreadPool pool;
	QuadTree<Cell*, false> core;
	shared_ptr<QuadTree<CellData*, true>> core_copy;

	World();
	void update();
};