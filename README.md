# swarmsim

A zero-dependency Node library for simulating emergent-behavior systems —
flocking, foraging, consensus — as seeded, deterministic frame-by-frame steps.
Given the same starting state, rules, and seed, a simulation always produces
the exact same next frame, which makes runs reproducible and easy to
snapshot-test.

Three models ship so far: boids flocking, ant-trail foraging, and voting
consensus. Each is driven by its own stepper function, but every stepper
shares the same shape — `step(state, rules, seed)` returns a brand new state
one frame later, without touching its inputs. A terminal ASCII renderer is
planned for a later milestone and is not part of this release.

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

### Ant-trail foraging

```js
import { antStep, DEFAULT_ANT_RULES } from './src/index.js';

const width = 10;
const height = 10;

let state = {
  width,
  height,
  frame: 0,
  nest: { x: 0, y: 0 },
  food: new Array(width * height).fill(0),
  pheromone: new Array(width * height).fill(0),
  ants: [
    { x: 3, y: 3, carrying: false },
    { x: 7, y: 6, carrying: false },
  ],
};
state.food[5 * width + 5] = 4; // four units of food at (5, 5)

const seed = 'my-colony';
state = antStep(state, DEFAULT_ANT_RULES, seed);
state = antStep(state, DEFAULT_ANT_RULES, seed);
```

`food` and `pheromone` are flat `width * height` grids, indexed as
`y * width + x`. Each frame, every ant standing on food picks one unit of it
up, ants carrying food walk toward `nest` and drop it off on arrival, and
every ant deposits pheromone on the cell it occupies. Pheromone evaporates by
`rules.evaporation` each frame. Ants without food usually follow the
strongest nearby pheromone trail (ties broken at random); with probability
`rules.sensorNoise` they ignore the trail and wander instead, which is what
lets a colony discover new food in the first place.

### Voting consensus

```js
import { voteStep, DEFAULT_VOTE_RULES } from './src/index.js';

const width = 10;
const height = 10;

let state = {
  width,
  height,
  frame: 0,
  opinions: Array.from({ length: width * height }, () => Math.round(Math.random())),
};

const seed = 'my-electorate';
state = voteStep(state, DEFAULT_VOTE_RULES, seed);
state = voteStep(state, DEFAULT_VOTE_RULES, seed);
```

`opinions` is a flat `width * height` grid of integers in
`[0, rules.numOpinions)`, one per cell. Each frame, every cell copies the
opinion of a randomly chosen neighbor (the classic voter-model update, which
lets local majorities spread through the grid) or, with probability
`rules.noise`, switches to a uniformly random opinion instead — a small
amount of "stubbornness" that keeps the system from freezing prematurely.

All three steppers share one interface — `step(state, rules, seed)` in, a
new state out — so callers can advance any of them the same way and swap
models without changing how the simulation loop is driven.

## Status

Built autonomously and gated on passing tests: every change here builds
cleanly and ships only once its automated test suite passes.
