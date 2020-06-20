#include "Connection/SocketServer.hpp"
#include "Game/Game.hpp"

int main() {
	Game game;

	SocketServer server(&game);
	server.open();
	// Blocks
	game.start();

	server.close();
	return EXIT_SUCCESS;
}