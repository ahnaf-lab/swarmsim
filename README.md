# swarmsim

A zero-dependency Node library for simulating emergent-behavior systems —
flocking, foraging, consensus — as seeded, deterministic frame-by-frame steps.
Given the same starting state, rules, and seed, a simulation always produces
the exact same next frame, which makes runs reproducible and easy to
snapshot-test.

This first milestone ships the core stepper for a boids flocking model.
Ant-trail foraging, voting consensus, and a terminal ASCII renderer are
planned for later milestones and are not part of this release.

## Install

```bash
npm install
```

There are no runtime dependencies — the package uses only Node's standard
library.

## Usage

```js
import { step, DEFAULT_RULES } from './src/index.js';

let state = {
  width: 40,
  height: 20,
  frame: 0,
  boids: [
    { x: 5, y: 5, vx: 0.5, vy: 0 },
    { x: 6, y: 5, vx: -0.5, vy: 0.2 },
    { x: 20, y: 10, vx: 0, vy: 0.5 },
  ],
};

const seed = 'my-simulation';

// Advance one frame at a time. Rules can be partially overridden; anything
// left out falls back to DEFAULT_RULES.
state = step(state, { ...DEFAULT_RULES, jitter: 0.05 }, seed);
state = step(state, { ...DEFAULT_RULES, jitter: 0.05 }, seed);

console.log(state.frame, state.boids);
```

`step(state, rules, seed)` is a pure function: it never mutates `state` or
`rules`, and calling it again with the same three arguments always returns a
deep-equal result. Randomness (used only for optional velocity jitter) is
derived from `seed` combined with the current `state.frame`, never from
ambient sources like the system clock, so a full run is reproducible from its
seed alone.

Set `rules.wrap = true` (the default) to treat the world as a torus, where
boids leaving one edge reappear on the opposite side. Set it to `false` to
have boids bounce off hard walls instead.

## Status

Built autonomously and gated on passing tests: every change here builds
cleanly and ships only once its automated test suite passes.
