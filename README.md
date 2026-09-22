# Swat It! Live

A real-time classroom game for the supplied Unit 8 Handswatter boards. The teacher creates a room, shares the six-character code, signs one word at a time, and students tap the matching tile on their own device.

## Rules implemented

- A round has up to eight signs.
- The teacher chooses the correct tile privately for each sign.
- Students get one answer per sign. Wrong answers score 0 and lock that sign.
- Correct answers score by arrival order: 10, 9, 8, 7, 6, 5, 4, 3, 2, then 1 point for every later correct answer.
- Scores carry forward across rounds.
- A round-results screen shows the accumulated grand total.
- Students see the rules before the round begins; the answer board appears when the teacher starts a sign.
- Student and teacher connections automatically reconnect and resync if a network connection drops.
- Students see the top 10 leaderboard places plus their own place if they are outside the top 10; teachers see the full leaderboard.

## Local run

Install Wrangler, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Wrangler. Use one browser window as Teacher and additional windows/devices as Students.

## Cloudflare deploy

1. Install and authenticate Wrangler: `npx wrangler login`
2. Change `name` in `wrangler.toml` if the default project name is already taken.
3. Run `npm run deploy`.

The project uses a Durable Object for each room, so room state and WebSocket messages stay synchronized across teacher and student devices. The included board images are rendered from the PowerPoint supplied with the request and keep its visible attribution footer.

## Teacher workflow

1. Choose Teacher, create a room, and share the code.
2. The supplied eight-round answer key loads for the selected board. Its sign order is shuffled separately for each room. Review the teacher-only sign notes and correct tiles, then adjust any tile if needed.
3. Click the correct tile marker for each prompt, then save the round.
4. Start each sign. Students tap one tile. End the sign to reveal the correct tile and results.
5. Continue through the prompts, end the round, and start another round when ready.
