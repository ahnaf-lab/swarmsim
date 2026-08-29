// ASCII renderer: turns any of this package's simulation states into a
// fixed-width character grid, so a run can be watched in a terminal or
// captured as a golden-file snapshot at any frame.
//
// Every render* function is pure and synchronous: same state and options in,
// same array of equal-length strings out. Rows are always exactly
// `state.height` entries long and every row is always exactly `state.width`
// characters, which is what makes frame-by-frame golden-file comparison
// meaningful (a shape change would show up as a diff, not a crash).

const BOID_DIRS = Object.freeze(['\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196', '\u2191', '\u2197']);
// →        ↘        ↓        ↙        ←        ↖        ↑        ↗

function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer, got ${String(value)}`);
  }
}

function makeGrid(width, height, fill) {
  const rows = new Array(height);
  for (let y = 0; y < height; y++) {
    rows[y] = new Array(width).fill(fill);
  }
  return rows;
}

function gridToLines(grid) {
  return grid.map((row) => row.join(''));
}

function wrapIndex(value, size) {
  const w = Math.floor(value) % size;
  return w < 0 ? w + size : w;
}

/**
 * Render a boids-flocking state as a character grid. Each boid is drawn as
 * an arrow glyph pointing in its current direction of travel (one of eight
 * compass headings); a boid with near-zero speed is drawn as `stillChar`
 * instead, since a direction cannot be inferred from no motion. Boids that
 * land on the same cell overwrite earlier ones in array order.
 *
 * @param {object} state as produced by `step()`
 * @param {object} [options]
 * @param {string} [options.bg='.'] background character
 * @param {string} [options.stillChar='o'] glyph for a boid with ~zero speed
 * @param {number} [options.minSpeed=1e-6] speed below which a boid counts as still
 * @returns {string[]} `state.height` rows, each `state.width` characters wide
 */
export function renderBoids(state, options = {}) {
  const width = Math.max(1, Math.round(state.width));
  const height = Math.max(1, Math.round(state.height));
  const bg = options.bg ?? '.';
  const stillChar = options.stillChar ?? 'o';
  const minSpeed = options.minSpeed ?? 1e-6;

  const grid = makeGrid(width, height, bg);

  for (const boid of state.boids) {
    const col = wrapIndex(boid.x, width);
    const row = wrapIndex(boid.y, height);
    const speed = Math.hypot(boid.vx, boid.vy);
    if (speed < minSpeed) {
      grid[row][col] = stillChar;
      continue;
    }
    const angle = Math.atan2(boid.vy, boid.vx);
    const step = (2 * Math.PI) / BOID_DIRS.length;
    const bucket = (((Math.round(angle / step) % BOID_DIRS.length) + BOID_DIRS.length) % BOID_DIRS.length);
    grid[row][col] = BOID_DIRS[bucket];
  }

  return gridToLines(grid);
}

const DEFAULT_PHEROMONE_RAMP = ' .:-=+*#%@';

/**
 * Render an ant-trail foraging state as a character grid. Layers, drawn in
 * order (each overwrites the one before it):
 *   1. pheromone intensity, bucketed onto `options.pheromoneRamp`, scaled
 *      against the strongest pheromone value present in this frame;
 *   2. food remaining on a cell, as a digit `1`-`9` (amounts above 9 clip to `9`);
 *   3. the nest, as `N`;
 *   4. ants, as `a` (searching) or `A` (carrying food).
 *
 * @param {object} state as produced by `antStep()`
 * @param {object} [options]
 * @param {string} [options.pheromoneRamp=' .:-=+*#%@'] low-to-high intensity ramp
 * @returns {string[]} `state.height` rows, each `state.width` characters wide
 */
export function renderAnts(state, options = {}) {
  const width = state.width;
  const height = state.height;
  assertPositiveInt(width, 'state.width');
  assertPositiveInt(height, 'state.height');
  const ramp = options.pheromoneRamp ?? DEFAULT_PHEROMONE_RAMP;
  if (typeof ramp !== 'string' || ramp.length < 2) {
    throw new TypeError('options.pheromoneRamp must be a string of at least 2 characters');
  }

  const grid = makeGrid(width, height, ramp[0]);

  let maxPheromone = 0;
  for (const level of state.pheromone) {
    if (level > maxPheromone) maxPheromone = level;
  }

  for (let cell = 0; cell < state.pheromone.length; cell++) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    if (maxPheromone > 0) {
      const ratio = state.pheromone[cell] / maxPheromone;
      const idx = Math.min(ramp.length - 1, Math.max(0, Math.floor(ratio * (ramp.length - 1))));
      grid[y][x] = ramp[idx];
    }
  }

  for (let cell = 0; cell < state.food.length; cell++) {
    if (state.food[cell] <= 0) continue;
    const x = cell % width;
    const y = Math.floor(cell / width);
    grid[y][x] = String(Math.min(9, Math.floor(state.food[cell])));
  }

  grid[state.nest.y][state.nest.x] = 'N';

  for (const ant of state.ants) {
    grid[ant.y][ant.x] = ant.carrying ? 'A' : 'a';
  }

  return gridToLines(grid);
}

const DEFAULT_OPINION_PALETTE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Render a voting-consensus state as a character grid. Each cell's opinion
 * index is mapped straight onto `options.palette` (`opinions[i]` selects
 * `palette[i]`), so cells sharing an opinion always render the same glyph.
 *
 * @param {object} state as produced by `voteStep()`
 * @param {object} [options]
 * @param {string} [options.palette='0123456789ABC...'] one glyph per opinion index
 * @returns {string[]} `state.height` rows, each `state.width` characters wide
 */
export function renderVoting(state, options = {}) {
  const width = state.width;
  const height = state.height;
  assertPositiveInt(width, 'state.width');
  assertPositiveInt(height, 'state.height');
  const palette = options.palette ?? DEFAULT_OPINION_PALETTE;
  if (typeof palette !== 'string' || palette.length < 1) {
    throw new TypeError('options.palette must be a non-empty string');
  }

  const grid = makeGrid(width, height, palette[0]);

  for (let cell = 0; cell < state.opinions.length; cell++) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const opinion = state.opinions[cell];
    if (opinion < 0 || opinion >= palette.length) {
      throw new RangeError(
        `opinion ${opinion} at cell ${cell} has no glyph in a palette of length ${palette.length}`,
      );
    }
    grid[y][x] = palette[opinion];
  }

  return gridToLines(grid);
}

/**
 * Detect which model produced `state` and render it with the matching
 * function, so a caller driving a generic simulation loop does not need to
 * track which stepper it used.
 *
 * @param {object} state produced by `step()`, `antStep()`, or `voteStep()`
 * @param {object} [options] forwarded to the matching render* function
 * @returns {string[]}
 */
export function render(state, options = {}) {
  if (Array.isArray(state?.boids)) return renderBoids(state, options);
  if (Array.isArray(state?.ants)) return renderAnts(state, options);
  if (Array.isArray(state?.opinions)) return renderVoting(state, options);
  throw new TypeError('state does not match any known model (boids, ants, opinions)');
}

/** Join rendered rows into one printable string, terminal-ready. */
export function linesToString(lines) {
  return lines.join('\n');
}
