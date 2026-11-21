// Interval trainer (#/skills/<skill>/interval): hear two notes, name the interval.
// No microphone needed. The first note is always Sa; the second is a random interval
// from the chosen difficulty level.
import { h } from "../util.js";
import { playNote, stopAll } from "../core/audio.js";
import { codeOf, nameOf } from "../core/theory.js";
import { emitLive } from "../core/listen.js";

const LEVELS = {
  easy:   [2, 4, 7, 12],
  medium: [2, 4, 5, 7, 9, 11, 12],
  hard:   [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};
const TOTAL = 10;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function playInterval(semi, onDone) {
  stopAll();
  playNote(0, 0.7);
  const timer = setTimeout(() => { playNote(semi, 0.9); if (onDone) onDone(); }, 700);
  return timer;
}

export function intervalTrainer() {
  let level = "easy";
  let question = 0, correct = 0, answer = null, timer = 0, answered = false;

  // --- Level chips ---
  const levelChips = h("div", { class: "chips iv-levels", role: "group", "aria-label": "Difficulty" });
  const drawLevels = () => levelChips.querySelectorAll("button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.v === level)));
  for (const [k, label] of [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]) {
    levelChips.append(h("button", {
      type: "button", class: "chipbtn", dataset: { v: k },
      onclick: () => { level = k; drawLevels(); reset(); },
    }, label));
  }

  // --- Score ---
  const score = h("span", { class: "iv-score" });
  const updateScore = () => { score.textContent = question > 0 ? correct + " of " + question + " correct" : ""; };

  // --- Choice buttons ---
  const choices = h("div", { class: "iv-choices" });

  // --- Feedback + message ---
  const msg = h("p", { class: "iv-msg", "aria-live": "polite" },
    "Pick a level and press New question. Two notes play: Sa first, then another. Name the second note.");

  // --- Action buttons ---
  const newBtn = h("button", { type: "button", class: "btn primary iv-new" }, "New question");
  const hearBtn = h("button", { type: "button", class: "btn iv-hear", disabled: true }, "Hear again");

  function buildChoices(pool) {
    choices.replaceChildren();
    const sorted = pool.slice().sort((a, b) => a - b);
    for (const semi of sorted) {
      const btn = h("button", {
        type: "button", class: "iv-choice", dataset: { semi: String(semi) },
        onclick: () => judge(semi),
      }, h("b", null, codeOf(semi)), h("span", { class: "small muted" }, nameOf(semi)));
      choices.append(btn);
    }
  }

  function judge(semi) {
    if (answered) return;
    answered = true;
    question++;
    const ok = semi === answer;
    if (ok) correct++;
    choices.querySelectorAll(".iv-choice").forEach(btn => {
      const s = Number(btn.dataset.semi);
      if (s === answer) btn.classList.add("iv-correct");
      if (s === semi && !ok) btn.classList.add("iv-wrong");
      btn.disabled = true;
    });
    updateScore();
    msg.textContent = ok
      ? "Correct! That was " + nameOf(answer) + " (" + codeOf(answer) + ")."
      : "It was " + nameOf(answer) + " (" + codeOf(answer) + "), not " + nameOf(semi) + ".";

    if (question >= TOTAL) {
      newBtn.textContent = "Play again";
      msg.textContent += " Round done: " + correct + " of " + TOTAL + " correct.";
      emitLive({ type: "earTest", right: correct, total: TOTAL });
    }
  }

  function ask() {
    if (question >= TOTAL) reset();
    const pool = LEVELS[level];
    answer = pick(pool);
    answered = false;
    buildChoices(pool);
    hearBtn.disabled = false;
    newBtn.disabled = true;
    msg.textContent = "Listen...";
    clearTimeout(timer);
    timer = playInterval(answer, () => {
      msg.textContent = "Which note was that?";
      newBtn.disabled = false;
    });
  }

  function replay() {
    if (answer === null) return;
    clearTimeout(timer);
    timer = playInterval(answer);
  }

  function reset() {
    question = 0; correct = 0; answer = null; answered = false;
    clearTimeout(timer);
    stopAll();
    updateScore();
    choices.replaceChildren();
    hearBtn.disabled = true;
    newBtn.textContent = "New question";
    newBtn.disabled = false;
    msg.textContent = "Press New question to hear two notes.";
  }

  newBtn.addEventListener("click", ask);
  hearBtn.addEventListener("click", replay);
  drawLevels();
  updateScore();

  const el = h("div", { class: "iv-tool" },
    levelChips,
    h("div", { class: "iv-controls" }, newBtn, hearBtn, score),
    choices,
    msg);

  return {
    el,
    destroy() { clearTimeout(timer); stopAll(); },
  };
}
