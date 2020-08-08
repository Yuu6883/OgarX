#include "Game.hpp"
#include "Player.hpp"
#include "../Primitives/Logger.hpp"

#include <string_view>

Game::Game() :
	pool(CFG.game.threads),
	core(CFG.border, CFG.quadtree.maxLevel, CFG.quadtree.maxItems),
	core_copy(nullptr), loop(uv_default_loop()), 
	interval(std::make_unique<uv_timer_t>()),
	pipe(nullptr), tty(nullptr), players(new Player[MAX_PLAYER]) {

	uv_timer_init(loop, interval.get());
	interval->data = this;

	uv_handle_type type = uv_guess_handle(0);
	int code;

	if (type == UV_TTY) {
		tty = std::make_unique<uv_tty_t>();
		code = uv_tty_init(loop, tty.get(), 0, 1);
		tty->data = this;

		code = uv_read_start((uv_stream_t*) tty.get(), [](uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
			static char buffer[1024];
			buf->base = buffer;
			buf->len = sizeof(buffer);
		}, [](uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
			if (nread < 0) {
				uv_close((uv_handle_t*)stream, NULL);
				return;
			}
			else if (nread > 1) {
				buf->base[nread - 2] = 0;
				string_view message(buf->base, nread - 2);
				auto self = (Game*)stream->data;
				self->command(message);
			}
		});
		if (code < 0) ERROR("Failed to start reading stdin stream: " << uv_err_name(code));
	} else {

		pipe = std::make_unique<uv_pipe_t>();
		pipe->data = this;

		code = uv_pipe_init(loop, pipe.get(), 0);
		if (code < 0) ERROR("Failed to init stdin read stream: " << uv_err_name(code));

		code = uv_pipe_open(pipe.get(), 0);
		if (code < 0) ERROR("Failed to open stdin read stream: " << uv_err_name(code));

		code = uv_read_start((uv_stream_t*) pipe.get(), [](uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
			static char buffer[1024];
			buf->base = buffer;
			buf->len = sizeof(buffer);
		}, [](uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
			if (nread < 0) {
				uv_close((uv_handle_t*)stream, NULL);
				return;
			}
			else if (nread > 1) {
				string_view message(buf->base, nread - 2);
				auto self = (Game*)stream->data;
				self->command(message);
			}
		});
		if (code < 0) ERROR("Failed to start reading stdin stream: " << uv_err_name(code));
	}
};

Game::~Game() {

	uv_close((uv_handle_t*) interval.release(), [](uv_handle_t* handle) {
		delete handle;
	});

	if (pipe) {
		uv_close((uv_handle_t*) pipe.release(), [](uv_handle_t* handle) {
			delete handle;
		});
	}

	if (tty) {
		uv_close((uv_handle_t*) tty.release(), [](uv_handle_t* handle) {
			delete handle;
		});
	}

	delete[] cells;
	delete[] players;
}

void Game::start() {
	if (uv_is_active((uv_handle_t*)interval.get())) {
		WARN("Game update interval already running");
		return;
	}
	int update_interval = 1000 / CFG.game.frequency;

	int code = uv_timer_start(interval.get(), [](uv_timer_t* handle) {
		auto self = (Game*) handle->data;
		auto now = uv_now(self->loop);
		self->update(static_cast<unsigned int>(now - self->last_tick));
		self->last_tick = now;
	}, update_interval, update_interval);
	if (code < 0) ERROR("Failed to start update interval: " << uv_err_name(code));

	last_tick = uv_now(loop);
	DEBUG("Game event loop starting");

	code = uv_run(loop, UV_RUN_DEFAULT);
	if (code < 0) ERROR("Failed to start event loop: " << uv_err_name(code));
}

void Game::command(string_view message) {
	if (message == "exit") stop();
}

void Game::stop() {

	if (!uv_is_active((uv_handle_t*) interval.get())) {
		WARN("Game udpate interval not active");
		return;
	}

	if (uv_is_closing((uv_handle_t*) interval.get())) {
		WARN("Game udpate interval closing");
		return;
	}

	VERBOSE("Stopping update interval");
	int code = uv_timer_stop(interval.get());
	if (code < 0) ERROR("Failed to stop update interval: " << uv_err_name(code));
	uv_stop(loop);
}

void Game::update(unsigned int dt) {

	// Handle player input
	for (unsigned int i = 0; i < MAX_PLAYER; i++) {
		Player& player = players[i];
		if (!player.exist) continue;

		// Update cells list for each player in linear time
		auto c_iter = player.cellIDs.begin();
		while (c_iter != player.cellIDs.end()) {
			if (!cells[*c_iter].exist) c_iter = player.cellIDs.erase(c_iter);
			c_iter++;
		}

		// Lock input when the values are being read
		std::unique_lock<std::mutex> lock(player.input.m);

		unsigned int attempt = std::min(CFG.player.splitCap, static_cast<unsigned int>(player.input.splitAttempts));
		while (attempt--) {
			player.input.splitAttempts--;
			// Split player cells

		}
	}

	// Add new pellets
	// Add new Virus
	// Add new MotherCells

	VERBOSE(dt);
	// Boost cells
	// Update player cells (move, decay, auto)
	for (unsigned int i = 0; i < MAX_CELLS; i++) {
		if (!cells[i].exist) continue;
		Cell* cell = &cells[i];
		cell->isInside = false;
		cell->age += dt;
		if (isBoosting(cell)) {
			float d = cell->boost.d / 9 * dt;
			cell->x += cell->boost.dx * d;
			cell->y += cell->boost.dy * d;
			cell->boost.d -= d;
		}
		if (IS_PLAYER(cell->type)) {
			// Move player
			float dx = cell->target.x - cell->x;
			float dy = cell->target.y - cell->y;
			float d = sqrt(dx * dx + dy * dy);
			if (d < 1) return;
			float modifier = 1.0f;
			if (cell->r > CFG.player.minSplitSize * 5.f &&
				cell->age < CFG.player.noCollideDelay) modifier = 2.f;
			dx /= d; dy /= d;
			float speed = modifier * 88 * pow(cell->r, -0.4396754f) * CFG.player.moveMult;
			float m = std::min(speed, d) * dt;
			cell->x += dx * m; cell->y += dy * m;
			// Decay player
			if (cell->r > CFG.player.decayMin)
				cell->r -= cell->r * CFG.player.decayMult / 50.f * dt;
			// Autosplit
			if (cell->r > CFG.player.autoSize) {
				float autoSquared = CFG.player.autoSize * CFG.player.autoSize;
				float sizeSquared = getSqrSize(cell);
				float splitTimes = ceil(sizeSquared / autoSquared);
				for (unsigned int i = 0; i < splitTimes; i++) {
					if (findNewCell()) {
						Cell& newCell = cells[next_cell_id];
						float angle = randf * 2.f * PI;
						newCell.exist = true;
						newCell.boost = { sin(angle), cos(angle), CFG.player.splitBoost };
						newCell.x = cell->x + CFG.player.splitDistance * newCell.boost.dx;
						newCell.y = cell->y + CFG.player.splitDistance * newCell.boost.dy;
					}
				}
			}
		}
	}

	eatChecks.clear();
	rigidChecks.clear();
	// Detect collision/eat
	for (unsigned int th = 0; th < CFG.game.threads; th++) {
		pool.enqueue([this, th] {
		});
	}
	pool.finish();

	// Resolve collision/eat
	// Post update
};
