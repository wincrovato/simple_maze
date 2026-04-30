# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git & GitHub Workflow

Commit and push proactively throughout development — don't wait to be asked. Use Git as a running record of progress, not just a final checkpoint.

**When to commit (do this without being asked):**
- After scaffolding a new file or directory structure
- After each logical unit of work: a working feature, a bug fix, a refactor, a config change
- After updating CLAUDE.md or other documentation
- Whenever a meaningful, self-contained change is in place — even mid-task if the next step is risky or experimental

**Rules:**
- Write clean, descriptive commit messages that explain *what* changed and *why* (not just "update file")
- Push to the remote after every commit so work is never only local
- Never let a completed session end with uncommitted work
- This applies to all projects in this repo

## Projects

### Simple Maze (`simple_maze.html`)

Open directly in a browser — no build step, no server required.

Single-file app with embedded CSS and JS. No dependencies.

**Maze generation:** Recursive backtracker algorithm. Each cell in the grid is a `Uint8Array` element storing a bitmask of open passages (`N=1, S=2, E=4, W=8`) plus a `VISITED=16` flag used only during generation.

**Rendering:** HTML5 Canvas. Redrawn from scratch on every move — no partial updates.

**Controls:** Arrow keys, WASD, on-screen d-pad buttons, and touch swipe on the canvas.

**Game flow:** Player starts at top-left (0,0), goal is bottom-right. Win is detected when `playerRow === rows-1 && playerCol === cols-1`.

**Key constants:** `CELL = 28` px per cell. Grid sizes: 11×11 (small), 21×21 (medium), 31×31 (large).

### Dreamy Garden Job Finder (`job_finder/`)

A web app that accepts a resume upload (PDF or DOCX), sends it to the Claude API, and uses Tavily web search via Claude tool use to find real matching job listings. Results are displayed as styled cards.

**Running:**
```bash
cd job_finder
npm install       # first time only
npm start         # starts server at http://localhost:3000
```

**Stack:** Node.js + Express backend, vanilla JS/HTML frontend, no framework.

**Key dependencies:** `@anthropic-ai/sdk`, `multer` (file upload), `mammoth` (DOCX parsing), `pdf-parse` (PDF parsing).

**Environment:** Requires `job_finder/.env` with `ANTHROPIC_API_KEY` and `TAVILY_API_KEY`. Copy from `job_finder/.env.example`. This file is gitignored — never commit it.

**Architecture:**
- `job_finder/server.js` — Express server; parses resume, runs Claude tool-use loop (Claude calls Tavily 3–5 times to find listings), returns structured JSON
- `job_finder/public/index.html` — single-file frontend; drag-and-drop upload, loading states, job cards with match score/reason/apply link
- Claude model: `claude-sonnet-4-6`. Prompt caching applied to resume text to reduce cost across tool-use iterations.
