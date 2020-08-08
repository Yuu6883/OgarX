#include "Connection/SocketServer.hpp"
#include "Game/Game.hpp"

int main() {

	/*
	Game game;

	SocketServer server(&game);
	server.open();
	// Blocks
	game.start();

	server.close(); */

	auto data = new CellData(0, 0, 0, 0, 10, 0);

	unsigned int m = 10;
	QuadTree<CircleItemBase<true>, true> tree(Rect(0, 0, 100, 100), m, m);

	tree.insert(data);

	delete data;
	return EXIT_SUCCESS;
}