(() => {
const {
  LIGHT_DRAW,
  ROOMS,
  breakerTrips,
  cellsOf,
  createState,
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
  veilColor,
} = globalThis.LightsOut;

const KEY = "lightsout-c2-v1";
const PRAISED = "lightsout-c2-praised";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TRIP_MS = reduceMotion ? 160 : 780;

const scene = {
  board: document.querySelector("#board"),
  rooms: document.querySelectorAll(".rooms button"),
  rule: document.querySelector("#rule"),
  resetRoom: document.querySelector("#reset-room"),
  undo: document.querySelector("#undo"),
  clear: document.querySelector("#clear-btn"),
  settings: document.querySelector("#settings"),
  settingsOpen: document.querySelector("#settings-open"),
  brightness: document.querySelector("#brightness"),
  volume: document.querySelector("#volume"),
  brightnessVal: document.querySelector("#brightness-val"),
  volumeVal: document.querySelector("#volume-val"),
  veil: document.querySelector("#veil"),
  scene: document.querySelector("#scene"),
  enter: document.querySelector("#enter"),
  continue: document.querySelector("#continue"),
  discard: document.querySelector("#discard"),
  endingReset: document.querySelector("#ending-reset"),
  endingThankedReset: document.querySelector("#ending-thanked-reset"),
  endingLine: document.querySelector("#ending-line"),
  endingEye: document.querySelector("#ending .ending-eye"),
  debugAllOn: document.querySelector("#debug-all-on"),
  kanaEcho: document.querySelector("#kana-echo"),
  endingTitle: document.querySelector("#ending-title"),
  cameraNotes: document.querySelectorAll(".camera-note"),
  cameraRetries: document.querySelectorAll(".camera-retry"),
  cameraReading: document.querySelector("#camera-reading"),
};

const DEBUG = new URLSearchParams(location.search).get("DEBUG")?.toUpperCase() === "TRUE";

let state = createState();
let resume = load();
let armed = false;
let tripTimer = 0;
let lastRoom = -1;
let slideToken = 0;
let swallowClick = false;
let praised = false;
let returnVisit = false;
let thanked = false;
let darkFromStart = false;

const audio = createAudio();
const camera = createCamera();

scene.board.addEventListener("click", (event) => {
  if (document.body.classList.contains("is-screen-sliding")) return;
  const sealed = event.target.closest(".switch-case");
  if (sealed) {
    const cap = sealed.querySelector(".glass-cap");
    if (cap) {
      cap.classList.remove("is-tapped");
      void cap.offsetWidth;
      cap.classList.add("is-tapped");
    }
    audio.glass();
    return;
  }
  const glass = event.target.closest(".glass");
  if (glass) {
    glass.classList.remove("is-tapped");
    void glass.offsetWidth;
    glass.classList.add("is-tapped");
    audio.glass();
    return;
  }
  const cell = event.target.closest("[data-i]");
  if (!cell || state.phase !== "play" || state.cut) return;
  const room = ROOMS[state.room];
  const spot = cellsOf(room)[Number(cell.dataset.i)];
  if (!spot || spot.quiet) {
    if (!spot?.quiet) return;
    const cap = cell.querySelector(".glass-cap");
    if (cap) {
      cap.classList.remove("is-tapped");
      void cap.offsetWidth;
      cap.classList.add("is-tapped");
    }
    audio.glass();
    return;
  }
  rememberMove();
  state.grids[state.room] = press(state.grids[state.room], spot.row, spot.col, "linked", room);
  audio.click();
  commit();
  if (room.kana) showKana(room.kana[Number(cell.dataset.i)]);
});

function showKana(char) {
  const echo = scene.kanaEcho;
  echo.textContent = char ?? "";
  echo.dataset.room = String(state.room);
  echo.classList.remove("is-shown");
  void echo.offsetWidth;
  echo.classList.add("is-shown");
}

scene.board.addEventListener("pointermove", (event) => {
  const glass = event.target.closest(".glass, .cell.is-quiet, .switch-case");
  if (!glass) return;
  const face = glass.querySelector(".glass-cap") || glass;
  const rect = face.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  face.style.setProperty("--mx", `${x}%`);
  face.style.setProperty("--my", `${y}%`);
});

scene.rooms.forEach((button) => {
  button.addEventListener("click", () => {
    if (state.phase !== "play" || state.cut) return;
    const room = Number(button.dataset.room);
    const locked = room > 0 && !state.cleared[room - 1];
    if (locked) {
      button.classList.remove("is-deny");
      void button.offsetWidth;
      button.classList.add("is-deny");
      return;
    }
    state.room = room;
    audio.sync(state);
    save();
    render();
  });
});

scene.undo.addEventListener("click", undoMove);

scene.clear.addEventListener("click", () => {
  if (state.phase === "ended") {
    if (returnVisit) {
      if (thanked) return;
      thanked = true;
      audio.confirm();
      render();
      return;
    }
    return;
  }
  if (state.phase === "dark") {
    state.phase = "ended";
    state.cleared[ROOMS.length - 1] = true;
    resetEnding();
    praised = true;
    markPraised(true);
    audio.confirm();
    if (camera.isDark()) {
      enterAfterDark(true);
      return;
    }
    save();
    render();
    watchForDark();
    return;
  }
  if (state.phase !== "play" || state.room >= ROOMS.length - 1) return;
  if (!isAllOff(state.grids[state.room])) return;
  state.cleared[state.room] = true;
  audio.confirm();
  if (state.room < ROOMS.length - 1) state.room += 1;
  commit();
});

scene.clear.addEventListener("pointerenter", (event) => {
  if (state.phase !== "dark") return;
  if (event.pointerType === "touch" && navigator.vibrate) navigator.vibrate(10);
});

scene.settingsOpen.addEventListener("click", () => {
  scene.settings.hidden = !scene.settings.hidden;
  if (!scene.settings.hidden) scene.brightness.focus();
});

scene.brightness.addEventListener("input", () => {
  state.brightness = Number(scene.brightness.value);
  commit();
});

scene.volume.addEventListener("input", () => {
  state.volume = Number(scene.volume.value);
  commit();
});

scene.resetRoom.addEventListener("click", () => {
  if (state.phase !== "play" || state.cut) return;
  rememberMove();
  if (state.cleared[state.room]) {
    state.grids[state.room] = setAll(state.grids[state.room], 0);
  } else {
    state.grids[state.room] = ROOMS[state.room].initial.map((row) => row.slice());
  }
  audio.click();
  commit();
});

scene.debugAllOn.hidden = !DEBUG;
scene.debugAllOn.addEventListener("click", () => {
  if (state.phase !== "play" || state.cut) return;
  state.grids = state.grids.map((grid) => setAll(grid, 1));
  state.undo = null;
  audio.click();
  commit();
});

scene.endingReset.addEventListener("click", hardReset);
scene.endingThankedReset.addEventListener("click", hardReset);
scene.discard.addEventListener("click", () => {
  localStorage.removeItem(KEY);
  markPraised(false);
  resume = null;
  renderTitle();
});

scene.enter.addEventListener("click", () => enterWithCamera(false));
scene.continue.addEventListener("click", () => enterWithCamera(true));

let enterFromSave = false;

async function enterWithCamera(fromSave) {
  enterFromSave = fromSave;
  audio.start();
  setCameraButtonsDisabled(true);
  const allowed = await camera.open();
  setCameraButtonsDisabled(false);
  if (!allowed) {
    await showCameraNote(true);
    return;
  }
  showCameraNote(false);
  begin(fromSave);
}

function setCameraButtonsDisabled(on) {
  scene.enter.disabled = on;
  scene.continue.disabled = on;
  scene.cameraRetries.forEach((button) => { button.disabled = on; });
}

scene.cameraRetries.forEach((button) => {
  button.addEventListener("click", () => {
    if (state.phase === "title") enterWithCamera(enterFromSave);
    else watchForDark();
  });
});

async function showCameraNote(on) {
  const blocked = on && (await camera.isBlocked());
  scene.cameraNotes.forEach((note) => {
    note.hidden = !on;
    note.querySelector(".camera-blocked").hidden = !blocked;
  });
}

function watchForDark() {
  showCameraNote(false);
  camera.watch(enterAfterDark, () => showCameraNote(true));
}

if (DEBUG) {
  window.setInterval(() => {
    const sample = camera.sample();
    scene.cameraReading.hidden = false;
    if (!sample) {
      scene.cameraReading.textContent = "カメラ: 停止中";
      return;
    }
    const { mean, spread, dark } = sample;
    const { PITCH_BLACK, DIM, FLAT } = camera.limits;
    scene.cameraReading.classList.toggle("is-dark", dark);
    scene.cameraReading.textContent = [
      `明るさ ${mean.toFixed(0)} / ばらつき ${spread.toFixed(0)}`,
      `判定: ${dark ? "暗い（クリア対象）" : "明るい"}`,
      `暗い条件: 明るさ<${PITCH_BLACK} または 明るさ<${DIM}かつばらつき<${FLAT}`,
    ].join("\n");
  }, 250);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") scene.settings.hidden = true;
});

document.addEventListener("pointerdown", (event) => {
  if (scene.settings.hidden) return;
  if (event.target.closest("#settings") || event.target.closest("#settings-open")) return;
  scene.settings.hidden = true;
  swallowClick = true;
});

document.addEventListener("click", (event) => {
  if (!swallowClick) return;
  swallowClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);

mountEndingEye();
renderTitle();
if (wasReload() && resume?.phase === "ended" && isPraisedMarked()) restorePraised();

function begin(fromSave) {
  clearTimeout(tripTimer);
  const wasPraised = fromSave && resume?.phase === "ended";
  if (fromSave && resume) {
    state = resume;
  } else {
    state = createState();
    state.phase = "play";
    markPraised(false);
  }
  if (state.phase === "title") state.phase = "play";
  scene.settings.hidden = true;
  audio.start();
  armed = false;
  lastRoom = -1;
  resetEnding();
  if (wasPraised) praised = true;
  if (!state.cut && breakerTrips(state)) {
    cutPower();
    return;
  }
  audio.sync(state);
  save();
  render();
  armed = true;
  if (wasPraised) watchForDark();
}

function restorePraised() {
  state = resume;
  scene.settings.hidden = true;
  lastRoom = -1;
  resetEnding();
  praised = true;
  render();
  armed = true;
  watchForDark();
}

function hardReset() {
  clearTimeout(tripTimer);
  camera.stopWatch();
  showCameraNote(false);
  localStorage.removeItem(KEY);
  markPraised(false);
  resume = null;
  state = createState();
  scene.settings.hidden = true;
  audio.sync(state);
  armed = false;
  lastRoom = -1;
  resetEnding();
  render();
}

function mountEndingEye() {
  scene.endingEye.innerHTML = document.querySelector("#title .eye").innerHTML;
}

function resetEnding() {
  praised = false;
  thanked = false;
  returnVisit = false;
  darkFromStart = false;
  scene.endingLine.hidden = true;
  scene.endingLine.textContent = "";
}

function rememberMove() {
  state.undo = {
    room: state.room,
    grid: state.grids[state.room].map((row) => row.slice()),
  };
}

function undoMove() {
  const snap = state.undo;
  if (!snap || state.phase === "title" || state.phase === "ended") return;
  state.grids[snap.room] = snap.grid.map((row) => row.slice());
  state.undo = null;
  state.room = snap.room;
  clearTimeout(tripTimer);
  state.cut = false;
  if (state.phase === "dark" || state.phase === "tripping") state.phase = "play";
  audio.click();
  commit();
}

function commit() {
  if (!state.cut && state.phase === "play" && breakerTrips(state)) {
    cutPower();
    return;
  }
  audio.sync(state);
  save();
  render();
}

function cutPower() {
  state.cut = true;
  state.phase = "tripping";
  scene.settings.hidden = true;
  audio.cut(state.volume);
  save();
  render();
  clearTimeout(tripTimer);
  tripTimer = window.setTimeout(() => {
    state.phase = "dark";
    audio.silence();
    save();
    render();
  }, TRIP_MS);
}

function render() {
  document.body.className = `phase-${state.phase}${isStrained(state) ? " strain" : ""}${returnVisit ? " return-visit" : ""}`;
  if (state.phase === "title") {
    renderTitle();
    return;
  }
  renderTitle();
  paintBoard();
  paintChrome();
  scene.endingEye.hidden = !praised || returnVisit;
  const line = returnVisit
    ? (thanked
      ? "お疲れさまでした。"
      : (darkFromStart ? "あなたの部屋…暗くて落ち着きますね。" : "暗くしてくれたんですね。ありがとう。"))
    : (praised ? "まだまぶしい…" : "");
  if (scene.endingLine.textContent !== line) scene.endingLine.textContent = line;
  scene.endingLine.hidden = line === "";
  scene.endingThankedReset.hidden = !(returnVisit && thanked);
  scene.endingReset.hidden = praised || returnVisit;
  const title = returnVisit ? "消灯成功" : "";
  if (scene.endingTitle.textContent !== title) scene.endingTitle.textContent = title;
  scene.endingTitle.hidden = title === "";
  if (state.phase !== "play" || scene.kanaEcho.dataset.room !== String(state.room)) {
    scene.kanaEcho.textContent = "";
    scene.kanaEcho.classList.remove("is-shown");
    delete scene.kanaEcho.dataset.room;
  }
  scene.veil.style.background = state.phase === "play" || state.phase === "tripping"
    ? veilColor(state.brightness)
    : "transparent";
}

function renderTitle() {
  const hasResume = Boolean(resume);
  scene.enter.hidden = hasResume;
  scene.continue.hidden = !hasResume;
  scene.discard.hidden = !hasResume;
}

function paintBoard() {
  const room = ROOMS[state.room];
  const signature = boardSignature();
  if (scene.board.dataset.signature !== signature) {
    const from = lastRoom;
    const pane = buildRoomPane(state.room);
    const direction = from >= 0 && from !== state.room ? Math.sign(state.room - from) : 0;
    scene.board.dataset.signature = signature;
    scene.board.dataset.room = String(state.room);
    lastRoom = state.room;
    if (direction && !reduceMotion) slideRooms(pane, from, direction);
    else settleBoard(pane);
  } else {
    const spots = cellsOf(room);
    const live = scene.board.querySelector(`.board-pane[data-room="${state.room}"]`) || scene.board;
    live.querySelectorAll("[data-i]").forEach((button) => {
      const spot = spots[Number(button.dataset.i)];
      const on = state.grids[state.room][spot.row][spot.col] === 1;
      if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", on ? "true" : "false");
      button.querySelector(".bulb").classList.toggle("on", on);
    });
    paintLeak(live, room, state.grids[state.room]);
  }

  if (!document.body.classList.contains("is-screen-sliding")) placeSwitch();
  paintSealedSwitch();

  const roomReady = state.phase === "play"
    && state.room < ROOMS.length - 1
    && !state.cleared[state.room]
    && isAllOff(state.grids[state.room]);
  const visitReady = returnVisit && !thanked;
  const ready = roomReady || visitReady;
  if (armed && roomReady && !scene.clear.classList.contains("ready")) audio.chime();
  scene.clear.classList.toggle("ready", ready);
  scene.clear.tabIndex = ready ? 0 : -1;
}

function paintChrome() {
  scene.rooms.forEach((button) => {
    const room = Number(button.dataset.room);
    const locked = room > 0 && !state.cleared[room - 1];
    button.classList.toggle("is-locked", locked);
    button.setAttribute("aria-disabled", locked ? "true" : "false");
    button.setAttribute("aria-current", room === state.room ? "true" : "false");
    button.setAttribute("aria-label", locked ? `${ROOMS[room].name}、施錠` : ROOMS[room].name);
  });

  scene.rule.textContent = ruleText();
  scene.undo.disabled = !state.undo;
  scene.resetRoom.hidden = state.phase !== "play";

  const ratio = Math.min(1, loadRatio(state));
  document.body.style.setProperty("--load", ratio.toFixed(3));

  scene.brightness.value = String(state.brightness);
  scene.volume.value = String(state.volume);
  scene.brightnessVal.textContent = String(state.brightness);
  scene.volumeVal.textContent = String(state.volume);
  scene.brightnessVal.classList.toggle("is-max", state.brightness === 100);
  scene.volumeVal.classList.toggle("is-max", state.volume === 100);
  scene.brightness.closest(".slider-line").style.setProperty("--p", `${state.brightness}%`);
  scene.volume.closest(".slider-line").style.setProperty("--p", `${state.volume}%`);
  scene.board.querySelector(".breaker-art")?.classList.toggle("live", !state.cut && power(state) > 0);
  const level = gaugeLevel(state);
  scene.board.querySelectorAll(".gauge .seg").forEach((seg, index) => {
    seg.classList.toggle("is-lit", index < level);
  });
}

function ruleText() {
  return "";
}

function boardSignature() {
  return String(state.room);
}

function switchPlate() {
  const plate = span("switch-plate");
  const onLabel = span("toggle-word on");
  onLabel.textContent = "ON";
  const offLabel = span("toggle-word off");
  offLabel.textContent = "OFF";
  const well = span("switch-well");
  well.append(span("switch-lever"));
  plate.append(span("switch-screw"), onLabel, well, offLabel, span("switch-screw"));
  return plate;
}

function boltMark() {
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  mark.setAttribute("class", "bolt");
  mark.setAttribute("viewBox", "0 0 16 24");
  mark.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M9.2 0 L3 13.2 H7.6 L5.4 24 L14.2 9.4 H9.2 Z");
  mark.append(path);
  return mark;
}

function sealedSwitch() {
  const wrap = div("switch-case");
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "ガラスの中のスイッチ");
  const toggle = div("toggle");
  const tripped = state.cut || breakerTrips(state);
  toggle.setAttribute("aria-pressed", tripped ? "false" : "true");
  toggle.setAttribute("aria-hidden", "true");
  const plate = switchPlate();
  plate.append(boltMark());
  toggle.append(plate);
  const cap = div("glass-cap switch-glass");
  cap.append(span("sheen"));
  wrap.append(toggle, cap);
  return wrap;
}

function buildRoomPane(roomIndex) {
  const room = ROOMS[roomIndex];
  const pane = div("board-pane");
  pane.dataset.room = String(roomIndex);
  pane.append(div("nameplate", room.plate));
  const spots = cellsOf(room);
  const stage = div("board-stage");
  const gridAt = (spot, index) => {
    const node = cell(spot, index, state.grids[roomIndex][spot.row][spot.col]);
    node.style.gridColumn = String(spot.col + 1);
    node.style.gridRow = String(spot.row + 1);
    return node;
  };
  if (room.id === "last") {
    const grid = div("grid");
    grid.style.setProperty("--cols", String(room.initial[0].length));
    spots.forEach((spot, index) => grid.append(gridAt(spot, index)));
    stage.append(grid, sealedSwitch());
  } else if (room.front) {
    const grid = div("grid");
    grid.style.setProperty("--cols", "3");
    const [behindRow, behindCol] = room.front.behind;
    spots.forEach((spot, index) => {
      const node = gridAt(spot, index);
      if (spot.front) {
        node.classList.add("is-front");
        node.style.gridColumn = String(behindCol + 1);
        node.style.gridRow = String(behindRow + 1);
        node.setAttribute("aria-label", `${behindRow + 1}行${behindCol + 1}列`);
        node.prepend(span("leak"));
      }
      grid.append(node);
    });
    paintLeak(grid, room, state.grids[roomIndex]);
    stage.append(grid);
  } else if (room.labels) {
    const row = div("kana-row");
    spots.forEach((spot, index) => {
      row.append(cell(spot, index, state.grids[roomIndex][spot.row][spot.col]));
    });
    stage.append(row);
  } else {
    const grid = div("grid");
    grid.style.setProperty("--cols", String(room.initial[0].length));
    spots.forEach((spot, index) => grid.append(gridAt(spot, index)));
    stage.append(grid);
  }
  pane.append(stage);
  return pane;
}

function settleBoard(pane) {
  slideToken += 1;
  restoreScreen();
  document.querySelectorAll("body > .switch-case").forEach((node) => node.remove());
  scene.board.replaceChildren(pane);
}

let screenStage = null;

function restoreScreen() {
  if (!document.body.classList.contains("is-screen-sliding")) return;
  document.body.classList.remove("is-screen-sliding");
  scene.veil.style.visibility = "";
  const undo = document.querySelector("#undo");
  if (scene.scene.parentElement !== document.body) document.body.insertBefore(scene.scene, undo);
  screenStage?.remove();
  screenStage = null;
}

function stickSwitch(board, atDock) {
  const sealed = board.querySelector(".switch-case");
  if (!sealed) return;
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  if (narrow) {
    sealed.style.position = "relative";
    sealed.style.left = "auto";
    sealed.style.top = "auto";
    sealed.style.margin = "16px auto 4px";
    sealed.style.width = "fit-content";
    sealed.style.transform = "";
    sealed.style.zIndex = "";
    return;
  }
  const boardBox = board.getBoundingClientRect();
  const width = sealed.offsetWidth;
  const height = sealed.offsetHeight;
  const seen = sealed.getBoundingClientRect();
  let edge = atDock ? boardBox.right + 28 : seen.left;
  let top = atDock ? boardBox.bottom - height : seen.top;
  if (atDock && edge + width > window.innerWidth - 12) edge = window.innerWidth - width - 12;
  sealed.style.position = "absolute";
  sealed.style.margin = "0";
  sealed.style.width = "auto";
  sealed.style.transform = "";
  sealed.style.zIndex = "4";
  sealed.style.left = `${Math.round(edge - boardBox.left - board.clientLeft)}px`;
  sealed.style.top = `${Math.round(top - boardBox.top - board.clientTop)}px`;
}

function screenPage(content) {
  const page = div("screen-page");
  page.append(content);
  const shade = div("screen-shade");
  shade.style.background = scene.veil.style.background;
  page.append(shade);
  return page;
}

function slideRooms(pane, from, direction) {
  const token = ++slideToken;
  restoreScreen();
  stickSwitch(scene.board, false);
  const copy = scene.scene.cloneNode(true);
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  copy.inert = true;
  scene.board.replaceChildren(pane);
  stickSwitch(scene.board, true);

  const track = div("screen-track");
  track.classList.add(direction > 0 ? "to-next" : "to-prev");
  const outgoing = screenPage(copy);
  const incoming = screenPage(scene.scene);
  if (direction > 0) track.append(outgoing, incoming);
  else track.append(incoming, outgoing);

  screenStage = div("screen-slide");
  screenStage.append(track);
  const undo = document.querySelector("#undo");
  document.body.insertBefore(screenStage, undo);
  document.body.classList.add("is-screen-sliding");
  scene.veil.style.visibility = "hidden";

  const finish = () => {
    if (token !== slideToken) return;
    slideToken += 1;
    restoreScreen();
    placeSwitch();
  };
  track.addEventListener("animationend", (event) => {
    if (event.target === track) finish();
  });
  window.setTimeout(finish, 580);
}

function placeSwitch() {
  if (document.body.classList.contains("is-screen-sliding")) return;
  const sealed = scene.board.querySelector(".switch-case");
  if (!sealed) return;
  sealed.style.zIndex = "";
  const board = scene.board.getBoundingClientRect();
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  if (narrow) {
    sealed.style.position = "relative";
    sealed.style.left = "auto";
    sealed.style.top = "auto";
    sealed.style.margin = "16px auto 4px";
    sealed.style.width = "fit-content";
    return;
  }
  sealed.style.position = "fixed";
  sealed.style.margin = "0";
  sealed.style.width = "auto";
  const width = sealed.offsetWidth;
  const height = sealed.offsetHeight;
  let edge = board.right + 28;
  if (edge + width > window.innerWidth - 12) edge = window.innerWidth - width - 12;
  sealed.style.left = `${Math.round(edge)}px`;
  sealed.style.top = `${Math.round(board.bottom - height)}px`;
}

let switchFrame = 0;
function scheduleSwitch() {
  if (switchFrame) return;
  switchFrame = requestAnimationFrame(() => {
    switchFrame = 0;
    placeSwitch();
  });
}

window.addEventListener("resize", scheduleSwitch);
window.addEventListener("scroll", scheduleSwitch, { passive: true });
window.visualViewport?.addEventListener("resize", scheduleSwitch);
window.visualViewport?.addEventListener("scroll", scheduleSwitch);
document.fonts?.ready?.then(() => placeSwitch());

function paintSealedSwitch() {
  const toggle = scene.board.querySelector(".switch-case .toggle");
  if (!toggle) return;
  const off = state.cut || breakerTrips(state);
  toggle.setAttribute("aria-pressed", off ? "false" : "true");
}

function paintLeak(root, room, grid) {
  if (!room.front) return;
  const [r, c] = room.front.behind;
  root.querySelector(".leak")?.classList.toggle("on", grid[r][c] === 1);
}

function cell(spot, index, on) {
  const button = document.createElement(spot.quiet ? "div" : "button");
  if (!spot.quiet) button.type = "button";
  button.className = spot.quiet ? "cell is-quiet" : "cell";
  button.dataset.i = String(index);
  if (!spot.quiet) button.setAttribute("aria-pressed", on ? "true" : "false");
  button.setAttribute("aria-label", spot.label || (spot.label === "" ? "灯" : `${spot.row + 1}行${spot.col + 1}列`));
  const bulb = document.createElement("span");
  bulb.className = on ? "bulb on" : "bulb";
  bulb.setAttribute("aria-hidden", "true");
  if (spot.label) {
    const label = document.createElement("span");
    label.className = "kana";
    label.textContent = spot.label;
    button.append(label);
  }
  button.append(bulb, span("socket"));
  if (spot.quiet) {
    const cap = div("glass-cap");
    cap.append(span("sheen"));
    button.append(cap);
    button.setAttribute("aria-label", "ガラスの中の灯");
  }
  if (spot.label == null) button.append(span("cord"));
  return button;
}

function vault() {
  const chamber = div("chamber");
  const rear = div("rear");
  const art = div("breaker-art");
  art.setAttribute("aria-hidden", "true");
  const housing = div("glass breaker-glass");
  const box = span("breaker-box");
  const mark = span("mark");
  mark.textContent = "電力";
  const on = span("pos on");
  on.textContent = "入";
  const off = span("pos off");
  off.textContent = "切";
  const gauge = span("gauge");
  for (let i = 0; i < 4; i += 1) gauge.append(span("seg"));
  box.append(mark, gauge, span("jaw"), on, span("arc"), span("lever"), span("pivot"), off);
  const housingFace = div("glass-face");
  housingFace.append(span("sheen"));
  housing.append(box, span("pedestal"), housingFace);
  art.append(housing);
  rear.append(art, span("drop-lead"));

  const wrap = div("vault");
  const glass = div("glass");
  glass.setAttribute("role", "img");
  glass.setAttribute("aria-label", "封入灯 No.03。高圧ガラス。接触禁止。");
  const bulb = document.createElement("span");
  bulb.className = "bulb on sealed";
  bulb.setAttribute("aria-hidden", "true");
  const face = div("glass-face");
  face.append(span("sheen"));
  const lead = span("cord");
  lead.classList.add("live", "sealed-lead");
  glass.append(bulb, lead, div("pedestal"), face);
  const label = document.createElement("p");
  label.className = "vault-label";
  label.textContent = "封入灯 No.03\n高圧ガラス\n接触禁止";
  wrap.append(glass, harness(), label);
  chamber.append(rear, wrap);
  return chamber;
}

function harness() {
  const node = div("harness");
  node.setAttribute("aria-hidden", "true");
  node.append(span("bus"), span("grommet"));
  return node;
}

function div(className, text) {
  const node = document.createElement("div");
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function span(className) {
  const node = document.createElement("span");
  node.className = className;
  return node;
}

function save() {
  if (state.phase === "title") return;
  const payload = JSON.stringify(state);
  try {
    localStorage.setItem(KEY, payload);
  } catch {
    // Opening the file directly can block storage. Play still continues.
  }
  resume = sanitize(JSON.parse(payload));
}

function wasReload() {
  const nav = performance.getEntriesByType("navigation")[0];
  if (nav?.type === "reload") return true;
  return performance.navigation?.type === 1;
}

function markPraised(on) {
  try {
    if (on) localStorage.setItem(PRAISED, "1");
    else localStorage.removeItem(PRAISED);
  } catch {
    // Storage can be blocked. A reload then starts from the title.
  }
}

function isPraisedMarked() {
  try {
    return localStorage.getItem(PRAISED) === "1";
  } catch {
    return false;
  }
}

function enterAfterDark(atOnce = false) {
  if (state.phase !== "ended" || !praised || returnVisit) return;
  darkFromStart = atOnce;
  camera.close();
  state = createState();
  state.phase = "ended";
  state.cut = true;
  state.cleared = ROOMS.map(() => true);
  praised = false;
  thanked = false;
  returnVisit = true;
  markPraised(false);
  scene.settings.hidden = true;
  save();
  render();
}

function createCamera() {
  // A finger over the lens is not pure black: auto exposure turns it into a dim, flat red.
  // So "dark" is either very dim, or dim and nearly uniform.
  const PITCH_BLACK = 24;
  const DIM = 60;
  const FLAT = 22;
  const WARMUP_MS = 1000;
  const HOLD_MS = 800;
  let stream = null;
  let video = null;
  let opening = null;
  let timer = 0;
  let token = 0;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function live() {
    return Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  // Kept open once granted, so the browser only asks once per page.
  function open() {
    if (live()) return Promise.resolve(true);
    if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve(false);
    opening ??= navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((next) => {
        stream = next;
        video?.remove();
        video = document.createElement("video");
        video.className = "camera-feed";
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("aria-hidden", "true");
        video.srcObject = stream;
        document.body.append(video);
        video.play().catch(() => {});
        return true;
      })
      .catch(() => false)
      .finally(() => { opening = null; });
    return opening;
  }

  function measure() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const count = data.length / 4;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += y;
      sumSq += y * y;
    }
    const mean = sum / count;
    const spread = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
    return { mean, spread, dark: mean < PITCH_BLACK || (mean < DIM && spread < FLAT) };
  }

  function sample() {
    if (!live() || !video || video.readyState < 2) return null;
    return measure();
  }

  function isDark() {
    return Boolean(sample()?.dark);
  }

  async function isBlocked() {
    try {
      const status = await navigator.permissions?.query({ name: "camera" });
      return status?.state === "denied";
    } catch {
      return false;
    }
  }

  function stopWatch() {
    token += 1;
    clearInterval(timer);
    timer = 0;
  }

  async function watch(onDark, onFail) {
    stopWatch();
    const mine = token;
    const ok = await open();
    if (mine !== token) return;
    if (!ok) { onFail(); return; }
    const startedAt = performance.now();
    let darkSince = 0;
    timer = window.setInterval(() => {
      if (!live()) { stopWatch(); onFail(); return; }
      if (!video || video.readyState < 2) return;
      const now = performance.now();
      if (now - startedAt < WARMUP_MS || !measure().dark) {
        darkSince = 0;
        return;
      }
      if (!darkSince) darkSince = now;
      if (now - darkSince >= HOLD_MS) {
        stopWatch();
        onDark();
      }
    }, 120);
  }

  function close() {
    stopWatch();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video?.remove();
    video = null;
  }

  return { open, watch, sample, isDark, isBlocked, stopWatch, close, limits: { PITCH_BLACK, DIM, FLAT } };
}

function load() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return null;
  }
}

function createAudio() {
  let ctx;
  let master;
  let hum;
  let buzz;
  let crackleGain;
  let noiseBuffer;
  let impact;
  let started = false;

  function context() {
    if (ctx === null) return null;
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const fundamental = oscillator(60, "sine");
      const overtone = oscillator(120, "triangle");
      hum = ctx.createGain();
      hum.gain.value = 0.2;
      overtone.gain = ctx.createGain();
      overtone.gain.gain.value = 0.08;
      fundamental.connect(hum);
      overtone.connect(overtone.gain).connect(hum);
      hum.connect(master);
      buzz = oscillator(54, "sawtooth");
      buzz.gain = ctx.createGain();
      buzz.gain.gain.value = 0;
      buzz.connect(buzz.gain).connect(ctx.destination);
      noiseBuffer = makeNoise(1.6);
      const crackle = ctx.createBufferSource();
      crackle.buffer = noiseBuffer;
      crackle.loop = true;
      const crackleFilter = ctx.createBiquadFilter();
      crackleFilter.type = "bandpass";
      crackleFilter.frequency.value = 1400;
      crackleFilter.Q.value = 0.6;
      crackleGain = ctx.createGain();
      crackleGain.gain.value = 0;
      crackle.connect(crackleFilter).connect(crackleGain).connect(ctx.destination);
      fundamental.start();
      overtone.start();
      buzz.start();
      crackle.start();
      started = true;
      } catch {
        ctx = null;
        started = false;
        return null;
      }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function makeNoise(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const spike = Math.random() < 0.018 ? Math.random() * 2 - 1 : 0;
      data[i] = spike * (0.35 + Math.random() * 0.65);
    }
    return buffer;
  }

  function oscillator(frequency, type) {
    const node = ctx.createOscillator();
    node.frequency.value = frequency;
    node.type = type;
    return node;
  }

  function tone(frequency, duration, gain, type = "sine") {
    if (!(gain > 0)) return;
    const current = context();
    if (!current) return;
    const osc = current.createOscillator();
    const amp = current.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(gain, current.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, current.currentTime + duration);
    osc.connect(amp).connect(current.destination);
    osc.start();
    osc.stop(current.currentTime + duration + 0.02);
  }

  function burst(gain) {
    if (!(gain > 0) || !noiseBuffer) return;
    const current = context();
    if (!current) return;
    const source = current.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = current.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    const amp = current.createGain();
    amp.gain.setValueAtTime(gain, current.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, current.currentTime + 0.09);
    source.connect(filter).connect(amp).connect(current.destination);
    source.start();
    source.stop(current.currentTime + 0.1);
  }

  return {
    start() {
      context();
    },
    sync(next) {
      if (!started) return;
      const audible = next.phase === "play" && !next.cut;
      const heard = next.volume;
      const masterGain = audible ? heard / 100 : 0;
      const hear = audible ? Math.sqrt(heard / 100) : 0;
      const bulbRatio = Math.min(1, Math.max(0, power(next) - sliderDraw(next)) / (maxLights() * LIGHT_DRAW));
      const presence = Math.sqrt(bulbRatio);
      const ratio = Math.min(1, loadRatio(next));
      const level = masterGain * (0.02 + presence * 0.1);
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(Math.max(0, level), now + 0.06);
      crackleGain.gain.cancelScheduledValues(now);
      crackleGain.gain.linearRampToValueAtTime(hear * presence * (0.08 + ratio * 0.2), now + 0.08);
      buzz.gain.gain.cancelScheduledValues(now);
      buzz.gain.gain.linearRampToValueAtTime(
        isStrained(next) ? hear * 0.12 : hear * presence * ratio * 0.02,
        now + 0.08
      );
    },
    click() {
      const hear = Math.sqrt(state.volume / 100);
      tone(180, 0.03, 0.07 * hear, "square");
      burst(0.16 * hear);
    },
    glass() {
      tone(1680, 0.07, 0.05 * Math.sqrt(state.volume / 100));
    },
    chime() {
      const gain = 0.05 * Math.sqrt(Math.max(state.volume, 1) / 100);
      tone(523, 0.12, gain);
      window.setTimeout(() => tone(784, 0.16, gain * 0.9), 90);
    },
    confirm() {
      tone(180, 0.08, 0.16 * Math.sqrt(Math.max(state.volume, 1) / 100), "triangle");
    },
    touch() {
      tone(920, 0.03, 0.04 * Math.sqrt(Math.max(state.volume, 1) / 100));
    },
    cut(volume) {
      if (!context()) return;
      const now = ctx.currentTime;
      const stop = (param) => {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(0, now + 0.03);
      };
      stop(master.gain);
      stop(crackleGain.gain);
      stop(buzz.gain.gain);
      const length = Math.floor(ctx.sampleRate * 0.45);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        const env = (1 - i / length) ** 2.4;
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 520;
      const amp = ctx.createGain();
      amp.gain.value = 0.55 * Math.max(0.4, volume / 100);
      source.connect(filter).connect(amp).connect(ctx.destination);
      try { impact?.stop(); } catch { /* already finished */ }
      impact = source;
      source.start();
    },
    silence() {
      if (!started) return;
      const now = ctx.currentTime;
      const stop = (param) => {
        param.cancelScheduledValues(now);
        param.setValueAtTime(0, now);
      };
      stop(master.gain);
      stop(crackleGain.gain);
      stop(buzz.gain.gain);
      try { impact?.stop(); } catch { /* already finished */ }
      impact = null;
    },
  };
}
})();
