#pragma once

#include <unordered_map>
#include <atomic>

#include "World.hpp"

using u8string = std::string;
using std::atomic;
using std::u16string;
using std::unordered_map;

enum class PlayerState : unsigned char {
	DEAD, ALIVE, SPEC, ROAM
};

struct InputData {
	atomic<bool> spawn = false;
	u16string name;
	u8string skin;
	u8string tag;

	atomic<bool> admin = false;
	atomic<float> mouseX = 0;
	atomic<float> mouseY = 0;
	atomic<bool> spectate = false;
	
	atomic<bool> ejectMacro = false;
	atomic<bool> linelocked = false;
	atomic<unsigned short> splitAttempts = 0;
	atomic<unsigned short> ejectAttempts = 0;
};

struct Player {

	unsigned short id;

	u16string name;
	u8string skin;
	PlayerState state = PlayerState::DEAD;

	float score = 0.0f;
	float maxScore = 0.0f;
	unsigned long killCount = 0;
	unsigned long ejectTick;
	unsigned long joinTick = 0;

	World* world;
};