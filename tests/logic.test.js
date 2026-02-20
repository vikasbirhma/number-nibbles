import assert from "node:assert/strict";
import {
  createGame,
  setDirection,
  step,
  createQuestion,
  spawnQuestionAndFoods,
} from "../src/logic.js";

function seededRng(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// Movement wraps around edges.
{
  const rng = seededRng(1);
  const state = createGame({ rows: 6, cols: 6, rng });
  const nearWall = {
    ...cloneState(state),
    snake: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }],
    dir: "right",
    nextDir: "right",
  };
  const next = step(nearWall, rng);
  assert.equal(next.snake[0].x, 0);
  assert.equal(next.alive, true);
}

// Prevent reverse direction.
{
  const rng = seededRng(2);
  const state = createGame({ rows: 10, cols: 10, rng });
  const turned = setDirection(state, "left");
  const next = step(turned, rng);
  assert.equal(next.dir, "right");
}

// Eating correct food grows and scores.
{
  const rng = seededRng(3);
  const state = createGame({ rows: 10, cols: 10, rng });
  const head = state.snake[0];
  const forced = {
    ...cloneState(state),
    questionCount: 10,
    foods: [
      { x: head.x + 1, y: head.y, value: 7, correct: true },
      { x: head.x + 2, y: head.y, value: 5, correct: false },
    ],
  };
  const next = step(forced, rng);
  assert.equal(next.score, 1);
  assert.equal(next.snake.length, state.snake.length + 1);
}

// Eating wrong food ends game.
{
  const rng = seededRng(4);
  const state = createGame({ rows: 10, cols: 10, rng });
  const head = state.snake[0];
  const forced = {
    ...cloneState(state),
    questionCount: 10,
    foods: [
      { x: head.x + 1, y: head.y, value: 7, correct: false },
      { x: head.x + 2, y: head.y, value: 5, correct: true },
    ],
  };
  const next = step(forced, rng);
  assert.equal(next.alive, false);
}

// Food placement gives two unique answers and positions.
{
  const rng = seededRng(5);
  const state = createGame({ rows: 6, cols: 6, rng });
  const { foods, question } = spawnQuestionAndFoods(state, rng);
  assert.equal(foods.length, 2);
  assert.notEqual(foods[0].value, foods[1].value);
  assert.ok(
    foods.some((food) => food.value === question.answer && food.correct)
  );
}

// Question generation yields distinct answer/decoy.
{
  const rng = seededRng(6);
  const question = createQuestion(rng, {
    ops: ["add"],
    minA: 0,
    maxA: 5,
    minB: 0,
    maxB: 5,
    decoyDelta: 2,
  });
  assert.notEqual(question.answer, question.decoy);
}

// Compare question produces two answers, one correct.
{
  const rng = seededRng(7);
  const question = createQuestion(rng, {
    questionType: "compare",
    minA: 0,
    maxA: 9,
    minB: 0,
    maxB: 9,
  });
  assert.equal(question.answers.length, 2);
  const correct = question.answers.filter((a) => a.correct);
  assert.equal(correct.length, 1);
}

console.log("All logic tests passed.");
