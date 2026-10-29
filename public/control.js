const form = document.querySelector("#question-form");
const questionInput = document.querySelector("#question");
const current = document.querySelector("#current");
const feedback = document.querySelector("#feedback");
const buttons = [...document.querySelectorAll("button")];

async function send(action) {
  buttons.forEach((button) => { button.disabled = true; });
  feedback.textContent = "";
  try {
    const response = await fetch("/api/control", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action)
    });
    const result = await response.json();
    feedback.textContent = result.message;
    if (!response.ok) feedback.classList.add("error"); else feedback.classList.remove("error");
  } catch {
    feedback.textContent = "Could not reach Call It.";
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = questionInput.value.trim();
  if (text) send({ type: "question", text });
});
document.querySelector("#lock").addEventListener("click", () => send({ type: "lock" }));
document.querySelector("#yes").addEventListener("click", () => send({ type: "resolve", outcome: 1 }));
document.querySelector("#no").addEventListener("click", () => send({ type: "resolve", outcome: 0 }));
document.querySelector("#cancel").addEventListener("click", () => send({ type: "cancel" }));
const scheme = location.protocol === "https:" ? "wss" : "ws";
const socket = new WebSocket(`${scheme}://${location.host}/ws`);
socket.addEventListener("message", (event) => {
  const state = JSON.parse(event.data);
  current.textContent = state.question ? `${state.status}: ${state.question} · ${state.callCount} calls` : "No question open";
});
socket.addEventListener("close", () => { document.querySelector("#connection").textContent = "OFFLINE"; });
