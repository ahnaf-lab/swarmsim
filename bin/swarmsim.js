#!/usr/bin/env node
// CLI: run one of the three built-in models for a fixed number of steps and
// print each frame to the terminal as it's produced. Every run is seeded, so
// `swarmsim --seed foo` always renders exactly the same sequence of frames.
//
// Usage:
//   node bin/swarmsim.js [--model boids|ants|voting] [--seed <string>]
//                         [--steps <n>] [--speed <ms>] [--width <n>]
//                         [--height <n>] [--count <n>]
//
// Kept dependency-free on purpose: argument parsing, timing and output all
// use only Node's standard library.

import { step, DEFAULT_RULES } from '../src/step.js';
import { antStep, DEFAULT_ANT_RULES } from '../src/ants.js';
import { voteStep, DEFAULT_VOTE_RULES } from '../src/voting.js';
import { render, linesToString } from '../src/render.js';
import { hashSeed, mulberry32 } from '../src/rng.js';

const DEFAULTS = Object.freeze({
  model: 'boids',
  seed: 'swarmsim',
  steps: 30,
  speed: 120, // ms between printed frames; 0 prints as fast as possible
  width: 40,
  height: 20,
  count: 12, // agent count for boids/ants; ignored for voting
});

const HELP = `swarmsim - watch a seeded, deterministic simulation in the terminal

Usage:
  swarmsim [options]

Options:
  --model <boids|ants|voting>  which simulation to run (default: ${DEFAULTS.model})
  --seed <string>              seed driving every random choice (default: ${DEFAULTS.seed})
  --steps <n>                  number of frames to advance and print (default: ${DEFAULTS.steps})
  --speed <ms>                 delay between printed frames, 0 = no delay (default: ${DEFAULTS.speed})
  --width <n>                  grid width (default: ${DEFAULTS.width})
  --height <n>                 grid height (default: ${DEFAULTS.height})
  --count <n>                  boids/ants to place (default: ${DEFAULTS.count}; unused for voting)
  -h, --help                   print this message and exit

Examples:
  swarmsim --model ants --seed colony-1 --steps 50 --speed 80
  swarmsim --model voting --width 20 --height 10 --steps 15 --speed 0
`;

/** Parse `--flag value` / `--flag=value` pairs from argv; unknown flags are rejected. */
export function parseArgs(argv) {
  const known = new Set(['model', 'seed', 'steps', 'speed', 'width', 'height', 'count']);
  const out = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      out.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`unrecognized argument: ${arg}`);
    }
    let key = arg.slice(2);
    let value;
    const eq = key.indexOf('=');
    if (eq !== -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    } else {
      value = argv[++i];
    }
    if (!known.has(key)) {
      throw new Error(`unrecognized option: --${key}`);
    }
    if (value === undefined) {
      throw new Error(`--${key} requires a value`);
    }
    out[key] = value;
  }
  return out;
}

function parsePositiveInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--${name} must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return n;
}

function parseNonNegInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  return n;
}

/** Deterministic PRNG for building an initial state, independent of the per-frame RNG. */
function initRng(seed, tag) {
  return mulberry32(hashSeed(`${seed}:${tag}`));
}

function buildInitialState(opts) {
  const { model, seed, width, height, count } = opts;

  if (model === 'boids') {
    const rng = initRng(seed, 'boids-init');
    const boids = Array.from({ length: count }, () => ({
      x: rng() * width,
      y: rng() * height,
      vx: (rng() * 2 - 1) * DEFAULT_RULES.maxSpeed,
      vy: (rng() * 2 - 1) * DEFAULT_RULES.maxSpeed,
    }));
    return { width, height, frame: 0, boids };
  }

  if (model === 'ants') {
    const rng = initRng(seed, 'ants-init');
    const nest = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    const food = new Array(width * height).fill(0);
    const pheromone = new Array(width * height).fill(0);

    const foodSpots = Math.max(1, Math.round(count / 2));
    for (let i = 0; i < foodSpots; i++) {
      const x = Math.floor(rng() * width);
      const y = Math.floor(rng() * height);
      const cell = y * width + x;
      if (x === nest.x && y === nest.y) continue;
      food[cell] = 3 + Math.floor(rng() * 6);
    }

    const ants = Array.from({ length: count }, () => ({
      x: nest.x,
      y: nest.y,
      carrying: false,
    }));

    return { width, height, frame: 0, nest, food, pheromone, ants };
  }

  if (model === 'voting') {
    const rng = initRng(seed, 'voting-init');
    const numOpinions = DEFAULT_VOTE_RULES.numOpinions;
    const opinions = Array.from({ length: width * height }, () => Math.floor(rng() * numOpinions));
    return { width, height, frame: 0, opinions };
  }

  throw new Error(`unknown --model ${JSON.stringify(model)}; expected boids, ants, or voting`);
}

function stepperFor(model) {
  if (model === 'boids') return { fn: step, rules: DEFAULT_RULES };
  if (model === 'ants') return { fn: antStep, rules: DEFAULT_ANT_RULES };
  if (model === 'voting') return { fn: voteStep, rules: DEFAULT_VOTE_RULES };
  throw new Error(`unknown --model ${JSON.stringify(model)}; expected boids, ants, or voting`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `opts.steps` frames of the chosen model, writing each rendered frame
 * to `write` (defaults to process.stdout). Returns the final state, mainly
 * so tests can drive this without spawning a subprocess.
 */
export async function run(rawOpts, { write = (s) => process.stdout.write(s), clear = false } = {}) {
  const opts = {
    model: rawOpts.model,
    seed: rawOpts.seed,
    steps: parsePositiveInt(rawOpts.steps, 'steps'),
    speed: parseNonNegInt(rawOpts.speed, 'speed'),
    width: parsePositiveInt(rawOpts.width, 'width'),
    height: parsePositiveInt(rawOpts.height, 'height'),
    count: parsePositiveInt(rawOpts.count, 'count'),
  };

  const { fn, rules } = stepperFor(opts.model);
  let state = buildInitialState(opts);

  for (let i = 0; i < opts.steps; i++) {
    state = fn(state, rules, opts.seed);
    if (clear) write('\x1Bc');
    write(`-- ${opts.model} frame ${state.frame}/${opts.steps} (seed=${opts.seed}) --\n`);
    write(linesToString(render(state)) + '\n');
    if (opts.speed > 0 && i < opts.steps - 1) {
      await sleep(opts.speed);
    }
  }

  return state;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`swarmsim: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  try {
    await run(opts, { clear: Boolean(process.stdout.isTTY) && Number(opts.speed) > 0 });
  } catch (err) {
    process.stderr.write(`swarmsim: ${err.message}\n`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
