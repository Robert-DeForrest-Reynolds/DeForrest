CC = gcc

SourceFiles = $(wildcard *.c)

Include = -IInclude
RaylibInclude = -I../Raylib/include
RaylibLib = -L../Raylib/lib -lraylib -lopengl32 -lgdi32 -lwinmm

BUILD_STRING = $(CC) $(SourceFiles) -I$(Include) $(RaylibInclude) $(RaylibLib)

.PHONY: all build Build run Run

all: Build

Build:
	$(BUILD_STRING) -o Grapher
build: Build

Run: build
	./Grapher.exe
run: Run
