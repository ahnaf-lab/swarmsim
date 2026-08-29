# API reference

All exports come from the package root:

```js
import { step, DEFAULT_RULES, /* ... */ } from 'swarmsim';
```

or, inside this repository, directly from `src/index.js`.

Every stepper follows one contract — `fn(state, rules, seed) -> newState` —
and every renderer follows another — `render*(state, options) -> string[]`.
Once you know those two shapes, the sections below are a reference, not a
tutorial.

## Steppers

### `step(state, rules, seed)` — boids flocking

| | |
| --- | --- |
| `state.width`, `state.height` | number, grid size the boids move in |
| `state.frame` | number, optional, defaults to `0` |
| `state.boids` | `Array<{x, y, vx, vy}>` |
| `rules` | partial override of `DEFAULT_RULES`; see `src/step.js` for every field and what it does |
| `seed` | `number \| string` |
| returns | new state, same shape, with `frame` advanced by 1 |
| throws | `TypeError` for a malformed state (non-finite coordinates, wrong types); `RangeError` for non-positive dimensions |

### `antStep(state, rules, seed)` — ant-trail foraging

| | |
| --- | --- |
| `state.width`, `state.height` | number |
| `state.frame` | number, optional |
| `state.nest` | `{x, y}` |
| `state.food` | flat `width * height` array, food remaining per cell |
| `state.pheromone` | flat `width * height` array, pheromone level per cell |
| `state.ants` | `Array<{x, y, carrying}>` |
| `rules` | partial override of `DEFAULT_ANT_RULES`; see `src/ants.js` |
| `seed` | `number \| string` |
| returns | new state, same shape, with `frame` advanced by 1 |
| throws | `TypeError`/`RangeError` on malformed grids, nest, or ants |

### `voteStep(state, rules, seed)` — voting consensus

| | |
| --- | --- |
| `state.width`, `state.height` | number |
| `state.frame` | number, optional |
| `state.opinions` | flat `width * height` array of integers in `[0, rules.numOpinions)` |
| `rules` | partial override of `DEFAULT_VOTE_RULES`; see `src/voting.js` |
| `seed` | `number \| string` |
| returns | new state, same shape, with `frame` advanced by 1 |
| throws | `TypeError`/`RangeError` on a malformed grid or an invalid `rules.numOpinions` |

All three share the same guarantees: **pure** (neither `state` nor `rules` is
mutated) and **deterministic** (identical arguments always produce a
deep-equal result), because the only randomness any of them uses is derived
from `seed` and `state.frame` — never from `Date.now`, `Math.random`, or any
other ambient source.

## Renderers

| Function | Input state | Output |
| --- | --- | --- |
| `renderBoids(state, options)` | a `step()` state | `state.height` rows of `state.width` chars, arrow glyphs per boid |
| `renderAnts(state, options)` | an `antStep()` state | pheromone ramp, food digits, nest, and ants layered onto one grid |
| `renderVoting(state, options)` | a `voteStep()` state | one palette glyph per opinion index |
| `render(state, options)` | any of the above | auto-detects the model from `state.boids`/`state.ants`/`state.opinions` and dispatches |
| `linesToString(lines)` | `string[]` | `lines.join('\n')`, ready to print |

Every renderer is pure and synchronous, and every row is always exactly
`state.width` characters wide — see the JSDoc in `src/render.js` for the full
`options` list (background/glyph characters, ramps, palettes) each one
accepts.

## RNG helpers

| Function | Purpose |
| --- | --- |
| `hashSeed(seed)` | hash a `number \| string` seed to a 32-bit unsigned int |
| `deriveFrameSeed(seed, frame)` | combine a base seed with a frame index into one derived 32-bit seed |
| `mulberry32(seed32)` | build a PRNG (`() => number` in `[0, 1)`) from a 32-bit seed |
| `frameRng(seed, frame)` | convenience: `mulberry32(deriveFrameSeed(seed, frame))` |

These are what every built-in stepper uses internally to stay deterministic,
and what a custom stepper should use too — see the guide below.

## Plugging in a custom rule set

There are two levels of customization, depending on how far you want to go.

### 1. Override fields on an existing rule set

Every stepper's `rules` argument is merged with its defaults
(`{ ...DEFAULT_RULES, ...rules }`), so you only need to specify what you're
changing:

```js
import { step, DEFAULT_RULES } from 'swarmsim';

const looseFlock = { ...DEFAULT_RULES, matchingFactor: 0.01, jitter: 0.1 };
state = step(state, looseFlock, seed);
```

This is enough for most tuning — different flock tightness, different
evaporation rate, different noise level — without touching any library code.

### 2. Write a fully custom stepper

When the rule *shape* itself needs to change — new fields, a different
physical model, agents that don't fit `boids`/`ants`/`opinions` — write your
own stepper function. To stay compatible with the rest of the library (the
renderer, the CLI's expectations, and any test harness built around it), it
should follow the same contract every built-in stepper does:

1. **Signature**: `myStep(state, rules = {}, seed = 0) -> newState`.
2. **Merge, don't mutate**: build your effective rules with
   `{ ...MY_DEFAULT_RULES, ...rules }`, and never write to `state`, `rules`,
   or any array/object reachable from them. Return a brand new state object
   instead.
3. **Determinism**: get randomness only from `frameRng(seed, state.frame)`
   (or `mulberry32`/`hashSeed` directly, if you need more than one
   independent stream per frame). Never use `Math.random` or any other
   ambient source — that's what makes a run reproducible from its seed
   alone, and what makes golden-file/snapshot testing meaningful.
4. **Advance the frame counter**: the returned state's `frame` should be
   `(Number.isInteger(state.frame) ? state.frame : 0) + 1`, matching every
   built-in stepper.
5. **Validate inputs early**: throw `TypeError`/`RangeError` for a malformed
   state or rules *before* doing any work, the same way `src/step.js`,
   `src/ants.js`, and `src/voting.js` do.

If your state keeps one of the existing shapes — e.g. `{width, height,
frame, boids}` — it renders for free with `renderBoids`/`render`. If it
doesn't, write a small renderer following the same shape: return exactly
`state.height` strings, each exactly `state.width` characters, so it stays
diffable frame-by-frame in a snapshot test.

`examples/custom-rules.js` is a complete, runnable, tested example built to
this checklist: `gravityStep` defines its own rule shape (a list of
"gravity wells" instead of flocking factors), reuses `frameRng` for its
optional jitter, and returns a `boids`-shaped state so it renders with the
library's existing `renderBoids`/`render` unchanged.

```bash
node examples/custom-rules.js
```

See `test/custom-rules.test.js` for how to test a custom stepper the same
way the built-ins are tested: frame advancement, determinism, non-mutation,
and the specific behavior the rule set is supposed to produce.
