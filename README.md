# N2K Platform

[![Live Almanac](https://img.shields.io/badge/live-N2K%20Almanac-2563eb?style=flat-square)](https://n2k-almanac-v3.web.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-20232a?style=flat-square&logo=react)](https://react.dev/)
[![MobX](https://img.shields.io/badge/MobX-6-ff9955?style=flat-square&logo=mobx&logoColor=white)](https://mobx.js.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)

N2K Platform is a solver, competition builder, and playable web app for the
N2K dice-and-equation game. It started as a comprehensive equation solver and
grew into a full platform: a TypeScript solver workspace, CLI tools, binary
dataset pipeline, React/MobX Almanac, local competition library, bot matches,
and themed UI editions.

**Live app:** [n2k-almanac-v3.web.app](https://n2k-almanac-v3.web.app)

## What It Does

- **Lookup** - choose dice and a target, then find the easiest valid equation.
- **Competition** - build boards, generate balanced rolls, pin cells, save
  competitions locally, and export match materials.
- **Library** - browse saved competitions with stats, history, thumbnails, and
  replay entry points.
- **Play** - run 60-second knockout races against local bot personas or use a
  saved competition as a multi-bout match sequence.
- **CLI** - solve, sweep, explain, generate boards, inspect rolls, and rebuild
  datasets from the terminal.
- **Aether mode** - an expanded ruleset with larger dice ranges, arity 3/4/5
  equations, lazy-loaded binary datasets, and a separate solver path through
  the same domain model.

## Why It Is Interesting

The project is more than a UI around a math helper. It includes:

- A unified equation domain with one solver and one difficulty heuristic.
- A bit-packed `.n2k` binary data format for fast browser lookup.
- Worker-backed dataset baking and runtime solving for larger Aether searches.
- A serializable game kernel for bots, replays, and future multiplayer.
- Local-first persistence through a pluggable content backend.
- A theme system with 17 editions mapped onto reusable layout primitives.
- Unit, integration, performance, and Playwright coverage across the solver and
  web app.

## Tech Stack

| Area | Tools |
| --- | --- |
| Solver/core | TypeScript, Node 20, Vitest |
| Web app | React, MobX, Vite, Tailwind |
| Data pipeline | TSX scripts, worker threads, custom `.n2k` blobs |
| Testing | Vitest, Playwright, performance harnesses |
| Hosting | Firebase Hosting |

## Architecture

The app follows a strict one-way dependency model:

```text
UI
  -> Stores
    -> Services
      -> Core
```

- **UI** observes stores and dispatches user actions.
- **Stores** own reactive state and orchestrate services.
- **Services** are stateless functions for solving, parsing, competition
  generation, exports, dataset loading, and persistence.
- **Core** contains shared types, constants, equation representation, and binary
  format code.

The solver workspace and the web app share the same domain assumptions, so the
CLI, exported datasets, bot play, and browser lookup all agree on legality and
difficulty.

## Repository Layout

```text
N2K-v3/
  src/
    core/        # shared types, constants, binary format, equation model
    services/    # solver, parser, difficulty, generators, exporter, game kernel
    games/       # N2K Classic game implementation and bot players
    cli/         # terminal REPL and command handlers
  scripts/       # dataset export and bake scripts
  tests/         # solver, CLI, game, binary, and service tests
  web/
    public/data/ # standard and Aether .n2k datasets
    src/
      core/      # web types and theme registry
      services/  # dataset loading, persistence, competition/export services
      stores/    # AppStore, DataStore, ThemeStore, PlayStore, etc.
      features/  # lookup, compose, library, match, play
      ui/        # chrome layouts and reusable UI primitives
    tests/       # web unit/integration/performance tests
    e2e/         # Playwright smoke and responsive flows
  docs/          # architecture, roadmap, changelog, planning notes
```

## Local Development

Root solver workspace:

```bash
npm install
npm test
npm run typecheck
npm run cli
```

Web app:

```bash
cd web
npm install
npm run dev
npm test
npm run test:e2e
npm run build
```

Dataset tools:

```bash
# Rebuild the standard browser lookup blob
npm run bake -- --mode standard

# Rebuild the arity-3 Aether blob
npm run bake -- --mode aether-arity3

# Export JSON/binary projections for tooling
npm run export
```

## Data Files

The web app loads precomputed `.n2k` datasets from `web/public/data/`.

| File | Purpose |
| --- | --- |
| `standard.n2k` | Eager-loaded standard lookup data |
| `aether-arity3.n2k` | Lazy-loaded Aether arity-3 data |
| `aether-arity4-commons.n2k` | Curated arity-4 Aether common tuples |
| `aether-arity5-commons.n2k` | Curated arity-5 Aether common tuples |

These files let the browser answer common lookup questions instantly without
recomputing the full search space on every page load.

## Project Status

The current deployed app ships Lookup, Competition, Library, Match, and Play
flows with local persistence and Aether integration. The roadmap tracks future
work around broader Aether arity coverage, richer competition formats,
multiplayer-ready persistence, and additional N2K minigames.

Useful docs:

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Changelog](docs/changelog.md)
- [Aether arity plan](docs/plan-aether-arity-mixes.md)

## Deployment

The Almanac is hosted on Firebase Hosting:

```bash
cd web
npm run build
firebase deploy --only hosting:almanac
```

Configured live target: [n2k-almanac-v3.web.app](https://n2k-almanac-v3.web.app)
