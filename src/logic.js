export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const OPS = {
  add: { op: "+", fn: (a, b) => a + b },
  sub: { op: "-", fn: (a, b) => a - b },
  mul: { op: "×", fn: (a, b) => a * b },
};

export function createGame({
  rows = 20,
  cols = 20,
  rng = Math.random,
  level = 1,
  config = defaultConfig(),
} = {}) {
  const snake = [
    { x: Math.floor(cols / 2), y: Math.floor(rows / 2) },
    { x: Math.floor(cols / 2) - 1, y: Math.floor(rows / 2) },
    { x: Math.floor(cols / 2) - 2, y: Math.floor(rows / 2) },
  ];

  const state = {
    rows,
    cols,
    snake,
    dir: "right",
    nextDir: "right",
    foods: [],
    question: null,
    score: 0,
    level,
    questionIndex: 0,
    questionCount: config.questionCount ?? 10,
    config,
    alive: true,
    grow: 0,
  };

  const { foods, question } = spawnQuestionAndFoods(state, rng);
  state.foods = foods;
  state.question = question;
  return state;
}

export function setDirection(state, dir) {
  if (!DIRECTIONS[dir]) return state;
  if (OPPOSITE[dir] === state.dir) return state;
  return { ...state, nextDir: dir };
}

export function step(state, rng = Math.random) {
  if (!state.alive) return state;

  const dir = state.nextDir;
  const velocity = DIRECTIONS[dir];
  const head = state.snake[0];
  const nextHead = {
    x: (head.x + velocity.x + state.cols) % state.cols,
    y: (head.y + velocity.y + state.rows) % state.rows,
  };

  const hitsSelf = state.snake.some(
    (segment, index) =>
      index !== state.snake.length - 1 &&
      segment.x === nextHead.x &&
      segment.y === nextHead.y
  );

  if (hitsSelf) {
    return { ...state, alive: false };
  }

  const nextSnake = [nextHead, ...state.snake];
  let grow = state.grow;
  let score = state.score;
  let foods = state.foods;
  let question = state.question;
  let alive = state.alive;
  let questionIndex = state.questionIndex;

  const eaten = foods.find(
    (food) => food.x === nextHead.x && food.y === nextHead.y
  );

  if (eaten) {
    if (eaten.correct) {
      grow += 1;
      score += 1;
      questionIndex += 1;
      if (questionIndex < state.questionCount) {
        const next = spawnQuestionAndFoods(
          { ...state, snake: nextSnake, questionIndex },
          rng
        );
        foods = next.foods;
        question = next.question;
      } else {
        foods = [];
        question = null;
      }
    } else {
      alive = false;
    }
  }

  if (grow > 0) {
    grow -= 1;
  } else {
    nextSnake.pop();
  }

  return {
    ...state,
    snake: nextSnake,
    dir,
    nextDir: dir,
    foods,
    question,
    questionIndex,
    grow,
    score,
    alive,
  };
}

export function spawnQuestionAndFoods(state, rng = Math.random) {
  const question = createQuestion(rng, state.config);
  const answers = shuffle(
    question.answers ?? [
      { value: question.answer, correct: true },
      { value: question.decoy, correct: false },
    ],
    rng
  );

  const occupied = new Set(state.snake.map((s) => `${s.x},${s.y}`));
  const positions = pickEmptyCells(state, occupied, 2, rng);
  const foods = positions.map((pos, index) => ({
    ...pos,
    value: answers[index].value,
    correct: answers[index].correct,
  }));

  return { foods, question };
}

export function createQuestion(rng = Math.random, config = defaultConfig()) {
  const merged = { ...defaultConfig(), ...config };
  if (merged.questionType === "compare") {
    const minA = Number.isFinite(merged.minA) ? merged.minA : 1;
    const maxA = Number.isFinite(merged.maxA) ? merged.maxA : minA + 1;
    const minB = Number.isFinite(merged.minB) ? merged.minB : 1;
    const maxB = Number.isFinite(merged.maxB) ? merged.maxB : minB + 1;
    const picksA = Array.isArray(merged.allowedA) ? merged.allowedA : null;
    const picksB = Array.isArray(merged.allowedB) ? merged.allowedB : null;
    let a = pickNumber(rng, minA, maxA, picksA);
    let b = pickNumber(rng, minB, maxB, picksB);
    if (a === b) {
      b = a + 1 <= maxB ? a + 1 : Math.max(minB, a - 1);
    }
    const pickGreater = rng() < 0.5;
    const text = pickGreater ? "Eat the greater number" : "Eat the smaller number";
    return {
      text,
      answers: [
        { value: a, correct: pickGreater ? a > b : a < b },
        { value: b, correct: pickGreater ? b > a : b < a },
      ],
    };
  }
  const ops = (merged.ops ?? ["add", "sub"]).map((key) => OPS[key]);
  const op = ops[Math.floor(rng() * ops.length)];
  const minA = Number.isFinite(merged.minA) ? merged.minA : 1;
  const maxA = Number.isFinite(merged.maxA) ? merged.maxA : minA + 1;
  const minB = Number.isFinite(merged.minB) ? merged.minB : 1;
  const maxB = Number.isFinite(merged.maxB) ? merged.maxB : minB + 1;
  const decoyDelta = Number.isFinite(merged.decoyDelta) ? merged.decoyDelta : 2;
  const picksA = Array.isArray(merged.allowedA) ? merged.allowedA : null;
  const picksB = Array.isArray(merged.allowedB) ? merged.allowedB : null;

  let a = pickNumber(rng, minA, maxA, picksA);
  let b = pickNumber(rng, minB, maxB, picksB);

  if (op === OPS.sub) {
    if (merged.noNegatives && a < b) {
      [a, b] = [b, a];
    }
    if (merged.requireBridgeTen) {
      [a, b] = findBridgeSub(rng, minA, maxA, minB, maxB, picksA, picksB);
    }
  }

  if (op === OPS.add && merged.requireBridgeTen) {
    [a, b] = findBridgeAdd(rng, minA, maxA, minB, maxB, picksA, picksB);
  }

  const answer = op.fn(a, b);
  let decoy = answer + (rng() < 0.5 ? -decoyDelta : decoyDelta);
  if (decoy === answer) decoy += 1;
  if (!Number.isFinite(decoy)) {
    decoy = answer + 1;
  }
  return {
    text: `${a} ${op.op} ${b}`,
    answer,
    decoy,
  };
}

export function pickEmptyCells(state, occupied, count, rng = Math.random) {
  const empty = [];
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) empty.push({ x, y });
    }
  }

  const result = [];
  for (let i = 0; i < count && empty.length > 0; i += 1) {
    const index = Math.floor(rng() * empty.length);
    result.push(empty.splice(index, 1)[0]);
  }
  return result;
}

function shuffle(list, rng = Math.random) {
  const next = list.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function defaultConfig() {
  return {
    ops: ["add", "sub"],
    minA: 3,
    maxA: 10,
    minB: 1,
    maxB: 9,
    decoyDelta: 2,
    questionCount: 10,
    noNegatives: true,
    requireBridgeTen: false,
    allowedA: null,
    allowedB: null,
    questionType: "math",
  };
}

function pickNumber(rng, min, max, allowed) {
  if (Array.isArray(allowed) && allowed.length > 0) {
    return allowed[Math.floor(rng() * allowed.length)];
  }
  return min + Math.floor(rng() * (max - min + 1));
}

function findBridgeAdd(rng, minA, maxA, minB, maxB, picksA, picksB) {
  for (let i = 0; i < 30; i += 1) {
    const a = pickNumber(rng, minA, maxA, picksA);
    const b = pickNumber(rng, minB, maxB, picksB);
    if (a < 10 && a + b >= 10) return [a, b];
  }
  return [pickNumber(rng, minA, maxA, picksA), pickNumber(rng, minB, maxB, picksB)];
}

function findBridgeSub(rng, minA, maxA, minB, maxB, picksA, picksB) {
  for (let i = 0; i < 30; i += 1) {
    const a = pickNumber(rng, minA, maxA, picksA);
    const b = pickNumber(rng, minB, maxB, picksB);
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    if (high >= 10 && high - low < 10) return [high, low];
  }
  const a = pickNumber(rng, minA, maxA, picksA);
  const b = pickNumber(rng, minB, maxB, picksB);
  return a >= b ? [a, b] : [b, a];
}
