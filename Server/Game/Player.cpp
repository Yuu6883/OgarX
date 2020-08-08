#include "Player.hpp"

void Player::init(unsigned char id, Game* game, uv_loop_t* loop) {
	if (this->game || this->loop) return;

	exist = true;
	this->id = id;
	this->game = game;
	this->loop = loop;
	interval->data = this;

	uv_timer_start(interval.get(), [](uv_timer_t* handle) {
		auto self = (Player*) handle->data;
		self->update();
	}, 0, 1000 / CFG.game.frequency);
}

void Player::update() {

}

void Player::unload() {
	exist = false;
	game = nullptr;
	loop = nullptr;
	state = PlayerState::DEAD;

	auto handle = interval.get();
	if (handle && uv_is_active((uv_handle_t*) handle)) {
		uv_close((uv_handle_t*)interval.release(), [](uv_handle_t* handle) {
			delete handle;
		});
	}
}