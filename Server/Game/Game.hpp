#pragma once

#include "../Primitives/Config.hpp"
#include "../Primitives/ThreadPool.hpp"
#include "../Cells/Cell.hpp"
#include <uv.h>

#define MAX_TYPES 256
#define MAX_CELLS 65536

#include <memory>
#include <string_view>

using std::shared_ptr;
using std::string_view;

struct Player;
struct Game {
	// libuv stuff
	uv_loop_t* loop;
	std::unique_ptr<uv_timer_t> interval;
	std::unique_ptr<uv_pipe_t> pipe;
	std::unique_ptr<uv_tty_t> tty;

	ThreadPool pool;

	QuadTree<Cell, false> core;
	shared_ptr<QuadTree<CellData, true>> core_copy;

	Cell*   cells   = new Cell[MAX_CELLS];
	Player* players; // Initialized in ctor because Player is unknown class here

	unsigned char  next_player_id = 0;
	unsigned short next_cell_id = 0;
	uint64_t last_tick = 0;

	list<EatIDPair>     eatChecks;
	list<CollisionData> rigidChecks;

	Game();
	~Game();

	void command(string_view input);

	void start();
	void stop();

	void update(unsigned int dt);
private:
	bool findNewCell() {
		unsigned start = next_cell_id;
		while (cells[next_cell_id].exist)
			if (start == ++next_cell_id) return false;
		return true;
	};
};