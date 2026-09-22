const BOARDS = {
  "life-stages": { title: "Life Stages", image: "./boards/life-stages.png", rows: 3, cols: 2 },
  "hair-hairstyles": { title: "Description: Hair and Hairstyles", image: "./boards/hair-hairstyles.png", rows: 3, cols: 4 },
  "facial-features": { title: "Description: Facial Hair, Eyebrows, and Facial Features", image: "./boards/facial-features.png", rows: 3, cols: 4 },
  clothing: { title: "Clothing", image: "./boards/clothing.png", rows: 3, cols: 3 },
  "accessories-shoes": { title: "Accessories & Shoes", image: "./boards/accessories-shoes.png", rows: 3, cols: 4 },
  patterns: { title: "Patterns", image: "./boards/patterns.png", rows: 3, cols: 3 },
  "culture-access": { title: "Culture and Access", image: "./boards/culture-access.png", rows: 4, cols: 4 },
  civics: { title: "Civics", image: "./boards/civics.png", rows: 3, cols: 4 },
};

const ANSWER_KEY_ROUNDS = [
  {
    title: "Life Stages",
    boardId: "life-stages",
    prompts: [
      ["child", 1], ["senior citizens", 3], ["teen", 2], ["birth", 0], ["middle-age", 4], ["baby", 5],
    ],
  },
  {
    title: "Hair and Hairstyles",
    boardId: "hair-hairstyles",
    prompts: [
      ["Bald", 0], ["Short brown hair", 1], ["Long curly black hair", 2], ["Balding", 3], ["Mid-length black afro", 5], ["Short blond bob", 7], ["Tight-curl black afro", 9], ["Shoulder-length black hair", 10],
    ],
  },
  {
    title: "Facial Features",
    boardId: "facial-features",
    prompts: [
      ["Braces", 0], ["Freckles", 1], ["Scar", 3], ["Thin eyebrows", 4], ["Thick mustache", 5], ["Beauty mark", 6], ["White teeth", 9], ["Thick eyebrows", 11],
    ],
  },
  {
    title: "Clothing",
    boardId: "clothing",
    prompts: [
      ["T-shirt", 0], ["Long sleeve", 1], ["Tank top", 2], ["Dress", 3], ["Pants/Jeans", 5], ["Uniform", 6], ["Sleepwear/Pajamas", 7], ["Skirt", 8],
    ],
  },
  {
    title: "Accessories and Shoes",
    boardId: "accessories-shoes",
    prompts: [
      ["Backpack", 0], ["Purse", 1], ["Hat", 2], ["Scarf", 3], ["Bow tie", 4], ["Belt", 5], ["Rings", 6], ["Watches", 7],
    ],
  },
  {
    title: "Patterns",
    boardId: "patterns",
    prompts: [
      ["Solid/plain color", 0], ["Vertical stripes", 1], ["Horizontal stripes", 2], ["Flowery", 3], ["Polka dots", 4], ["Plaid", 5], ["Zigzag", 6], ["Leopard", 8],
    ],
  },
  {
    title: "Culture and Access",
    boardId: "culture-access",
    prompts: [
      ["Access", 0], ["Captions", 1], ["Deaf Gain", 2], ["Experience", 3], ["Identity", 5], ["Equal Rights", 7], ["Pride", 10], ["Interpreter", 15],
    ],
  },
  {
    title: "Civics",
    boardId: "civics",
    prompts: [
      ["Supreme Court", 9], ["Federal", 3], ["Propose", 6], ["Vote", 5], ["Legislative Branch", 7], ["Senate", 8], ["Pass", 2], ["President", 11],
    ],
  },
];

function shuffledPrompts(promptPairs) {
  const prompts = promptPairs.map(([note, correctIndex]) => ({ note, correctIndex }));
  for (let index = prompts.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [prompts[index], prompts[swapIndex]] = [prompts[swapIndex], prompts[index]];
  }
  return prompts;
}

const $ = (selector) => document.querySelector(selector);
const screens = { home: $("#home-screen"), join: $("#join-screen"), teacher: $("#teacher-screen"), student: $("#student-screen") };
let socket = null;
let session = null;
let currentSnapshot = null;
let setupPrompts = [{ note: "", correctIndex: null }];
let activeSetupPrompt = 0;
let isEditingSetup = false;
let lastRoundNumber = 0;
let setupRoundIndex = 0;
let connectionEpoch = 0;
let reconnectTimer = null;
let reconnectAttempt = 0;

function showScreen(screen) {
  Object.values(screens).forEach((item) => item.classList.remove("active"));
  screens[screen].classList.add("active");
}

function boardMeta(id) { return BOARDS[id] || BOARDS["life-stages"]; }

function socketUrl(code) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/room/${encodeURIComponent(code)}`;
}

function setConnectionStatus(role, message, state = "") {
  const status = $(`#${role}-connection-status`);
  if (!status) return;
  status.textContent = message;
  status.className = `connection-status ${state}`;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function setError(id, message) { $(id).textContent = message || ""; }

function scheduleReconnect(epoch, role) {
  if (epoch !== connectionEpoch || reconnectTimer) return;
  reconnectAttempt += 1;
  const delay = Math.min(1000 * (2 ** Math.min(reconnectAttempt - 1, 3)), 8000);
  setConnectionStatus(role, `Connection lost · retrying in ${Math.ceil(delay / 1000)}s`, "lost");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket(epoch);
  }, delay);
}

function connectSocket(epoch) {
  if (epoch !== connectionEpoch || !session) return;
  const { role, code, name, sessionId, playerId } = session;
  setConnectionStatus(role, reconnectAttempt ? "Reconnecting…" : "Connecting…", "reconnecting");
  let activeSocket;
  try {
    activeSocket = new WebSocket(socketUrl(code));
  } catch {
    scheduleReconnect(epoch, role);
    return;
  }
  socket = activeSocket;
  activeSocket.addEventListener("open", () => {
    if (epoch !== connectionEpoch || socket !== activeSocket) return activeSocket.close();
    reconnectAttempt = 0;
    setConnectionStatus(role, "Connected", "connected");
    activeSocket.send(JSON.stringify({ type: "hello", role, name, sessionId, playerId }));
  });
  activeSocket.addEventListener("message", (event) => {
    if (epoch !== connectionEpoch || socket !== activeSocket) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "error") {
      if (role === "teacher") setError("#live-error", message.message);
      else setError("#join-error", message.message);
      return;
    }
    if (message.type === "snapshot") {
      currentSnapshot = message;
      if (role === "teacher") renderTeacher(message);
      else renderStudent(message);
    }
  });
  activeSocket.addEventListener("close", () => {
    if (epoch !== connectionEpoch || socket !== activeSocket) return;
    socket = null;
    scheduleReconnect(epoch, role);
  });
}

function openConnection(role, code, name = "") {
  connectionEpoch += 1;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectAttempt = 0;
  if (socket) socket.close();
  if (role === "teacher") {
    lastRoundNumber = 0;
    setupRoundIndex = 0;
  }
  session = {
    role,
    code: code.toUpperCase(),
    name,
    sessionId: sessionStorage.getItem(`${role}-session`) || crypto.randomUUID(),
    playerId: role === "student" ? sessionStorage.getItem("handswatter-player") || crypto.randomUUID() : null,
  };
  sessionStorage.setItem(`${role}-session`, session.sessionId);
  if (role === "student") sessionStorage.setItem("handswatter-player", session.playerId);
  showScreen(role);
  connectSocket(connectionEpoch);
}

async function createTeacherRoom() {
  setError("#live-error", "");
  if (location.protocol === "file:") {
    return setError("#home-error", "This is the local preview. Open the hosted game below to create a live room.");
  }
  try {
    const response = await fetch("/api/rooms", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create a room.");
    openConnection("teacher", data.code);
  } catch (error) {
    showScreen("home");
    window.alert(error.message);
  }
}

function makeBoard(stage, boardId, { markers = false, selectedIndex = null, correctIndex = null, disabled = false, onClick = null } = {}) {
  const meta = boardMeta(boardId);
  stage.replaceChildren();
  const image = document.createElement("img");
  image.src = meta.image;
  image.alt = `${meta.title} answer board`;
  stage.append(image);
  const grid = document.createElement("div");
  grid.className = "board-grid";
  grid.style.gridTemplateColumns = `repeat(${meta.cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${meta.rows}, 1fr)`;
  const cellCount = meta.rows * meta.cols;
  for (let index = 0; index < cellCount; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell-button";
    button.dataset.cell = String(index + 1);
    button.setAttribute("aria-label", `Tile ${index + 1}`);
    if (markers) button.classList.add("marker-mode");
    if (selectedIndex === index) button.classList.add("selected");
    if (correctIndex === index) button.classList.add("correct");
    button.disabled = disabled;
    if (onClick) button.addEventListener("click", () => onClick(index));
    grid.append(button);
  }
  stage.append(grid);
}

function setBoardSelect() {
  const select = $("#board-select");
  select.replaceChildren();
  Object.entries(BOARDS).forEach(([id, meta]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = meta.title;
    select.append(option);
  });
  select.value = "life-stages";
}

function cellCount(boardId) {
  const meta = boardMeta(boardId);
  return meta.rows * meta.cols;
}

function renderPromptEditor() {
  const boardId = $("#board-select").value;
  const editor = $("#prompt-editor");
  editor.replaceChildren();
  setupPrompts.forEach((prompt, index) => {
    const row = document.createElement("div");
    row.className = `prompt-row ${activeSetupPrompt === index ? "active-edit" : ""}`;
    row.dataset.prompt = String(index);
    const number = document.createElement("span");
    number.className = "prompt-row-number";
    number.textContent = String(index + 1);
    const input = document.createElement("input");
    input.placeholder = "Teacher-only sign / word note";
    input.maxLength = 100;
    input.value = prompt.note;
    input.setAttribute("aria-label", `Sign ${index + 1} teacher note`);
    input.addEventListener("input", () => { setupPrompts[index].note = input.value; });
    input.addEventListener("focus", () => { activeSetupPrompt = index; renderPromptEditor(); renderSetupBoard(); });
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Correct tile for sign ${index + 1}`);
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Correct tile…";
    select.append(blank);
    for (let tile = 0; tile < cellCount(boardId); tile += 1) {
      const option = document.createElement("option");
      option.value = String(tile);
      option.textContent = `Tile ${tile + 1}`;
      select.append(option);
    }
    select.value = prompt.correctIndex === null ? "" : String(prompt.correctIndex);
    select.addEventListener("change", () => { setupPrompts[index].correctIndex = select.value === "" ? null : Number(select.value); renderSetupBoard(); });
    row.append(number, input, select);
    row.addEventListener("click", (event) => {
      if (event.target === input || event.target === select) return;
      activeSetupPrompt = index;
      renderPromptEditor();
      renderSetupBoard();
    });
    editor.append(row);
  });
}

function renderSetupBoard() {
  const boardId = $("#board-select").value;
  const selected = setupPrompts[activeSetupPrompt]?.correctIndex ?? null;
  makeBoard($("#setup-board"), boardId, { markers: true, selectedIndex: selected, onClick: (index) => {
    if (!setupPrompts[activeSetupPrompt]) return;
    setupPrompts[activeSetupPrompt].correctIndex = index;
    renderPromptEditor();
    renderSetupBoard();
  }});
}

function showTeacherState(state) {
  ["#teacher-lobby", "#teacher-setup", "#teacher-live", "#teacher-finished"].forEach((id) => $(id).classList.add("hidden"));
  $(state).classList.remove("hidden");
}

function renderPlayers(snapshot, target) {
  const container = $(target);
  container.replaceChildren();
  if (!snapshot.players.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "Waiting for students…";
    container.append(empty);
    return;
  }
  snapshot.players.forEach((player) => {
    const pill = document.createElement("span");
    pill.className = "player-pill";
    pill.textContent = player.name;
    container.append(pill);
  });
}

function renderLeaderboard(snapshot, target, isStudent = false, large = false) {
  const container = $(target);
  container.replaceChildren();
  snapshot.leaderboard.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = `leader-row ${isStudent && player.id === session?.playerId ? "me" : ""}`;
    const rank = document.createElement("span");
    rank.className = "leader-rank";
    rank.textContent = `${player.rank ?? index + 1}`;
    const name = document.createElement("span");
    name.className = "leader-name";
    name.textContent = player.name;
    const score = document.createElement("span");
    score.className = "leader-score";
    score.textContent = `${player.score}`;
    row.append(rank, name, score);
    container.append(row);
  });
  if (!snapshot.leaderboard.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "No players yet.";
    container.append(empty);
  }
}

function renderTeacher(snapshot) {
  if (Number.isInteger(snapshot.roundNumber)) lastRoundNumber = snapshot.roundNumber;
  $("#teacher-room-code").textContent = snapshot.code;
  $("#teacher-big-code").textContent = snapshot.code;
  $("#join-url").textContent = `${location.origin}/?room=${snapshot.code}`;
  $("#teacher-player-count").textContent = String(snapshot.players.length);
  renderPlayers(snapshot, "#teacher-lobby-players");
  renderLeaderboard(snapshot, "#teacher-leaderboard");
  if (isEditingSetup) {
    showTeacherState("#teacher-setup");
    return;
  }
  if (snapshot.status === "lobby") {
    showTeacherState("#teacher-lobby");
    return;
  }
  if (snapshot.status === "finished") {
    showTeacherState("#teacher-finished");
    renderLeaderboard(snapshot, "#teacher-final-leaderboard", false, true);
    return;
  }
  if (snapshot.status === "ready" && (!snapshot.round || snapshot.round.promptIndex === 0 && snapshot.round.number === 0)) {
    showTeacherState("#teacher-setup");
    return;
  }
  if (snapshot.status === "ready" && snapshot.round) {
    showTeacherState("#teacher-live");
  } else if (snapshot.status === "prompt-results" || snapshot.status === "round-results" || snapshot.status === "active") {
    showTeacherState("#teacher-live");
  }
  renderTeacherLive(snapshot);
}

function renderTeacherLive(snapshot) {
  const round = snapshot.round;
  if (!round) return;
  const promptIndex = round.promptIndex;
  const prompt = round.teacherPrompts?.[promptIndex];
  $("#live-round-label").textContent = `Round ${round.number} · ${round.title}`;
  $("#live-heading").textContent = `${snapshot.promptStatus === "round-results" ? "Round complete" : `Sign ${promptIndex + 1} of ${round.promptCount}`}`;
  $("#teacher-sign-note").textContent = snapshot.promptStatus === "round-results" ? "Grand total updated below. Start another round when you are ready." : (prompt?.note || "Sign the selected word for students.");
  const statusText = { ready: "Ready", active: "Sign in progress", results: "Results", "round-results": "Round complete" }[snapshot.promptStatus] || "Ready";
  $("#live-status").textContent = statusText;
  $("#live-status").className = `live-status ${snapshot.promptStatus === "active" ? "active" : snapshot.promptStatus === "results" || snapshot.promptStatus === "round-results" ? "results" : ""}`;
  makeBoard($("#teacher-board"), round.boardId, { markers: true, correctIndex: snapshot.correctIndex });
  $("#start-prompt").classList.toggle("hidden", snapshot.promptStatus !== "ready");
  $("#end-prompt").classList.toggle("hidden", snapshot.promptStatus !== "active");
  $("#next-prompt").classList.toggle("hidden", snapshot.promptStatus !== "results" || promptIndex >= round.promptCount - 1);
  $("#end-round").classList.toggle("hidden", snapshot.promptStatus !== "results" || promptIndex < round.promptCount - 1);
  $("#new-round").classList.toggle("hidden", snapshot.promptStatus !== "round-results");
  $("#finish-game").classList.toggle("hidden", snapshot.promptStatus !== "round-results");
  const answerList = $("#teacher-submissions");
  answerList.replaceChildren();
  $("#submission-count").textContent = String(snapshot.submissions.length);
  if (!snapshot.submissions.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "No answers yet.";
    answerList.append(empty);
  } else {
    snapshot.submissions.forEach((submission) => {
      const row = document.createElement("div");
      row.className = "submission-row";
      const left = document.createElement("div");
      const name = document.createElement("div");
      name.className = "sub-name";
      name.textContent = submission.name;
      const choice = document.createElement("div");
      choice.className = "sub-answer";
      choice.textContent = `Tile ${submission.choice + 1}`;
      left.append(name, choice);
      const points = document.createElement("span");
      points.className = `submission-points ${submission.correct ? "" : "wrong"}`;
      points.textContent = submission.correct ? `+${submission.points} · #${submission.rank}` : "0 · incorrect";
      row.append(left, points);
      answerList.append(row);
    });
  }
}

function renderStudent(snapshot) {
  $("#student-room-code").textContent = snapshot.code;
  renderLeaderboard(snapshot, "#student-leaderboard", true);
  ["#student-instructions", "#student-active", "#student-results", "#student-finished"].forEach((id) => $(id).classList.add("hidden"));
  if (snapshot.status === "finished") {
    $("#student-finished").classList.remove("hidden");
    renderLeaderboard(snapshot, "#student-final-leaderboard", true, true);
    return;
  }
  if (snapshot.promptStatus === "active") {
    $("#student-active").classList.remove("hidden");
    renderStudentActive(snapshot);
    return;
  }
  if (snapshot.promptStatus === "results" || snapshot.promptStatus === "round-results") {
    $("#student-results").classList.remove("hidden");
    const own = snapshot.submissions.find((submission) => submission.playerId === session?.playerId);
    $("#student-results-heading").textContent = snapshot.promptStatus === "round-results" ? "Round complete" : own?.correct ? `+${own.points} points` : own ? "No points this sign" : "Sign complete";
    $("#student-results-copy").textContent = snapshot.promptStatus === "round-results" ? `Your grand total is ${snapshot.leaderboard.find((player) => player.id === session?.playerId)?.score ?? 0}.` : own?.correct ? `You were #${own.rank} fastest among correct answers.` : own ? "That answer was not correct." : "The teacher is moving to the next sign.";
    $("#student-wait-button").classList.toggle("hidden", snapshot.promptStatus === "round-results");
    return;
  }
  $("#student-instructions").classList.remove("hidden");
  if (snapshot.status === "ready" && snapshot.round) {
    $("#student-welcome").textContent = "Get ready!";
    $("#student-waiting-copy").textContent = "The first answer board will appear when the teacher starts the sign.";
  } else {
    $("#student-welcome").textContent = "Before we start";
    $("#student-waiting-copy").textContent = "Read the quick rules below. The answer board will appear when the teacher starts the first sign.";
  }
}

function renderStudentActive(snapshot) {
  const round = snapshot.round;
  $("#student-round-label").textContent = `Round ${round.number} · ${round.title}`;
  $("#student-prompt-label").textContent = `Sign ${round.promptIndex + 1} of ${round.promptCount}`;
  const own = snapshot.submissions.find((submission) => submission.playerId === session?.playerId);
  const locked = Boolean(own);
  $("#student-answer-lock").textContent = locked ? "Answer locked" : "Choose a tile";
  $("#student-answer-lock").className = `answer-lock ${locked ? "locked" : ""}`;
  const feedback = $("#student-feedback");
  feedback.className = `student-feedback ${locked ? own.correct ? "success" : "error" : ""}`;
  feedback.textContent = locked ? own.correct ? `Correct! You earned ${own.points} points.` : "That answer is locked in. Keep playing on the next sign." : "Tap the tile that matches the teacher’s sign.";
  makeBoard($("#student-board"), round.boardId, { selectedIndex: own?.choice ?? null, disabled: locked, onClick: (index) => { send({ type: "answer", choice: index }); } });
}

function loadSetupFromSnapshot(snapshot) {
  const round = snapshot.round;
  if (round?.teacherPrompts) {
    setupPrompts = round.teacherPrompts.map((prompt) => ({ ...prompt }));
    $("#round-title").value = round.title;
    $("#board-select").value = round.boardId;
  }
  activeSetupPrompt = 0;
  renderPromptEditor();
  renderSetupBoard();
}

function openSetup() {
  isEditingSetup = true;
  activeSetupPrompt = 0;
  setupRoundIndex = lastRoundNumber;
  const preset = ANSWER_KEY_ROUNDS[setupRoundIndex];
  if (preset) {
    setupPrompts = shuffledPrompts(preset.prompts);
    $("#round-title").value = preset.title;
    $("#board-select").value = preset.boardId;
    $("#setup-round-eyebrow").textContent = `Round ${setupRoundIndex + 1}`;
  } else {
    setupPrompts = [{ note: "", correctIndex: null }];
    $("#round-title").value = `Round ${setupRoundIndex + 1}`;
    $("#board-select").value = "life-stages";
    $("#setup-round-eyebrow").textContent = `Round ${setupRoundIndex + 1}`;
  }
  renderPromptEditor();
  renderSetupBoard();
  showTeacherState("#teacher-setup");
}

function presetIndexForBoard(boardId) {
  return ANSWER_KEY_ROUNDS.findIndex((preset) => preset.boardId === boardId);
}

function loadProvidedKey() {
  const selectedBoard = $("#board-select").value;
  const boardRoundIndex = presetIndexForBoard(selectedBoard);
  const roundIndex = boardRoundIndex >= 0 ? boardRoundIndex : Math.max(setupRoundIndex, lastRoundNumber);
  setupRoundIndex = roundIndex;
  const preset = ANSWER_KEY_ROUNDS[roundIndex];
  if (!preset) return setError("#setup-error", "The provided key includes eight rounds. You can create a custom round here.");
  setupPrompts = shuffledPrompts(preset.prompts);
  activeSetupPrompt = 0;
  $("#round-title").value = preset.title;
  $("#board-select").value = preset.boardId;
  $("#setup-round-eyebrow").textContent = `Round ${roundIndex + 1}`;
  setError("#setup-error", "");
  renderPromptEditor();
  renderSetupBoard();
}

function saveRound() {
  const title = $("#round-title").value.trim() || `Round ${(currentSnapshot?.roundNumber || 0) + 1}`;
  const prompts = setupPrompts.filter((prompt) => prompt.note.trim() || prompt.correctIndex !== null);
  setError("#setup-error", "");
  if (!prompts.length) return setError("#setup-error", "Add at least one sign.");
  if (prompts.some((prompt) => prompt.correctIndex === null)) return setError("#setup-error", "Choose the correct tile for every sign you added.");
  isEditingSetup = false;
  send({ type: "configureRound", title, boardId: $("#board-select").value, prompts });
}

function copyText(value, button) {
  navigator.clipboard?.writeText(value).then(() => {
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = original; }, 1200);
  });
}

$("#teacher-entry").addEventListener("click", createTeacherRoom);
$("#student-entry").addEventListener("click", () => { showScreen("join"); $("#join-code").focus(); });
document.querySelectorAll(".back-home").forEach((button) => button.addEventListener("click", () => showScreen("home")));
$("#join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (location.protocol === "file:") return setError("#join-error", "This is the local preview. Open the hosted game first.");
  const code = $("#join-code").value.trim().toUpperCase();
  const name = $("#join-name").value.trim();
  if (!code || !name) return setError("#join-error", "Enter a room code and your name.");
  openConnection("student", code, name);
});
$("#copy-room").addEventListener("click", (event) => copyText($("#join-url").textContent, event.currentTarget));
$("#copy-url").addEventListener("click", (event) => copyText($("#join-url").textContent, event.currentTarget));
$("#first-round").addEventListener("click", openSetup);
$("#reset-room").addEventListener("click", () => { if (window.confirm("Reset the room and clear all scores?")) { isEditingSetup = false; send({ type: "resetRoom" }); } });
$("#board-select").addEventListener("change", () => { setupPrompts.forEach((prompt) => { if (prompt.correctIndex !== null && prompt.correctIndex >= cellCount($("#board-select").value)) prompt.correctIndex = null; }); renderPromptEditor(); renderSetupBoard(); });
$("#add-prompt").addEventListener("click", () => { if (setupPrompts.length >= 8) return setError("#setup-error", "A round can contain up to 8 signs."); setupPrompts.push({ note: "", correctIndex: null }); activeSetupPrompt = setupPrompts.length - 1; renderPromptEditor(); renderSetupBoard(); });
$("#save-round").addEventListener("click", saveRound);
$("#load-answer-key").addEventListener("click", loadProvidedKey);
$("#start-prompt").addEventListener("click", () => send({ type: "startPrompt" }));
$("#end-prompt").addEventListener("click", () => send({ type: "endPrompt" }));
$("#next-prompt").addEventListener("click", () => send({ type: "nextPrompt" }));
$("#end-round").addEventListener("click", () => send({ type: "endRound" }));
$("#new-round").addEventListener("click", openSetup);
$("#finish-game").addEventListener("click", () => send({ type: "finishGame" }));
$("#new-game").addEventListener("click", () => window.location.reload());
$("#student-wait-button").addEventListener("click", () => { if (currentSnapshot) renderStudent(currentSnapshot); });

setBoardSelect();
const roomFromUrl = new URLSearchParams(location.search).get("room");
if (roomFromUrl) {
  showScreen("join");
  $("#join-code").value = roomFromUrl.toUpperCase();
}
