#pragma once

#include <iostream>
#include <mutex>

#define L_DEBUG   0
#define L_VERBOSE 1
#define L_INFO    2
#define L_WARN    3
#define L_ERROR   4
#define L_NOTHING 5

#ifndef L_LEVEL
#define L_LEVEL L_DEBUG
#endif

#ifndef L_COLOR
#define L_COLOR true
#endif

static std::ostream& out = std::cout;
static std::mutex LOG_LOCK;

#ifdef DEBUG
#undef DEBUG
#endif

#ifdef VERBOSE
#undef VERBOSE
#endif

#ifdef INFO
#undef INFO
#endif

#ifdef WARN
#undef WARN
#endif

#ifdef ERROR
#undef ERROR
#endif

#define END std::endl << ">"

#if L_LEVEL > L_DEBUG
#define DEBUG(code)
#else
#if L_COLOR 
#define DEBUG(code) { std::lock_guard l(LOG_LOCK); out << "\r[\033[92mdbug\033[0m] " << code << END; }
#else
#define DEBUG(code) { std::lock_guard l(LOG_LOCK); out << "\r[dbug] " << code << END; }
#endif
#endif

#if L_LEVEL > L_VERBOSE
#define VERBOSE(code)
#else
#if L_COLOR 
#define VERBOSE(code) { std::lock_guard l(LOG_LOCK); out << "\r[\033[95mverb\033[0m] " << code << END; }
#else
#define VERBOSE(code) { std::lock_guard l(LOG_LOCK); out << "\r[verb] " << code << END; }
#endif
#endif

#if L_LEVEL > L_INFO
#define INFO(code)
#else
#if L_COLOR 
#define INFO(code) { std::lock_guard l(LOG_LOCK); out << "\r[\033[96minfo\033[0m] " << code << END; }
#else
#define INFO(code) { std::lock_guard l(LOG_LOCK); out << "\r[info] " << code << END; }
#endif
#endif

#if L_LEVEL > L_WARN
#define WARN(code)
#else
#if L_COLOR 
#define WARN(code) { std::lock_guard l(LOG_LOCK); out << "\r[\033[93mwarn\033[0m] " << code << END; }
#else
#define WARN(code) { std::lock_guard l(LOG_LOCK); out << "\r[warn] " << code << END; }
#endif
#endif

#if L_LEVEL > L_ERROR
#define ERROR(code) 
#else
#if L_COLOR 
#define ERROR(code) { std::lock_guard l(LOG_LOCK); out << "\r[\033[91merro\033[0m] " << code << END; }
#else
#define ERROR(code) { std::lock_guard l(LOG_LOCK); out << "\r[erro] " << code << END; }
#endif
#endif

#if L_COLOR 
#define FATAL(code) { std::lock_guard l(LOG_LOCK); out << "\r[\033[91mfatal\033[0m] " << code << END; out.flush(); std::terminate(); }
#else
#define FATAL(code) { std::lock_guard l(LOG_LOCK); out << "\r[fatal] " << code << END; out.flush(); std::terminate(); }
#endif
