#pragma once

#include <uwebsockets/App.h>
#include <mutex>
#include <memory>

#include "Game.hpp"
#include "Viewport.hpp"

using std::mutex;
using std::u16string;
using u8string = std::string;
using std::unique_ptr;
using std::make_unique;

enum class PlayerState : unsigned char {
	DEAD, ALIVE, SPEC, ROAM
};

struct InputData {
	mutex m;

	u16string name;
	u8string skin;
	u8string tag;

	bool busy = false;
	bool admin = false;
	bool spawning = false;
	bool spectating = false;
	bool ejectMacro = false;
	bool disconnected = false;

	float mouseX = 0;
	float mouseY = 0;

	unsigned short splitAttempts = 0;
	unsigned short ejectAttempts = 0;
};

struct Player {
	
	Game* game;
	uv_loop_t* loop;
	unique_ptr<uv_timer_t> interval;
	shared_ptr<QuadTree<CellData, true>> last_core;
	shared_ptr<QuadTree<CellData, true>> core_copy;

	Player() : game(nullptr), loop(nullptr), 
		interval(make_unique<uv_timer_t>()),
		last_core(nullptr), core_copy(nullptr) {};
	~Player();

	void init(Game* game, uv_loop_t* loop);
	void update();
	string_view buffer();

	PlayerState state = PlayerState::DEAD;

	bool exist = false;
	unsigned char id = 0;
	unsigned int cellCount = 0;

	InputData input;
	Viewport viewport;

	u16string name;
	u8string skin;

	float score = 0.0f;
	float maxScore = 0.0f;

	unsigned long killCount = 0;
	unsigned long ejectTick = 0;
	unsigned long joinTick = 0;
};