import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { step, DEFAULT_RULES } from '../src/step.js';
import { antStep, DEFAULT_ANT_RULES } from '../src/ants.js';
import { voteStep, DEFAULT_VOTE_RULES } from '../src/voting.js';
import { render, renderBoids, renderAnts, renderVoting, linesToString } from '../src/render.js';

const goldenDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

function readGolden(name) {
  // Golden files are captured with a trailing newline; strip it so the
  // comparison is against exactly what linesToString() produces.
  return readFileSync(path.join(goldenDir, name), 'utf8').replace(/\n$/, '');
}

function assertGridShape(lines, width, height) {
  assert.equal(lines.length, height);
  for (const line of lines) {
    assert.equal(line.length, width);
  }
}

test('renderBoids matches its golden file frame-by-frame', () => {
  let state = {
    width: 12,
    height: 6,
    frame: 0,
    boids: [
      { x: 2, y: 2, vx: 0.6, vy: 0.1 },
      { x: 8, y: 4, vx: -0.4, vy: -0.6 },
      { x: 5, y: 1, vx: 0, vy: 0 },
    ],
  };
  const seed = 'golden-boids';
  for (let i = 0; i < 3; i++) {
    state = step(state, { ...DEFAULT_RULES, jitter: 0.4 }, seed);
  }

  const lines = renderBoids(state);
  assertGridShape(lines, 12, 6);
  assert.equal(linesToString(lines), readGolden('boids-frame3.txt'));
});

test('renderBoids draws a still boid as stillChar and a moving one as an arrow', () => {
  const state = {
    width: 5,
    height: 3,
    frame: 0,
    boids: [
      { x: 1, y: 1, vx: 0, vy: 0 },
      { x: 3, y: 1, vx: 1, vy: 0 },
    ],
  };
  const lines = renderBoids(state);
  assertGridShape(lines, 5, 3);
  assert.equal(lines[1][1], 'o');
  assert.equal(lines[1][3], '\u2192');
});

test('renderAnts matches its golden file frame-by-frame', () => {
  const width = 10;
  const height = 6;
  let state = {
    width,
    height,
    frame: 0,
    nest: { x: 1, y: 1 },
    food: new Array(width * height).fill(0),
    pheromone: new Array(width * height).fill(0),
    ants: [
      { x: 1, y: 1, carrying: false },
      { x: 2, y: 1, carrying: false },
      { x: 8, y: 4, carrying: false },
    ],
  };
  state.food[4 * width + 8] = 6;
  state.food[4 * width + 7] = 3;
  const seed = 'golden-ants';
  for (let i = 0; i < 5; i++) {
    state = antStep(state, DEFAULT_ANT_RULES, seed);
  }

  const lines = renderAnts(state);
  assertGridShape(lines, width, height);
  assert.equal(linesToString(lines), readGolden('ants-frame5.txt'));
});

test('renderAnts draws the nest and a carrying ant with distinct glyphs', () => {
  const state = {
    width: 4,
    height: 2,
    frame: 0,
    nest: { x: 0, y: 0 },
    food: new Array(8).fill(0),
    pheromone: new Array(8).fill(0),
    ants: [{ x: 3, y: 1, carrying: true }],
  };
  const lines = renderAnts(state);
  assertGridShape(lines, 4, 2);
  assert.equal(lines[0][0], 'N');
  assert.equal(lines[1][3], 'A');
});

test('renderVoting matches its golden file frame-by-frame', () => {
  const width = 10;
  const height = 6;
  let state = {
    width,
    height,
    frame: 0,
    opinions: Array.from({ length: width * height }, (_, i) => i % 3),
  };
  const seed = 'golden-voting';
  for (let i = 0; i < 4; i++) {
    state = voteStep(state, { ...DEFAULT_VOTE_RULES, numOpinions: 3 }, seed);
  }

  const lines = renderVoting(state);
  assertGridShape(lines, width, height);
  assert.equal(linesToString(lines), readGolden('voting-frame4.txt'));
});

test('renderVoting maps each opinion index straight onto the palette', () => {
  const state = {
    width: 3,
    height: 1,
    frame: 0,
    opinions: [0, 1, 2],
  };
  const lines = renderVoting(state, { palette: 'xyz' });
  assert.equal(lines[0], 'xyz');
});

test('render() auto-dispatches to the matching model renderer', () => {
  const boidsState = { width: 3, height: 2, frame: 0, boids: [{ x: 0, y: 0, vx: 1, vy: 0 }] };
  const votingState = { width: 3, height: 2, frame: 0, opinions: [0, 0, 0, 0, 0, 0] };
  const antsState = {
    width: 3,
    height: 2,
    frame: 0,
    nest: { x: 0, y: 0 },
    food: new Array(6).fill(0),
    pheromone: new Array(6).fill(0),
    ants: [],
  };

  assert.deepEqual(render(boidsState), renderBoids(boidsState));
  assert.deepEqual(render(votingState), renderVoting(votingState));
  assert.deepEqual(render(antsState), renderAnts(antsState));
  assert.throws(() => render({}), TypeError);
});

test('renderVoting rejects an opinion index with no glyph in the palette', () => {
  const state = { width: 1, height: 1, frame: 0, opinions: [5] };
  assert.throws(() => renderVoting(state, { palette: 'ab' }), RangeError);
});
