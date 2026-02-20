import { createGame, setDirection, step } from "./logic.js";

/**
 * Browser runtime for Number Nibbles.
 * Responsibilities:
 * - Bind DOM controls and accessibility toggles.
 * - Drive the render loop and countdown timer.
 * - Orchestrate level selection/unlock UI.
 * - Translate keyboard/touch input into direction updates.
 */

// Primary rendering surface and HUD nodes.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const questionEl = document.getElementById("question");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const pauseBtn = document.getElementById("pause");
const contrastToggle = document.getElementById("contrastToggle");
const textToggle = document.getElementById("textToggle");
const controlButtons = document.querySelectorAll("[data-dir]");
const levelsEl = document.getElementById("levels");
const levelsPanel = document.getElementById("levelsPanel");
const levelsMenuBtn = document.getElementById("levelsMenuBtn");
const levelsBackdrop = document.getElementById("levelsBackdrop");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayScoreEl = document.getElementById("overlayScore");
const overlayCorrectEl = document.getElementById("overlayCorrect");
const overlayTimeEl = document.getElementById("overlayTime");
const overlayUnlockEl = document.getElementById("overlayUnlock");
const overlayRetryBtn = document.getElementById("overlayRetry");
const overlayNextBtn = document.getElementById("overlayNext");

// Game tuning constants.
const GRID_SIZE = 20;
const BASE_TICK_MS = 140;
const LEVEL_COUNT = 10;
const QUESTIONS_PER_LEVEL = 10;
const LEVEL_TIME_LIMIT_MS = 100_000;

// Curriculum and speed profile per level.
const LEVELS = [
  {
    label: "1",
    questionType: "compare",
    minA: 0,
    maxA: 9,
    minB: 0,
    maxB: 9,
    speed: 140,
  },
  { label: "2", ops: ["add"], minA: 0, maxA: 10, minB: 0, maxB: 10, requireBridgeTen: true, speed: 135 },
  { label: "3", ops: ["sub"], minA: 0, maxA: 10, minB: 0, maxB: 10, noNegatives: true, speed: 130 },
  { label: "4", ops: ["add", "sub"], minA: 0, maxA: 10, minB: 0, maxB: 10, noNegatives: true, speed: 125 },
  { label: "5", ops: ["add"], minA: 0, maxA: 20, minB: 0, maxB: 20, requireBridgeTen: true, speed: 120 },
  { label: "6", ops: ["sub"], minA: 0, maxA: 20, minB: 0, maxB: 20, noNegatives: true, requireBridgeTen: true, speed: 115 },
  { label: "7", ops: ["add", "sub"], minA: 0, maxA: 20, minB: 0, maxB: 20, noNegatives: true, speed: 110 },
  { label: "8", ops: ["mul"], allowedA: [2, 5, 10], minB: 1, maxB: 10, speed: 105 },
  { label: "9", ops: ["mul"], allowedA: [3, 4, 6], minB: 1, maxB: 10, speed: 100 },
  { label: "10", ops: ["add", "sub", "mul"], minA: 0, maxA: 12, minB: 0, maxB: 12, noNegatives: true, speed: 95 },
];

// Mutable runtime state owned by the UI layer.
let state = createGame({
  rows: GRID_SIZE,
  cols: GRID_SIZE,
  level: 1,
  config: { ...LEVELS[0], questionCount: QUESTIONS_PER_LEVEL },
});
let running = false;
let paused = false;
let timer = null;
let levelIndex = 0;
let levelStartTime = null;
let elapsedMs = 0;
let accumulatedMs = 0;
let remainingMs = LEVEL_TIME_LIMIT_MS;
let lastTickMs = BASE_TICK_MS;
let lastScore = 0;
let highContrast = false;
let largeText = false;
let touchStartPoint = null;

/**
 * Draws the full board for the current state.
 * The canvas is redrawn per tick rather than incrementally patched.
 */
function draw() {
  const cellSize = canvas.width / state.cols;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ded7cc";
  for (let i = 0; i <= state.cols; i += 1) {
    const pos = i * cellSize;
    ctx.fillRect(pos, 0, 1, canvas.height);
    ctx.fillRect(0, pos, canvas.width, 1);
  }

  ctx.fillStyle = "#2e6f4a";
  state.snake.forEach((segment, index) => {
    ctx.globalAlpha = index === 0 ? 1 : 0.85;
    ctx.fillRect(
      segment.x * cellSize + 1,
      segment.y * cellSize + 1,
      cellSize - 2,
      cellSize - 2
    );
  });
  ctx.globalAlpha = 1;

  state.foods.forEach((food) => {
    ctx.fillStyle = "#c04a2f";
    ctx.fillRect(
      food.x * cellSize + 2,
      food.y * cellSize + 2,
      cellSize - 4,
      cellSize - 4
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.floor(cellSize * 0.5)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      String(food.value),
      food.x * cellSize + cellSize / 2,
      food.y * cellSize + cellSize / 2
    );
  });
}

/**
 * Synchronizes all user-visible HUD labels/buttons from current state.
 */
function updateHUD() {
  scoreEl.textContent = state.score;
  questionEl.textContent = state.question?.text ?? "---";
  timerEl.textContent = formatTime(remainingMs);

  if (!running) {
    statusEl.textContent = "Ready";
  } else if (!state.alive) {
    statusEl.textContent = "Game Over";
  } else if (state.questionIndex >= state.questionCount) {
    statusEl.textContent = "Level Complete";
  } else if (paused) {
    statusEl.textContent = "Paused";
  } else {
    statusEl.textContent = "Running";
  }

  pauseBtn.disabled = !running || !state.alive;
  startBtn.textContent = running ? "Restart" : "Start";
  pauseBtn.textContent = paused ? "Play" : "Pause";

  if (state.score > lastScore) {
    scoreEl.parentElement.classList.remove("pulse");
    void scoreEl.parentElement.offsetWidth;
    scoreEl.parentElement.classList.add("pulse");
  }
  lastScore = state.score;
}

/**
 * Applies visual accessibility modes and keeps toggle labels in sync.
 */
function applyA11y() {
  document.body.classList.toggle("high-contrast", highContrast);
  document.body.classList.toggle("large-text", largeText);
  contrastToggle.setAttribute("aria-pressed", String(highContrast));
  textToggle.setAttribute("aria-pressed", String(largeText));
  contrastToggle.textContent = highContrast ? "Normal Contrast" : "High Contrast";
  textToggle.textContent = largeText ? "Small Text" : "Large Text";
}

/**
 * Restores persisted accessibility preferences.
 */
function loadA11y() {
  highContrast = localStorage.getItem("snake_contrast") === "1";
  largeText = localStorage.getItem("snake_text") === "1";
  applyA11y();
}

function toggleContrast() {
  highContrast = !highContrast;
  localStorage.setItem("snake_contrast", highContrast ? "1" : "0");
  applyA11y();
}

function toggleText() {
  largeText = !largeText;
  localStorage.setItem("snake_text", largeText ? "1" : "0");
  applyA11y();
}

/**
 * Mobile breakpoint shared by menu logic and responsive behavior.
 */
function isMobileViewport() {
  return window.matchMedia("(max-width: 879px)").matches;
}

/**
 * Opens/closes the mobile levels drawer and backdrop.
 */
function setLevelsMenu(open) {
  const show = open && isMobileViewport();
  levelsPanel.classList.toggle("open", show);
  levelsMenuBtn.setAttribute("aria-expanded", String(show));
  levelsBackdrop.hidden = !show;
  levelsBackdrop.classList.toggle("open", show);
}

/**
 * Main loop step:
 * - advance simulation
 * - update countdown
 * - render
 * - handle terminal conditions
 */
function tick() {
  if (!running || paused) return;
  state = step(state);
  elapsedMs = accumulatedMs + (performance.now() - levelStartTime);
  remainingMs = Math.max(0, LEVEL_TIME_LIMIT_MS - elapsedMs);
  draw();
  updateHUD();
  if (remainingMs <= 0) {
    state = { ...state, alive: false };
  }
  if (!state.alive || state.questionIndex >= state.questionCount) {
    stopLoop();
    showOverlay();
  }
}

/**
 * Starts the interval loop.
 * Timer baseline is initialized lazily so paused time is excluded.
 */
function startLoop() {
  if (running) return;
  running = true;
  paused = false;
  if (!levelStartTime) {
    levelStartTime = performance.now();
  }
  timer = window.setInterval(tick, lastTickMs);
  updateHUD();
}

/**
 * Stops the interval loop but preserves state.
 */
function stopLoop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
  updateHUD();
}

/**
 * Reinitializes the currently selected level.
 */
function restart() {
  stopLoop();
  state = createGame({
    rows: GRID_SIZE,
    cols: GRID_SIZE,
    level: levelIndex + 1,
    config: { ...LEVELS[levelIndex], questionCount: QUESTIONS_PER_LEVEL },
  });
  elapsedMs = 0;
  accumulatedMs = 0;
  remainingMs = LEVEL_TIME_LIMIT_MS;
  levelStartTime = null;
  lastScore = 0;
  draw();
  updateHUD();
  hideOverlay();
}

function handleDirection(dir) {
  state = setDirection(state, dir);
}

/**
 * Pause preserves elapsed time by storing accumulated runtime and
 * resetting the active baseline timestamp until resumed.
 */
function togglePause() {
  if (!running || !state.alive) return;
  paused = !paused;
  if (paused) {
    accumulatedMs += performance.now() - levelStartTime;
    levelStartTime = null;
  } else {
    levelStartTime = performance.now();
  }
  updateHUD();
}

/**
 * Level-unlock persistence helpers.
 */
function loadUnlockedLevel() {
  const saved = Number(localStorage.getItem("snake_unlocked")) || 1;
  return Math.min(Math.max(saved, 1), LEVEL_COUNT);
}

function saveUnlockedLevel(level) {
  localStorage.setItem("snake_unlocked", String(level));
}

/**
 * Rebuilds level buttons and applies lock/active states.
 */
function renderLevels() {
  levelsEl.innerHTML = "";
  const unlocked = loadUnlockedLevel();
  LEVELS.forEach((level, index) => {
    const button = document.createElement("button");
    button.textContent = `Level ${level.label}`;
    button.disabled = index + 1 > unlocked;
    if (index === levelIndex) button.classList.add("active");
    button.addEventListener("click", () => selectLevel(index));
    levelsEl.appendChild(button);
  });
}

/**
 * Changes active level and resets level state.
 */
function selectLevel(index) {
  levelIndex = index;
  lastTickMs = LEVELS[levelIndex].speed ?? BASE_TICK_MS;
  restart();
  renderLevels();
  setLevelsMenu(false);
}

/**
 * Shows end-of-run summary and computes unlock progression.
 */
function showOverlay() {
  overlayEl.classList.remove("hidden");
  const completed = state.questionIndex >= state.questionCount && state.alive;
  overlayTitleEl.textContent = completed ? "Level Complete" : "Game Over";
  overlayScoreEl.textContent = state.score;
  overlayCorrectEl.textContent = state.questionIndex;
  overlayTimeEl.textContent = formatTime(remainingMs);
  const unlocked = loadUnlockedLevel();
  const canUnlockNext =
    completed && remainingMs > 0 && unlocked === levelIndex + 1;

  if (canUnlockNext && levelIndex + 1 < LEVEL_COUNT) {
    saveUnlockedLevel(levelIndex + 2);
  }

  const updatedUnlocked = loadUnlockedLevel();
  const nextAvailable = levelIndex + 2 <= updatedUnlocked;
  overlayNextBtn.disabled = !nextAvailable || levelIndex + 1 >= LEVEL_COUNT;

  if (completed && remainingMs > 0) {
    overlayUnlockEl.textContent = "Next level unlocked!";
  } else if (completed) {
    overlayUnlockEl.textContent = "Finish before time runs out to unlock next level.";
  } else {
    overlayUnlockEl.textContent = "Try again to unlock next level.";
  }
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

/**
 * Formats milliseconds as m:ss for HUD and overlay.
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Keyboard controls: arrows/WASD for movement, Space for pause.
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }
  if (key === "arrowup" || key === "w") handleDirection("up");
  if (key === "arrowdown" || key === "s") handleDirection("down");
  if (key === "arrowleft" || key === "a") handleDirection("left");
  if (key === "arrowright" || key === "d") handleDirection("right");
  if (key === " ") togglePause();
});

startBtn.addEventListener("click", () => {
  if (running || !state.alive || state.questionIndex >= state.questionCount) {
    restart();
  }
  startLoop();
});

pauseBtn.addEventListener("click", () => {
  togglePause();
});



overlayNextBtn.addEventListener("click", () => {
  if (overlayNextBtn.disabled) return;
  selectLevel(Math.min(levelIndex + 1, LEVEL_COUNT - 1));
  startLoop();
});

overlayRetryBtn.addEventListener("click", () => {
  restart();
  startLoop();
});

controlButtons.forEach((button) => {
  button.addEventListener("click", () => {
    handleDirection(button.dataset.dir);
  });
  button.addEventListener("touchstart", (event) => {
    event.preventDefault();
    handleDirection(button.dataset.dir);
  });
});

levelsMenuBtn.addEventListener("click", () => {
  setLevelsMenu(!levelsPanel.classList.contains("open"));
});

levelsBackdrop.addEventListener("click", () => {
  setLevelsMenu(false);
});

window.addEventListener("resize", () => {
  if (!isMobileViewport()) {
    setLevelsMenu(false);
  }
});

/**
 * Converts tap coordinates to a direction relative to the snake head.
 * Used for quick tap-to-steer on touch devices.
 */
function directionFromTouchPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  const cellSize = canvas.width / state.cols;
  const head = state.snake[0];
  const headX = head.x * cellSize + cellSize / 2;
  const headY = head.y * cellSize + cellSize / 2;
  const dx = x - headX;
  const dy = y - headY;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

// Touch controls:
// - swipe changes direction based on gesture axis
// - tap steers toward tap relative to head position
canvas.addEventListener("touchstart", (event) => {
  if (event.touches.length === 0) return;
  const touch = event.touches[0];
  touchStartPoint = { x: touch.clientX, y: touch.clientY, moved: false };
});

canvas.addEventListener("touchmove", (event) => {
  if (!touchStartPoint || event.touches.length === 0) return;
  event.preventDefault();
  const touch = event.touches[0];
  const dx = touch.clientX - touchStartPoint.x;
  const dy = touch.clientY - touchStartPoint.y;
  const minSwipe = 14;
  if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  handleDirection(dir);
  touchStartPoint = { x: touch.clientX, y: touch.clientY, moved: true };
}, { passive: false });

canvas.addEventListener("touchend", (event) => {
  if (!touchStartPoint) return;
  if (!touchStartPoint.moved && event.changedTouches.length > 0) {
    const touch = event.changedTouches[0];
    const dir = directionFromTouchPoint(touch.clientX, touch.clientY);
    if (dir) handleDirection(dir);
  }
  touchStartPoint = null;
});

canvas.addEventListener("touchcancel", () => {
  touchStartPoint = null;
});

contrastToggle.addEventListener("click", toggleContrast);
textToggle.addEventListener("click", toggleText);

// App bootstrap.
renderLevels();
restart();
loadA11y();
setLevelsMenu(false);
