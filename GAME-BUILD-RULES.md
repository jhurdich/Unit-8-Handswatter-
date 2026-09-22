# Handswatter-Style Game Build Guide

Use this guide when creating a similar sign-and-guess game for another unit.

## 1. Classroom game rules

### Rounds and signs

- A game contains multiple rounds.
- Each round is connected to one answer board or slide.
- Each round can contain up to 8 signs.
- The teacher signs one word at a time.
- Students see the answer board only when the teacher starts the current sign.
- When the round ends, the teacher moves to the next slide and starts the next round.
- Scores carry forward from round to round.

### Student answers

- Students join with a room code and a name.
- Students see the rules before the game begins.
- For each sign, students tap the tile that matches the teacher's sign.
- Each student gets one answer per sign.
- After answering, that student's answer is locked for that sign.
- A wrong answer earns 0 points.
- A student who misses a sign may continue playing on the next sign.

### Scoring

Correct answers receive points in the order they arrive:

| Correct-answer rank | Points |
| --- | ---: |
| 1st | 10 |
| 2nd | 9 |
| 3rd | 8 |
| 4th | 7 |
| 5th | 6 |
| 6th | 5 |
| 7th | 4 |
| 8th | 3 |
| 9th | 2 |
| 10th and later | 1 |

- Only correct answers receive a rank.
- Wrong answers do not affect the correct-answer ranking.
- The teacher can end a sign to show results.
- At the end of each round, show each student's accumulated grand total.
- At the end of the game, show the final leaderboard.
- Students see only the top 10 leaderboard places. A student outside the top 10 also sees their own current place.
- Teachers can see the complete leaderboard.

### Accessibility baseline

- Use real buttons for every answer choice so students can use Tab, Enter, and Space.
- Give every input, status message, board, answer tile, and leaderboard an accessible name.
- Keep visible focus indicators and do not communicate correctness through color alone.
- Announce connection changes, answer feedback, and score updates to assistive technology.
- Respect `prefers-reduced-motion` and provide strong focus/contrast styling.
- Test with keyboard-only navigation and a screen reader before using a new unit in class.
- Treat this as an accessibility baseline, not a guarantee of legal ADA compliance; provide an equivalent accommodation when a student needs one.

## 2. Teacher workflow

1. The teacher opens the hosted game and chooses **Teacher**.
2. The game creates a six-character room code.
3. The teacher shares the room code or join link.
4. Students join and read the instructions.
5. The teacher sets up the current round:
   - choose the board;
   - load the answer key for that board;
   - review each teacher-only sign note;
   - verify the correct tile for every sign;
   - adjust any tile if necessary;
   - save the round.
6. The teacher clicks **Start sign** before signing the word.
7. Students tap one answer tile.
8. The teacher clicks **End sign** to reveal results.
9. The teacher clicks **Next sign** until all signs are complete.
10. The teacher ends the round and reviews grand totals.
11. The teacher sets up the next board and repeats the process.
12. The teacher finishes the game to show final scores.

## 3. Student workflow

1. Open the hosted game.
2. Choose **Student**.
3. Enter the room code and a name.
4. Read the rules page while waiting.
5. When the teacher starts a sign, the answer board appears.
6. Watch the teacher, then tap the matching tile quickly.
7. Wait for the next sign or round result.
8. Continue until the teacher finishes the game.

## 4. Board and answer-key rules

### Board requirements

- Every board needs a unique ID.
- Store each board image in `public/boards/`.
- Add the board to the `BOARDS` object in `public/app.js`.
- Record the board's title, image path, row count, and column count.
- Tile numbering runs left-to-right, then top-to-bottom.
- Internal tile indexes are zero-based: Tile 1 is index `0`, Tile 2 is index `1`, and so on.

Example:

```js
const BOARDS = {
  clothing: {
    title: "Clothing",
    image: "./boards/clothing.png",
    rows: 3,
    cols: 3,
  },
};
```

### Answer-key requirements

- Add one object to `ANSWER_KEY_ROUNDS` for each round.
- Each round must include a title, a matching `boardId`, and no more than 8 prompts.
- Each prompt is `[teacherNote, correctTileIndex]`.
- The teacher note is private and should describe the sign or answer.
- The correct tile index must match the board's zero-based tile index.
- Do not add descriptive labels as extra signs unless the teacher intends to sign them.

Example:

```js
{
  title: "Clothing",
  boardId: "clothing",
  prompts: [
    ["T-shirt", 0],
    ["Long sleeve", 1],
    ["Tank top", 2],
  ],
}
```

### Shuffle rule

- Keep the correct tile attached to its teacher note while shuffling.
- Shuffle the sign order separately for each room so classes do not receive the same sequence.
- Do not shuffle the image tile positions unless the board image and answer indexes are changed together.
- After loading a key, the teacher must review the notes and marked tiles before saving.

## 5. Privacy and answer security

- Students should receive the board and their own answer result.
- Students should not receive the teacher's sign notes or the full answer key.
- The teacher should receive the sign notes, submissions, correct tile, and rankings.
- The server should calculate correctness and points instead of trusting a student's score.
- A student must be prevented from submitting more than once for the same sign.

## 6. Real-time connection rules

- Use one shared room state for each room code.
- Broadcast a new snapshot after every important action:
  - student joins;
  - round is saved;
  - sign starts;
  - student answers;
  - sign ends;
  - next sign begins;
  - round ends;
  - game finishes.
- If a connection drops, show a visible connection warning.
- Automatically reconnect with a short backoff.
- Reuse the same student ID when reconnecting so the student's score is preserved.
- After reconnecting, send the current room snapshot so the student is not stuck on an old sign.

## 7. Current project file map

- `public/index.html` — page structure and teacher/student screens.
- `public/styles.css` — visual design and responsive layout.
- `public/app.js` — board definitions, answer keys, UI state, shuffling, and WebSocket client.
- `public/boards/` — board images.
- `src/worker.js` — Cloudflare Worker routes and Durable Object room logic.
- `src/game-logic.js` — scoring, name cleaning, room-code cleaning, and leaderboard sorting.
- `tests/game-logic.test.mjs` — automated scoring and input tests.
- `wrangler.toml` — Cloudflare deployment configuration.
- `package.json` — local development, deployment, and test commands.

## 8. Future-unit checklist

- [ ] Prepare one board image per slide.
- [ ] Confirm the image row and column counts.
- [ ] Number every tile left-to-right and top-to-bottom.
- [ ] Write the correct answer for every planned sign.
- [ ] Keep each round at 8 signs or fewer.
- [ ] Verify every answer's zero-based tile index.
- [ ] Add the board metadata to `BOARDS`.
- [ ] Add the round and prompts to `ANSWER_KEY_ROUNDS`.
- [ ] Test the teacher review screen before saving.
- [ ] Test one teacher and several students in separate browsers.
- [ ] Test wrong answers, fast-answer scoring, round totals, and final totals.
- [ ] Test a student disconnecting and reconnecting.
- [ ] Run `npm test`.
- [ ] Run `node --check public/app.js`.
- [ ] Deploy with `npm run deploy`.
- [ ] Test the live Cloudflare URL after deployment.

## 9. Deployment commands

```bash
npm install
npm test
node --check public/app.js
npx wrangler login
npm run deploy
```

Keep the complete project folder and do not upload `.wrangler/` or account-cache files to GitHub.
