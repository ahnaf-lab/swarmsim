import { frameRng } from './rng.js';

/**
 * Default rule set for the ant-trail foraging model. Ants live on an
 * integer grid, deposit pheromone as they move, and that pheromone
 * evaporates over time — the same feedback loop real ant colonies use to
 * carve out efficient trails between a nest and food sources.
 */
export const DEFAULT_ANT_RULES = Object.freeze({
  evaporation: 0.02, // fraction of pheromone lost each frame
  depositAmount: 5, // pheromone dropped per step by an ant carrying food
  explorationDeposit: 0.2, // small trace left by ants still searching
  sensorNoise: 0.15, // probability an ant ignores pheromone and picks a random step
  wrap: true, // treat width/height as a torus instead of hard edges
});

const NEIGHBORS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]);

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

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

/** Shortest squared distance between two grid cells, wrapping if requested. */
function wrappedDist2(ax, ay, bx, by, width, height, wrap) {
  let dx = ax - bx;
  let dy = ay - by;
  if (wrap) {
    if (dx > width / 2) dx -= width;
    if (dx < -width / 2) dx += width;
    if (dy > height / 2) dy -= height;
    if (dy < -height / 2) dy += height;
  }
  return dx * dx + dy * dy;
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

  if (state.nest === null || typeof state.nest !== 'object') {
    throw new TypeError('state.nest must be an object');
  }
  assertNonNegInt(state.nest.x, 'state.nest.x');
  assertNonNegInt(state.nest.y, 'state.nest.y');

  if (!Array.isArray(state.food) || state.food.length !== cells) {
    throw new TypeError(`state.food must be an array of length width*height (${cells})`);
  }
  for (const [i, amount] of state.food.entries()) {
    assertFiniteNumber(amount, `state.food[${i}]`);
  }

  if (!Array.isArray(state.pheromone) || state.pheromone.length !== cells) {
    throw new TypeError(`state.pheromone must be an array of length width*height (${cells})`);
  }
  for (const [i, level] of state.pheromone.entries()) {
    assertFiniteNumber(level, `state.pheromone[${i}]`);
  }

  if (!Array.isArray(state.ants)) {
    throw new TypeError('state.ants must be an array');
  }
  for (const [i, ant] of state.ants.entries()) {
    assertNonNegInt(ant?.x, `state.ants[${i}].x`);
    assertNonNegInt(ant?.y, `state.ants[${i}].y`);
    if (typeof ant?.carrying !== 'boolean') {
      throw new TypeError(`state.ants[${i}].carrying must be a boolean`);
    }
  }
}

/**
 * Advance an ant-trail foraging simulation by exactly one frame.
 *
 * Pure function: neither `state` nor `rules` is mutated, and calling this
 * repeatedly with the same three arguments always produces the same
 * (deep-equal) result. Ants that stand on a food cell pick it up; ants
 * carrying food walk toward the nest and drop it off; every ant deposits
 * pheromone on the cell it occupies, and pheromone evaporates a little
 * every frame. Ants without food either follow the strongest nearby
 * pheromone (breaking ties randomly) or, with probability
 * `rules.sensorNoise`, wander randomly instead — the same
 * exploration/exploitation trade-off that produces real ant trails.
 *
 * @param {object} state
 * @param {number} state.width
 * @param {number} state.height
 * @param {number} [state.frame]
 * @param {{x:number,y:number}} state.nest
 * @param {number[]} state.food flat width*height grid of food remaining per cell
 * @param {number[]} state.pheromone flat width*height grid of pheromone level per cell
 * @param {Array<{x:number,y:number,carrying:boolean}>} state.ants
 * @param {object} [rules] partial override of DEFAULT_ANT_RULES
 * @param {number|string} seed
 * @returns {object} new state, same shape as the input
 */
export function antStep(state, rules = {}, seed = 0) {
  validateState(state);
  const r = { ...DEFAULT_ANT_RULES, ...rules };
  const frame = Number.isInteger(state.frame) ? state.frame : 0;
  const { width, height, nest, food, ants } = state;
  const rng = frameRng(seed, frame);

  const pheromone = state.pheromone.map((p) => p * (1 - r.evaporation));
  const foodGrid = food.slice();

  const nextAnts = ants.map((ant) => {
    const cell = cellIndex(ant.x, ant.y, width);
    let { x, y, carrying } = ant;

    if (!carrying && foodGrid[cell] > 0) {
      foodGrid[cell] -= 1;
      carrying = true;
    } else if (carrying && x === nest.x && y === nest.y) {
      carrying = false;
    }

    pheromone[cell] += carrying ? r.depositAmount : r.explorationDeposit;

    const candidates = NEIGHBORS.map(([dx, dy]) => {
      let nx = x + dx;
      let ny = y + dy;
      if (r.wrap) {
        nx = wrapCoord(nx, width);
        ny = wrapCoord(ny, height);
      } else {
        nx = clampCoord(nx, width);
        ny = clampCoord(ny, height);
      }
      return { nx, ny };
    });

    let target;
    if (carrying) {
      target = candidates.reduce((best, c) => {
        const d = wrappedDist2(c.nx, c.ny, nest.x, nest.y, width, height, r.wrap);
        const bd = wrappedDist2(best.nx, best.ny, nest.x, nest.y, width, height, r.wrap);
        return d < bd ? c : best;
      });
    } else if (rng() < r.sensorNoise) {
      target = candidates[Math.floor(rng() * candidates.length)];
    } else {
      let maxP = -Infinity;
      let best = [];
      for (const c of candidates) {
        const p = pheromone[cellIndex(c.nx, c.ny, width)];
        if (p > maxP) {
          maxP = p;
          best = [c];
        } else if (p === maxP) {
          best.push(c);
        }
      }
      target = best[Math.floor(rng() * best.length)];
    }

    return { x: target.nx, y: target.ny, carrying };
  });

  return {
    width,
    height,
    frame: frame + 1,
    nest,
    food: foodGrid,
    pheromone,
    ants: nextAnts,
  };
}
