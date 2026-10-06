import assert from "node:assert/strict";
import "./logic.js";

const {
  BREAKER_AMPS,
  LIGHT_DRAW,
  ROOMS,
  breakerTrips,
  isFullyOn,
  clampSlider,
  countLights,
  cellsOf,
  createState,
  formatAmps,
  gaugeLevel,
  isAllOff,
  isStrained,
  loadRatio,
  maxLights,
  power,
  sliderDraw,
  press,
  sanitize,
  setAll,
  tripThreshold,
} = globalThis.LightsOut;

function minPresses(roomIndex, goal) {
  const room = ROOMS[roomIndex];
  const spots = cellsOf(room).filter((spot) => !spot.quiet);
  let best = null;
  for (let mask = 0; mask < (1 << spots.length); mask += 1) {
    let grid = room.initial.map((row) => row.slice());
    let count = 0;
    for (let i = 0; i < spots.length; i += 1) {
      if (!(mask & (1 << i))) continue;
      grid = press(grid, spots[i].row, spots[i].col, "linked", room);
      count += 1;
    }
    const done = goal === "off"
      ? isAllOff(grid)
      : grid.every((row) => row.every((cell) => cell === null || cell === 1));
    if (done && (best === null || count < best)) best = count;
  }
  return best;
}

function offSets(roomIndex) {
  const room = ROOMS[roomIndex];
  const spots = cellsOf(room).filter((spot) => !spot.quiet);
  const hits = [];
  for (let mask = 0; mask < (1 << spots.length); mask += 1) {
    let grid = room.initial.map((row) => row.slice());
    const used = [];
    for (let i = 0; i < spots.length; i += 1) {
      if (!(mask & (1 << i))) continue;
      grid = press(grid, spots[i].row, spots[i].col, "linked", room);
      used.push(spots[i].label ?? "");
    }
    if (isAllOff(grid)) hits.push(used);
  }
  return hits;
}

const blank = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];
const center = press(blank, 1, 1, "linked");
assert.deepEqual(center, [
  [0, 1, 0],
  [1, 1, 1],
  [0, 1, 0],
]);
assert.deepEqual(blank[1][1], 0);

const alone = press(center, 0, 0, "single");
assert.equal(alone[0][0], 1);
assert.equal(alone[0][1], 1);

const room1 = minPresses(0, "off");
const room3 = minPresses(2, "off");
assert.equal(room1 <= 3, true);
assert.equal(room3, 4);
assert.equal(offSets(2).length, 1);
assert.equal(offSets(2)[0].length, 4);
assert.equal(offSets(2)[0].includes("0"), true);
assert.equal(isAllOff(ROOMS[0].initial), false);
assert.equal(isAllOff(ROOMS[2].initial), false);
assert.equal(minPresses(3, "off"), null);
assert.notEqual(minPresses(3, "on"), null);

const stack = ROOMS[1];
assert.equal(stack.id, "stack");
assert.equal(cellsOf(stack).length, 9);
assert.equal(cellsOf(stack).some((spot) => spot.row === 1 && spot.col === 1), false);
assert.equal(cellsOf(stack).filter((spot) => spot.front).length, 1);
const frontPress = press(stack.initial, 3, 1, "linked", stack);
assert.equal(frontPress[3][1], 0);
assert.equal(frontPress[1][1], 1);
assert.equal(frontPress[0][1], stack.initial[0][1]);
assert.equal(frontPress[1][0], stack.initial[1][0]);
const belowPress = press(stack.initial, 2, 1, "linked", stack);
assert.equal(belowPress[3][1], stack.initial[3][1]);
assert.equal(belowPress[1][1], stack.initial[1][1] ^ 1);
assert.deepEqual(press(stack.initial, 1, 1, "linked", stack), stack.initial);
assert.equal(minPresses(1, "off"), 4);
let solved = stack.initial;
for (const [r, c] of [[0, 1], [2, 0], [2, 2], [3, 1]]) solved = press(solved, r, c, "linked", stack);
assert.equal(isAllOff(solved), true);

const second = press(ROOMS[2].initial, 0, 0, "linked", ROOMS[2]);
assert.deepEqual(second, [
  [0, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
  [null, 1, null],
]);
const beforeWa = ROOMS[2].initial;
const wa = press(beforeWa, 3, 1, "linked", ROOMS[2]);
assert.equal(wa[3][1], beforeWa[3][1] ^ 1);
assert.equal(wa[2][1], beforeWa[2][1] ^ 1);
assert.equal(wa[2][0], beforeWa[2][0]);
assert.equal(wa[1][1], beforeWa[1][1]);
assert.deepEqual(press(ROOMS[3].initial, 1, 1, "linked", ROOMS[3]), ROOMS[3].initial);
const nudged = press(ROOMS[3].initial, 0, 1, "linked", ROOMS[3]);
assert.equal(nudged[1][1], 1);

assert.equal(maxLights(), 38);
assert.equal(tripThreshold(), 38 * LIGHT_DRAW + 200);

function loaded(overrides) {
  const state = createState();
  state.cleared = [true, true, true, false];
  state.grids = state.grids.map((grid) => setAll(grid, 1));
  state.brightness = 100;
  state.volume = 100;
  return { ...state, ...overrides };
}

const full = loaded();
assert.equal(countLights(full), 38);
assert.equal(power(full), tripThreshold());
assert.equal(isFullyOn(full), true);
assert.equal(breakerTrips(full), true);
assert.equal(formatAmps(power(full)), BREAKER_AMPS.toFixed(1));

const missingBulb = loaded();
missingBulb.grids[0][0][0] = 0;
assert.equal(breakerTrips(missingBulb), false);
assert.equal(isStrained(missingBulb), false);

const dim = loaded({ brightness: 99 });
assert.equal(breakerTrips(dim), false);
const quiet = loaded({ volume: 99 });
assert.equal(breakerTrips(quiet), false);

const resting = loaded({ brightness: 30, volume: 10 });
assert.ok(loadRatio(resting) < 1);
assert.equal(breakerTrips(resting), false);
assert.equal(isStrained(resting), true);

assert.equal(formatAmps(tripThreshold() - 1), "29.9");

const meter = createState();
meter.grids = meter.grids.map((grid) => setAll(grid, 0));
meter.brightness = 0;
meter.volume = 0;
assert.equal(gaugeLevel(meter), 0);
meter.grids[1] = setAll(meter.grids[1], 1);
meter.grids[3] = setAll(meter.grids[3], 1);
assert.equal(gaugeLevel(meter), 0);
meter.grids[0] = setAll(meter.grids[0], 1);
assert.equal(gaugeLevel(meter), 1);
meter.grids[2] = setAll(meter.grids[2], 1);
assert.equal(gaugeLevel(meter), 2);
meter.brightness = 100;
assert.equal(gaugeLevel(meter), 3);
meter.volume = 99;
assert.equal(gaugeLevel(meter), 3);
meter.volume = 100;
assert.equal(gaugeLevel(meter), 4);
meter.grids[0][0][0] = 0;
assert.equal(gaugeLevel(meter), 3);

const bad = sanitize({ phase: "play", cleared: [true], grids: [] });
assert.equal(bad, null);

const resumed = sanitize({
  phase: "tripping",
  cut: true,
  room: 3,
  brightness: 100,
  volume: 100,
  cleared: [true, true, true, false],
  grids: ROOMS.map((room) => setAll(room.initial, 1)),
});
assert.equal(resumed.phase, "dark");
assert.equal(resumed.room, 3);
assert.equal(resumed.grids[2][3][0], null);
assert.equal(resumed.grids[2][3][1], 1);
assert.equal(resumed.undo, null);

const withUndo = sanitize({
  phase: "dark",
  cut: true,
  room: 3,
  brightness: 100,
  volume: 100,
  cleared: [true, true, true, false],
  grids: ROOMS.map((room) => setAll(room.initial, 1)),
  undo: { room: 3, grid: ROOMS[3].initial.map((row) => row.slice()) },
});
assert.equal(withUndo.undo.room, 3);
assert.equal(withUndo.undo.grid[0][0], 1);
assert.equal(withUndo.undo.grid[1][1], 0);

const brokenUndo = sanitize({
  phase: "play",
  room: 0,
  brightness: 30,
  volume: 10,
  cleared: [false, false, false, false],
  grids: ROOMS.map((room) => room.initial.map((row) => row.slice())),
  undo: { room: 1, grid: [[1]] },
});
assert.equal(brokenUndo.undo, null);
assert.equal(clampSlider(999), 100);

const capped = sanitize({
  phase: "play",
  room: 1,
  brightness: 999,
  volume: 1200,
  cleared: [true, true, true, false],
  grids: ROOMS.map((room) => setAll(room.initial, 1)),
});
assert.equal(capped.brightness, 100);
assert.equal(capped.volume, 100);
assert.equal(sliderDraw(capped), 200);

const oldSave = sanitize({
  phase: "play",
  room: 0,
  brightness: 30,
  volume: 10,
  cleared: [false, false, false],
  grids: [ROOMS[0], ROOMS[2], ROOMS[3]].map((room) => room.initial.map((row) => row.slice())),
});
assert.equal(oldSave, null);

console.log("logic ok");
