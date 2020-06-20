#include "SocketServer.hpp"

#define HANDLER(duplicate) if (CFG.socket.ssl) { ssl_handler.duplicate; } else { handler.duplicate; }

bool SocketServer::open(unsigned int threads) {
	if (state == SocketServerState::OPEN || state == SocketServerState::OPENING) return false;
	state = SocketServerState::OPENING;

#if _WIN32
	threads = 1;
#endif
	if (threads < 1) threads = 1;
	if (threads > thread::hardware_concurrency()) {
		threads = thread::hardware_concurrency();
		WARN("Socket Server thread capped to thread::hardware_concurrency(): " << threads);
	}

	DEBUG(threads << " SocketServer" << (threads > 1 ? "s" : "") << " opening at port " << CFG.socket.port);

	struct UserData {};

	std::mutex m;
	std::condition_variable cv;
	for (unsigned int i = 0; i < threads; i++) {
		socket_threads.push_back(new thread([&] {

			uWS::SSLApp::WebSocketBehavior ssl_handler;
			uWS::App::WebSocketBehavior handler;

			HANDLER(compression = uWS::SHARED_COMPRESSOR);
			HANDLER(maxPayloadLength = 10 * 1024);
			HANDLER(maxBackpressure = 10 * 1024 * 1024);

			HANDLER(open = [&](auto* ws, auto* req) {
				string_view origin = req->getHeader("origin");
				string_view ip_buffer = ws->getRemoteAddress();

				unsigned int ipv4 = ip_buffer.size() == 4 ? *((unsigned int*)ip_buffer.data()) : 0;
				auto error = verify(ipv4, origin);

				int code = static_cast<int>(error.first);
				string message = error.second;

				DEBUG("Received connection");
				if (error.first != ErrorCode::NONE) {
					uWS::Loop::get()->defer([&] { ws->end(code, message); });
				} else {
					// TODO: connection
				}
			});

			HANDLER(message = [&](auto* ws, string_view buffer, uWS::OpCode opCode) {
				DEBUG("Socket message (length: " << buffer.size() << ")");
			});

			HANDLER(drain = [&](auto* ws) {});
			HANDLER(ping = [&](auto* ws) {});
			HANDLER(pong = [&](auto* ws) {});

			HANDLER(close = [&](auto* ws, int code, string_view message) {
				DEBUG("Socket closed (code: " << code << " message: " << message << ")");
			});

#define LISTEN(ssl) listen("0.0.0.0", CFG.socket.port, [&](auto addr) { \
			if (addr) { \
				std::lock_guard<std::mutex> lk(m); \
				us_sockets.push_back(addr); \
			} \
			else FATAL("SocketServer" << (ssl ? "(SSL)" : "") << " failed to open at port" << CFG.socket.port); \
			cv.notify_one(); \
			}).run();

			if (CFG.socket.ssl) {
				uWS::SSLApp(CFG.ssl_options()).ws<UserData>("/", std::move(ssl_handler)).LISTEN(true);
			} else {
				uWS::App().ws<UserData>("/", std::move(handler)).LISTEN(false);
			}
		}));
	}

	std::unique_lock<std::mutex> lk(m);
	cv.wait(lk, [&] { return threads == us_sockets.size(); });

	INFO(threads << " SocketServer" << (threads > 1 ? "s" : "") << \
		(CFG.socket.ssl ? "(SSL)" : "") << " opened at port " << CFG.socket.port);

	return true;
}

bool SocketServer::close() {
	if (state == SocketServerState::CLOSE) return false;
	state = SocketServerState::CLOSE;

	auto count = us_sockets.size();
	DEBUG(count << " SocketServer" << (count > 1 ? "s" : "") << " closing");

	for (auto socket : us_sockets)
		us_listen_socket_close(CFG.socket.ssl, socket);

	us_sockets.clear();

	for (auto thread : socket_threads)
		thread->join();

	INFO(count << " SocketServer" << (count > 1 ? "s" : "") << " closed");
	return true;
}

pair<ErrorCode, string> SocketServer::verify(unsigned int ipv4, string_view origin) {
	return { ErrorCode::INVALID_IP, "Bruh error" };
};