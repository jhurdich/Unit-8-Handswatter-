import { cleanCode, cleanName, pointsForRank, sortPlayers } from "./game-logic.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function emptyRoom(code) {
  return {
    code,
    hostId: null,
    createdAt: Date.now(),
    status: "lobby",
    roundNumber: 0,
    round: null,
    currentPrompt: -1,
    promptStatus: "setup",
    answerSequence: 0,
    players: {},
    submissions: {},
    roundHistory: [],
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = roomCode();
        const id = env.ROOM.idFromName(code);
        const stub = env.ROOM.get(id);
        const result = await stub.fetch(new URL(`/internal/init?code=${code}`, request.url), { method: "POST" });
        if (result.ok) return json({ code });
      }
      return json({ error: "Could not create a room. Try again." }, 503);
    }

    const roomMatch = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{4,8})$/);
    if (roomMatch) {
      const code = cleanCode(roomMatch[1]);
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    this.room = null;
  }

  async load() {
    if (!this.room) this.room = (await this.state.storage.get("room")) || emptyRoom("UNKNOWN");
    return this.room;
  }

  async save() {
    await this.state.storage.put("room", this.room);
  }

  async fetch(request) {
    const url = new URL(request.url);
    await this.load();

    if (url.pathname === "/internal/init" && request.method === "POST") {
      const code = cleanCode(url.searchParams.get("code"));
      if (this.room.code !== "UNKNOWN" && this.room.code !== code) return json({ error: "Room exists" }, 409);
      if (this.room.code === "UNKNOWN") {
        this.room = emptyRoom(code);
        await this.save();
      }
      return json({ ok: true });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ sessionId: crypto.randomUUID(), role: null, playerId: null });
      await this.sendSnapshot(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/state") return json(this.publicSnapshot("student", null));
    return json({ error: "Not found" }, 404);
  }

  async webSocketMessage(ws, message) {
    await this.load();
    let payload;
    try { payload = JSON.parse(message); } catch { return this.send(ws, { type: "error", message: "Invalid message." }); }

    const connection = ws.deserializeAttachment() || {};
    if (payload.type === "hello") {
      const role = payload.role === "teacher" ? "teacher" : "student";
      const sessionId = String(payload.sessionId || crypto.randomUUID()).slice(0, 80);
      if (role === "teacher") {
        if (this.room.hostId && this.room.hostId !== sessionId) {
          return this.send(ws, { type: "error", message: "This room already has a teacher." });
        }
        this.room.hostId = sessionId;
      } else {
        const playerId = String(payload.playerId || crypto.randomUUID()).slice(0, 80);
        const name = cleanName(payload.name);
        if (!name) return this.send(ws, { type: "error", message: "Enter a name to join." });
        this.room.players[playerId] = this.room.players[playerId] || { id: playerId, name, score: 0, joinedAt: Date.now() };
        this.room.players[playerId].name = name;
        connection.playerId = playerId;
      }
      connection.sessionId = sessionId;
      connection.role = role;
      ws.serializeAttachment(connection);
      await this.save();
      return this.broadcast();
    }

    if (!connection.role) return this.send(ws, { type: "error", message: "Join the room first." });
    if (connection.role === "teacher" && payload.type === "configureRound") return this.configureRound(ws, payload);
    if (connection.role === "teacher" && payload.type === "startPrompt") return this.startPrompt(ws);
    if (connection.role === "teacher" && payload.type === "endPrompt") return this.endPrompt(ws);
    if (connection.role === "teacher" && payload.type === "nextPrompt") return this.nextPrompt(ws);
    if (connection.role === "teacher" && payload.type === "endRound") return this.endRound(ws);
    if (connection.role === "teacher" && payload.type === "finishGame") return this.finishGame(ws);
    if (connection.role === "teacher" && payload.type === "resetRoom") return this.resetRoom(ws);
    if (connection.role === "student" && payload.type === "answer") return this.answer(ws, payload);
    return this.send(ws, { type: "error", message: "Unknown action." });
  }

  async webSocketClose(ws) {
    const connection = ws.deserializeAttachment() || {};
    if (connection?.role === "teacher" && this.room.hostId === connection.sessionId) {
      this.room.hostId = null;
      await this.save();
    }
    await this.broadcast();
  }

  async configureRound(ws, payload) {
    const title = String(payload.title || "Round").trim().slice(0, 80) || "Round";
    const boardId = String(payload.boardId || "").replace(/[^a-z0-9-]/g, "");
    const prompts = Array.isArray(payload.prompts) ? payload.prompts.slice(0, 8) : [];
    const cleanPrompts = prompts
      .map((prompt) => ({
        note: String(prompt?.note || "").trim().slice(0, 100),
        correctIndex: Number.isInteger(prompt?.correctIndex) ? prompt.correctIndex : null,
      }))
      .filter((prompt) => prompt.note || prompt.correctIndex !== null);

    if (!boardId || !cleanPrompts.length || cleanPrompts.some((prompt) => prompt.correctIndex === null)) {
      return this.send(ws, { type: "error", message: "Add at least one sign and choose the correct tile for every sign." });
    }

    this.room.roundNumber += 1;
    this.room.round = { number: this.room.roundNumber, title, boardId, prompts: cleanPrompts };
    this.room.currentPrompt = 0;
    this.room.promptStatus = "ready";
    this.room.status = "ready";
    this.room.submissions = {};
    this.room.answerSequence = 0;
    await this.save();
    await this.broadcast();
  }

  async startPrompt(ws) {
    if (!this.room.round || this.room.promptStatus !== "ready") return this.send(ws, { type: "error", message: "Set up a round before starting a sign." });
    this.room.promptStatus = "active";
    this.room.status = "active";
    const key = String(this.room.currentPrompt);
    this.room.submissions[key] = {};
    await this.save();
    await this.broadcast();
  }

  async endPrompt(ws) {
    if (this.room.promptStatus !== "active") return;
    this.room.promptStatus = "results";
    this.room.status = "prompt-results";
    await this.save();
    await this.broadcast();
  }

  async nextPrompt(ws) {
    if (!this.room.round || this.room.promptStatus !== "results") return;
    if (this.room.currentPrompt >= this.room.round.prompts.length - 1) {
      return this.endRound(ws);
    }
    this.room.currentPrompt += 1;
    this.room.promptStatus = "ready";
    this.room.status = "ready";
    await this.save();
    await this.broadcast();
  }

  async endRound(ws) {
    if (!this.room.round) return;
    this.room.promptStatus = "round-results";
    this.room.status = "round-results";
    const scores = Object.fromEntries(Object.values(this.room.players).map((player) => [player.id, player.score]));
    this.room.roundHistory.push({ number: this.room.round.number, title: this.room.round.title, scores, finishedAt: Date.now() });
    await this.save();
    await this.broadcast();
  }

  async finishGame(ws) {
    this.room.status = "finished";
    this.room.promptStatus = "finished";
    await this.save();
    await this.broadcast();
  }

  async resetRoom(ws) {
    const code = this.room.code;
    this.room = emptyRoom(code);
    this.room.hostId = ws.deserializeAttachment()?.sessionId || null;
    await this.save();
    await this.broadcast();
  }

  async answer(ws, payload) {
    if (this.room.promptStatus !== "active") return;
    const connection = ws.deserializeAttachment() || {};
    const player = this.room.players[connection?.playerId];
    const prompt = this.room.round?.prompts?.[this.room.currentPrompt];
    if (!player || !prompt) return;
    const key = String(this.room.currentPrompt);
    const current = this.room.submissions[key] || (this.room.submissions[key] = {});
    if (current[player.id]) return;
    const choice = Number(payload.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 99) return;

    this.room.answerSequence += 1;
    const correct = choice === prompt.correctIndex;
    const rank = correct ? Object.values(current).filter((submission) => submission.correct).length + 1 : null;
    const points = correct ? pointsForRank(rank) : 0;
    if (correct) player.score += points;
    current[player.id] = {
      playerId: player.id,
      name: player.name,
      choice,
      correct,
      points,
      rank,
      sequence: this.room.answerSequence,
      answeredAt: Date.now(),
    };
    await this.save();
    await this.broadcast();
  }

  publicSnapshot(role, viewerId) {
    const players = Object.values(this.room.players).map(({ id, name, score }) => ({ id, name, score }));
    const key = String(this.room.currentPrompt);
    const submissions = Object.values(this.room.submissions[key] || {})
      .sort((a, b) => a.sequence - b.sequence)
      .map((submission) => role === "teacher" ? submission : ({ playerId: submission.playerId, choice: submission.playerId === viewerId ? submission.choice : undefined, correct: submission.correct, points: submission.points, rank: submission.rank }));
    return {
      type: "snapshot",
      code: this.room.code,
      status: this.room.status,
      promptStatus: this.room.promptStatus,
      roundNumber: this.room.roundNumber,
      round: this.room.round ? {
        number: this.room.round.number,
        title: this.room.round.title,
        boardId: this.room.round.boardId,
        promptCount: this.room.round.prompts.length,
        promptIndex: this.room.currentPrompt,
        teacherPrompts: role === "teacher" ? this.room.round.prompts : undefined,
      } : null,
      players: sortPlayers(players),
      submissions,
      leaderboard: sortPlayers(players),
      history: this.room.roundHistory,
      correctIndex: role === "teacher" && this.room.round ? this.room.round.prompts[this.room.currentPrompt]?.correctIndex ?? null : (this.room.promptStatus === "results" || this.room.promptStatus === "round-results") && this.room.round ? this.room.round.prompts[this.room.currentPrompt]?.correctIndex ?? null : null,
    };
  }

  send(ws, payload) {
    try { ws.send(JSON.stringify(payload)); } catch { /* disconnected */ }
  }

  async sendSnapshot(ws) {
    const connection = ws.deserializeAttachment() || {};
    this.send(ws, this.publicSnapshot(connection.role || "student", connection.playerId));
  }

  async broadcast() {
    for (const ws of this.state.getWebSockets()) await this.sendSnapshot(ws);
  }
}
