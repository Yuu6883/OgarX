#include "Player.hpp"

void Player::init(Game* game, uv_loop_t* loop) {
	this->game = game;
	this->loop = loop;
	interval->data = this;
	exist = true;

	uv_timer_start(interval.get(), [](uv_timer_t* handle) {
		auto self = (Player*) handle->data;
		self->update();
	}, 0, 1000 / CFG.game.frequency);
}

Player::~Player() {
	if (uv_is_active((uv_handle_t*) interval.get())) {
		uv_close((uv_handle_t*) interval.release(), [](uv_handle_t* handle) {
			delete handle;
		});
	}
}

void Player::update() {

}