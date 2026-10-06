// Power model:
// The crackle starts as soon as every bulb is on.
// The breaker trips when every bulb is lit and both sliders are at 100.

const LIGHT_DRAW = 17;
// Matches the bulb count across all rooms.
const BREAKER_AMPS = 38;
const RED_RATIO = 0.8;
const STRAIN_RATIO = 0.8;
const DEFAULT_BRIGHTNESS = 30;
const DEFAULT_VOLUME = 10;

const ROOMS = [
  {
    id: "first",
    name: "1st",
    plate: "1st",
    initial: [
      [1, 0, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
  },
  {
    // Looks like 3×3, but the center is two bulbs seen in perspective.
    // The back one sits in the grid and has no button of its own.
    // The front one floats in front of it and is linked only to the back one.
    id: "stack",
    name: "2nd",
    plate: "2nd",
    front: { at: [3, 1], behind: [1, 1] },
    initial: [
      [1, 1, 1],
      [1, 0, 1],
      [1, 0, 1],
      [null, 1, null],
    ],
  },
  {
    // Shown as a row. Numbers above the bulbs are 1–9, then 0.
    // Neighbors are this shape, not the row:
    // 1 2 3
    // 4 5 6
    // 7 8 9
    //   0
    id: "second",
    name: "3rd",
    plate: "3rd",
    labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    // Phone keypad kana rows: pressing a bulb shows its kana at the bottom.
    kana: ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"],
    initial: [
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 0],
      [null, 1, null],
    ],
  },
  {
    // Nine lights. The center has no button, so neighbors still toggle it.
    // A full 3×3 cannot make all-on reachable and all-off unreachable.
    id: "last",
    name: "last",
    plate: "last",
    quiet: [[1, 1]],
    initial: [
      [1, 0, 1],
      [1, 0, 0],
      [0, 0, 0],
    ],
  },
];

function createState() {
  return {
    phase: "title",
    room: 0,
    brightness: DEFAULT_BRIGHTNESS,
    volume: DEFAULT_VOLUME,
    cut: false,
    undo: null,
    cleared: ROOMS.map(() => false),
    grids: ROOMS.map((room) => room.initial.map((row) => row.slice())),
  };
}

function isQuiet(room, row, col) {
  return Boolean(room?.quiet?.some(([r, c]) => r === row && c === col));
}

function isAt(spot, row, col) {
  return Boolean(spot) && spot[0] === row && spot[1] === col;
}

function cellsOf(room) {
  const cells = [];
  room.initial.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null || isAt(room.front?.behind, r, c)) return;
      cells.push({
        row: r,
        col: c,
        quiet: isQuiet(room, r, c),
        front: isAt(room.front?.at, r, c),
        label: room.labels ? (room.labels[cells.length] ?? "") : null,
      });
    });
  });
  return cells;
}

function maxLights() {
  return ROOMS.reduce(
    (sum, room) => sum + room.initial.flat().filter((cell) => cell !== null).length,
    0
  );
}

function tripThreshold() {
  return maxLights() * LIGHT_DRAW + 200;
}

function sliderDraw(state) {
  return clampSlider(state.brightness) + clampSlider(state.volume);
}

function clampSlider(value, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function press(grid, row, col, mode, room) {
  const next = grid.map((line) => line.slice());
  if (isQuiet(room, row, col) || next[row]?.[col] == null) return next;
  const front = room?.front;
  if (isAt(front?.behind, row, col)) return next;
  if (isAt(front?.at, row, col)) {
    next[front.at[0]][front.at[1]] ^= 1;
    next[front.behind[0]][front.behind[1]] ^= 1;
    return next;
  }
  const flip = (r, c) => {
    if (r < 0 || c < 0 || r >= next.length || c >= next[r].length) return;
    if (next[r][c] == null || isAt(front?.at, r, c)) return;
    next[r][c] ^= 1;
  };
  if (mode === "single") {
    flip(row, col);
  } else {
    flip(row, col);
    flip(row - 1, col);
    flip(row + 1, col);
    flip(row, col - 1);
    flip(row, col + 1);
  }
  return next;
}

function isAllOff(grid) {
  return grid.every((row) => row.every((cell) => cell !== 1));
}

function setAll(grid, value) {
  return grid.map((row) => row.map((cell) => (cell === null ? null : (value ? 1 : 0))));
}

function countLights(state) {
  let total = 0;
  for (const grid of state.grids) {
    for (const cell of grid.flat()) if (cell === 1) total += 1;
  }
  return total;
}

function power(state) {
  return countLights(state) * LIGHT_DRAW + sliderDraw(state);
}

function loadRatio(state) {
  return power(state) / tripThreshold();
}

function isFullyOn(state) {
  return !state.cut && power(state) >= tripThreshold();
}

function breakerTrips(state) {
  return isFullyOn(state);
}

function gaugeLevel(state) {
  const full = (grid) => Boolean(grid) && grid.every((row) => row.every((cell) => cell === null || cell === 1));
  const grid = (id) => state.grids[ROOMS.findIndex((room) => room.id === id)];
  let level = 0;
  if (full(grid("first"))) level += 1;
  if (full(grid("second"))) level += 1;
  if (clampSlider(state.brightness) >= 100) level += 1;
  if (clampSlider(state.volume) >= 100) level += 1;
  return level;
}

function lightRatio(state) {
  return countLights(state) / maxLights();
}

function isStrained(state) {
  if (state.cut || breakerTrips(state)) return false;
  return countLights(state) === maxLights();
}

function formatAmps(amount) {
  const shown = Math.floor((amount / tripThreshold()) * BREAKER_AMPS * 10) / 10;
  return shown.toFixed(1);
}

function veilColor(brightness) {
  const value = clampSlider(brightness);
  const neutral = DEFAULT_BRIGHTNESS;
  if (value <= neutral) {
    const t = (neutral - value) / neutral;
    return `rgba(0, 0, 0, ${(0.68 * t).toFixed(3)})`;
  }
  const t = (value - neutral) / (100 - neutral);
  return `rgba(255, 246, 230, ${(0.62 * t).toFixed(3)})`;
}

function sanitize(data) {
  if (!data || typeof data !== "object") return null;
  const phases = new Set(["play", "tripping", "dark", "ended"]);
  if (!phases.has(data.phase)) return null;
  if (!Array.isArray(data.cleared) || data.cleared.length !== ROOMS.length) return null;
  if (!Array.isArray(data.grids) || data.grids.length !== ROOMS.length) return null;

  const state = createState();
  state.phase = data.phase === "tripping" ? "dark" : data.phase;
  state.cut = Boolean(data.cut) || state.phase === "dark" || state.phase === "ended";
  state.brightness = clampSlider(data.brightness);
  state.volume = clampSlider(data.volume);
  state.cleared = ROOMS.map((_, index) => Boolean(data.cleared[index]));
  state.room = Number.isInteger(data.room) && data.room >= 0 && data.room < ROOMS.length ? data.room : 0;
  for (let index = 0; index < state.room; index += 1) {
    if (!state.cleared[index]) {
      state.room = index;
      break;
    }
  }

  for (let i = 0; i < ROOMS.length; i += 1) {
    const source = data.grids[i];
    const initial = ROOMS[i].initial;
    if (!Array.isArray(source) || source.length !== initial.length) return null;
    const grid = [];
    for (let r = 0; r < initial.length; r += 1) {
      if (!Array.isArray(source[r]) || source[r].length !== initial[r].length) return null;
      grid.push(initial[r].map((cell, c) => (cell === null ? null : (source[r][c] ? 1 : 0))));
    }
    state.grids[i] = grid;
  }

  state.undo = readUndo(data.undo);
  if (state.cut && state.phase === "play") state.phase = "dark";
  return state;
}

function readUndo(undo) {
  if (!undo || !Number.isInteger(undo.room) || undo.room < 0 || undo.room >= ROOMS.length) return null;
  const initial = ROOMS[undo.room].initial;
  const source = undo.grid;
  if (!Array.isArray(source) || source.length !== initial.length) return null;
  const grid = [];
  for (let r = 0; r < initial.length; r += 1) {
    if (!Array.isArray(source[r]) || source[r].length !== initial[r].length) return null;
    grid.push(initial[r].map((cell, c) => (cell === null ? null : (source[r][c] ? 1 : 0))));
  }
  return { room: undo.room, grid };
}

globalThis.LightsOut = {
  LIGHT_DRAW,
  BREAKER_AMPS,
  RED_RATIO,
  STRAIN_RATIO,
  DEFAULT_BRIGHTNESS,
  DEFAULT_VOLUME,
  sliderDraw,
  ROOMS,
  createState,
  cellsOf,
  maxLights,
  tripThreshold,
  clampSlider,
  press,
  isAllOff,
  setAll,
  countLights,
  power,
  loadRatio,
  lightRatio,
  isFullyOn,
  gaugeLevel,
  breakerTrips,
  isStrained,
  formatAmps,
  veilColor,
  sanitize,
};
