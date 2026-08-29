import { frameRng } from './rng.js';

/**
 * Default rule set for the voting-consensus model (a grid voter model).
 * Every voter sits on one cell of a width*height grid; each frame it either
 * copies a random neighbor's opinion or, with probability `rules.noise`,
 * switches to a random opinion of its own — the noise term models
 * stubborn or contrarian voters and keeps the system from freezing solid.
 */
export const DEFAULT_VOTE_RULES = Object.freeze({
  numOpinions: 2, // number of distinct opinion values, indexed 0..numOpinions-1
  noise: 0.02, // probability a voter ignores neighbors and picks a random opinion
  wrap: true, // treat width/height as a torus instead of hard edges
});

const NEIGHBORS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]);

function assertNonNegInt(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer, got ${String(value)}`);
  }
}

function wrapCoord(v, size) {
  const w = v % size;
  return w < 0 ? w + size : w;
}

function clampCoord(v, size) {
  return Math.max(0, Math.min(size - 1, v));
}

function cellIndex(x, y, width) {
  return y * width + x;
}

function validateState(state) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('state must be an object');
  }
  assertNonNegInt(state.width, 'state.width');
  assertNonNegInt(state.height, 'state.height');
  if (state.width <= 0 || state.height <= 0) {
    throw new RangeError('state.width and state.height must be > 0');
  }
  const cells = state.width * state.height;

  if (!Array.isArray(state.opinions) || state.opinions.length !== cells) {
    throw new TypeError(`state.opinions must be an array of length width*height (${cells})`);
  }
  for (const [i, opinion] of state.opinions.entries()) {
    assertNonNegInt(opinion, `state.opinions[${i}]`);
  }
}

/**
 * Advance a voting-consensus simulation by exactly one frame.
 *
 * Pure function: neither `state` nor `rules` is mutated, and calling this
 * repeatedly with the same three arguments always produces the same
 * (deep-equal) result. Each cell either adopts one of its eight neighbors'
 * opinions (copied uniformly at random — the classic voter-model update
 * rule that drives local consensus to spread) or, with probability
 * `rules.noise`, jumps to a uniformly random opinion instead.
 *
 * @param {object} state
 * @param {number} state.width
 * @param {number} state.height
 * @param {number} [state.frame]
 * @param {number[]} state.opinions flat width*height grid, one opinion index per cell
 * @param {object} [rules] partial override of DEFAULT_VOTE_RULES
 * @param {number|string} seed
 * @returns {object} new state, same shape as the input
 */
export function voteStep(state, rules = {}, seed = 0) {
  validateState(state);
  const r = { ...DEFAULT_VOTE_RULES, ...rules };
  if (!Number.isInteger(r.numOpinions) || r.numOpinions < 2) {
    throw new RangeError('rules.numOpinions must be an integer >= 2');
  }
  const frame = Number.isInteger(state.frame) ? state.frame : 0;
  const { width, height, opinions } = state;
  const rng = frameRng(seed, frame);

  const nextOpinions = opinions.map((_, cell) => {
    const x = cell % width;
    const y = Math.floor(cell / width);

    if (rng() < r.noise) {
      return Math.floor(rng() * r.numOpinions);
    }

    const [dx, dy] = NEIGHBORS[Math.floor(rng() * NEIGHBORS.length)];
    let nx = x + dx;
    let ny = y + dy;
    if (r.wrap) {
      nx = wrapCoord(nx, width);
      ny = wrapCoord(ny, height);
    } else {
      nx = clampCoord(nx, width);
      ny = clampCoord(ny, height);
    }
    return opinions[cellIndex(nx, ny, width)];
  });

  return {
    width,
    height,
    frame: frame + 1,
    opinions: nextOpinions,
  };
}
