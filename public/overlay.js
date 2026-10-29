const questionEl = document.querySelector("#question");
const statusEl = document.querySelector("#status");
const meanValueEl = document.querySelector("#mean-value");
const countEl = document.querySelector("#count");
const bucketsEl = document.querySelector("#buckets");
const outcomeEl = document.querySelector("#outcome");
const leadersEl = document.querySelector("#leaders");
const card = document.querySelector(".card");
const bucketNodes = [];
for (let i = 0; i < 10; i++) {
  const bucket = document.createElement("div");
  bucket.className = "bucket";
  const count = document.createElement("div");
  count.className = "bucket-count";
  const wrap = document.createElement("div");
  wrap.className = "bar-wrap";
  const bar = document.createElement("div");
  bar.className = "bar";
  wrap.append(bar);
  bucket.append(count, wrap);
  bucketsEl.append(bucket);
  bucketNodes.push({ count, bar });
}

function text(node, value) { node.textContent = value; }
function render(state) {
  text(questionEl, state.question || "Waiting for the next call");
  text(statusEl, state.status);
  statusEl.className = `status ${state.status === "OPEN" ? "open" : state.status === "LOCKED" ? "locked" : state.status === "RESOLVED YES" ? "resolved" : state.status === "RESOLVED NO" ? "no" : "idle"}`;
  text(meanValueEl, state.mean === null ? "—" : `${Math.round(state.mean * 100)}`);
  text(countEl, String(state.callCount));
  const peak = Math.max(1, ...state.histogram);
  bucketNodes.forEach(({ count, bar }, index) => {
    const amount = state.histogram[index] || 0;
    text(count, String(amount));
    bar.style.height = `${Math.max(amount ? 6 : 2, amount / peak * 100)}%`;
  });
  const resolved = state.revealOutcome !== null;
  card.classList.toggle("reveal", resolved);
  outcomeEl.classList.toggle("no", state.revealOutcome === 0);
  leadersEl.replaceChildren();
  if (resolved) {
    const heading = document.createElement("header");
    heading.className = "leaders-heading";
    const title = document.createElement("div");
    title.className = "leaders-title";
    title.textContent = "Sharpest callers";
    const hint = document.createElement("div");
    hint.className = "leaders-hint";
    hint.textContent = "Lower is better";
    heading.append(title, hint);
    leadersEl.append(heading);
    state.leaders.slice(0, 5).forEach((leader) => {
      const row = document.createElement("div");
      row.className = "leader";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = leader.viewer;
      const score = document.createElement("span");
      score.className = "score";
      score.textContent = `Brier ${leader.mean.toFixed(3)} · ${leader.count} calls`;
      row.append(name, score);
      leadersEl.append(row);
    });
  }
}
function connect() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}/ws`);
  socket.addEventListener("message", (event) => {
    try { render(JSON.parse(event.data)); } catch (error) { console.error("Invalid overlay update", error); }
  });
  socket.addEventListener("close", () => setTimeout(connect, 1500));
}
connect();
