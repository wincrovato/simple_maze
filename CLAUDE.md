# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git & GitHub Workflow

After completing any meaningful unit of work — a feature, a fix, a refactor — commit and push to GitHub immediately. Never let completed work sit uncommitted.

- Write clean, descriptive commit messages that explain *what* changed and *why* (not just "update file")
- Push to the remote after every commit so work is never only local
- This applies to all projects, not just this one

## Running the Game

Open `simple_maze.html` directly in a browser — no build step, no server required.

## Architecture

Single-file app (`simple_maze.html`) with embedded CSS and JS. No dependencies.

**Maze generation:** Recursive backtracker algorithm. Each cell in the grid is a `Uint8Array` element storing a bitmask of open passages (`N=1, S=2, E=4, W=8`) plus a `VISITED=16` flag used only during generation.

**Rendering:** HTML5 Canvas. Redrawn from scratch on every move — no partial updates.

**Controls:** Arrow keys, WASD, on-screen d-pad buttons, and touch swipe on the canvas.

**Game flow:** Player starts at top-left (0,0), goal is bottom-right. Win is detected when `playerRow === rows-1 && playerCol === cols-1`.

## Key Constants

- `CELL = 28` — pixel size of each maze cell
- Grid sizes: 11×11 (small), 21×21 (medium), 31×31 (large)
