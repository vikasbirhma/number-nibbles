# Snake

A minimal Snake game with deterministic core logic, arithmetic questions, and a small test suite.

## Run

Start a static server from the project root:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Tests

```bash
npm test
```

## Controls

- Arrow keys or `WASD` to move
- `Space` to pause/resume
- On-screen buttons on mobile

## Manual checklist

1. Snake wraps around edges (no wall death).
2. Question is centered and easy to read while moving.
3. Two food items show possible answers to the question.
4. Eating the correct answer grows the snake and updates the question.
5. Eating the wrong answer ends the game and shows a score card.
6. Level completes after 10 correct answers.
7. Next level unlocks only if 10 answers are completed before the 1:40 timer hits zero.
