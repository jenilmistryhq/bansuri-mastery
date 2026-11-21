import { h } from "../util.js";
import { playNote } from "../core/audio.js";
import { codeOf, nameOf } from "../core/theory.js";
import { listenMic } from "../core/listen.js";
import { holdTracker, noteSequencer } from "../core/listen.js";

// Each renderer returns { el, destroy?() }.
// It calls onAnswer({ passed, points }) when the learner submits.
// The question area includes the prompt, input, and a Check button.

export function renderQuestion(q, onAnswer, opts) {
  const type = QUESTION_TYPES[q.type];
  if (!type) return { el: h("p", { class: "room-q-missing" }, "Unknown question type: " + q.type) };
  return type(q, onAnswer, opts || {});
}

const QUESTION_TYPES = {
  confirm(q, onAnswer) {
    const btn = h("button", { type: "button", class: "btn primary room-check" }, q.prompt || "I understand");
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.classList.add("room-answered");
      onAnswer({ passed: true, points: q.points || 0 });
    });
    return { el: h("div", { class: "room-question room-q-confirm" }, btn) };
  },

  choice(q, onAnswer) {
    let selected = null, locked = false;
    const feedback = h("p", { class: "room-feedback", hidden: true });
    const options = q.options.map((opt, i) => {
      const btn = h("button", { type: "button", class: "room-option", dataset: { idx: String(i) } },
        h("span", { class: "room-option-letter" }, String.fromCharCode(65 + i)),
        h("span", null, opt.text));
      btn.addEventListener("click", () => {
        if (locked) return;
        options.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selected = i;
        check.disabled = false;
      });
      return btn;
    });
    const check = h("button", { type: "button", class: "btn primary room-check", disabled: true }, "Check answer");
    check.addEventListener("click", () => {
      if (selected === null || locked) return;
      const opt = q.options[selected];
      const correct = !!opt.right;
      if (correct) {
        locked = true;
        options[selected].classList.add("room-correct");
        check.disabled = true;
        feedback.textContent = opt.yes || q.yes || "Correct!";
        feedback.className = "room-feedback room-feedback-right";
        feedback.hidden = false;
        onAnswer({ passed: true, points: q.points || 10 });
      } else {
        options[selected].classList.add("room-wrong");
        setTimeout(() => options[selected].classList.remove("room-wrong"), 600);
        feedback.textContent = opt.why || opt.no || q.no || "Not quite. Try again.";
        feedback.className = "room-feedback room-feedback-wrong";
        feedback.hidden = false;
        onAnswer({ passed: false, points: 0 });
      }
    });
    return {
      el: h("div", { class: "room-question room-q-choice" },
        q.prompt ? h("p", { class: "room-prompt" }, q.prompt) : null,
        h("div", { class: "room-options" }, options),
        feedback, check)
    };
  },

  type(q, onAnswer) {
    let locked = false;
    const feedback = h("p", { class: "room-feedback", hidden: true });
    const input = h("input", { type: "text", class: "input room-type-input", placeholder: "Type your answer...", autocomplete: "off", spellcheck: "false" });
    const check = h("button", { type: "button", class: "btn primary room-check" }, "Check answer");
    function tryAnswer() {
      if (locked) return;
      const val = input.value.trim();
      if (!val) return;
      const accept = (q.accept || [q.answer]).map(a => String(a).toLowerCase().trim());
      const correct = accept.includes(val.toLowerCase());
      if (correct) {
        locked = true;
        input.disabled = true;
        check.disabled = true;
        input.classList.add("room-correct");
        feedback.textContent = q.yes || "Correct!";
        feedback.className = "room-feedback room-feedback-right";
        feedback.hidden = false;
        onAnswer({ passed: true, points: q.points || 10 });
      } else {
        input.classList.add("room-wrong");
        setTimeout(() => input.classList.remove("room-wrong"), 600);
        feedback.textContent = q.no || "Not quite. Try again.";
        feedback.className = "room-feedback room-feedback-wrong";
        feedback.hidden = false;
        onAnswer({ passed: false, points: 0 });
      }
    }
    check.addEventListener("click", tryAnswer);
    input.addEventListener("keydown", e => { if (e.key === "Enter") tryAnswer(); });
    return {
      el: h("div", { class: "room-question room-q-type" },
        q.prompt ? h("p", { class: "room-prompt" }, q.prompt) : null,
        h("div", { class: "room-type-row" }, input, check),
        feedback)
    };
  },

  hold(q, onAnswer) {
    let unsub = null, locked = false, started = false;
    const seconds = q.seconds || 4, cents = q.cents || 30;
    const target = q.target !== undefined ? q.target : null;
    const bar = h("div", { class: "room-holdbar" }, h("div", { class: "room-holdbar-fill" }));
    const fill = bar.firstChild;
    const meter = target !== null ? h("div", { class: "room-pitch-meter" },
      h("span", { class: "room-pitch-label" }, "Flat"),
      h("div", { class: "room-pitch-track" },
        h("div", { class: "room-pitch-center" }),
        h("div", { class: "room-pitch-needle" })),
      h("span", { class: "room-pitch-label" }, "Sharp")) : null;
    const centsEl = target !== null ? h("p", { class: "room-pitch-cents" }) : null;
    const status = h("p", { class: "room-hold-status" }, "Press Start and hold " + (target !== null ? codeOf(target) : "any steady note") + " for " + seconds + " seconds.");
    const btn = h("button", { type: "button", class: "btn primary room-check" }, "Start listening");
    const tracker = holdTracker({ target, seconds, cents });
    btn.addEventListener("click", async () => {
      if (locked || started) return;
      started = true;
      btn.disabled = true;
      status.textContent = "Listening... play now.";
      try {
        unsub = await listenMic(r => {
          const st = tracker.feed(r);
          const pct = Math.min(100, Math.round(st.held / seconds * 100));
          fill.style.width = pct + "%";
          if (meter && r && r.semi !== null) {
            const off = (r.semi - target) * 100;
            const needle = meter.querySelector(".room-pitch-needle");
            needle.style.left = Math.max(0, Math.min(100, 50 + off)) + "%";
            needle.classList.toggle("in-tune", Math.abs(off) <= cents);
            centsEl.textContent = (off >= 0 ? "+" : "") + Math.round(off) + " cents";
          }
          if (st.ok) status.textContent = "Holding... " + st.held.toFixed(1) + " s / " + seconds + " s";
          else if (st.held > 0) status.textContent = "Lost it - start again.";
          if (st.done && !locked) {
            locked = true;
            if (unsub) { unsub(); unsub = null; }
            fill.style.width = "100%";
            status.textContent = "Held for " + seconds + " seconds!";
            bar.classList.add("room-holdbar-done");
            onAnswer({ passed: true, points: q.points || 20 });
          }
        });
      } catch (e) {
        status.textContent = "Microphone not available.";
        btn.disabled = false;
        started = false;
      }
    });
    return {
      el: h("div", { class: "room-question room-q-hold" },
        q.prompt ? h("p", { class: "room-prompt" }, q.prompt) : null,
        bar, meter, centsEl, status, btn),
      destroy() { if (unsub) unsub(); }
    };
  },

  play(q, onAnswer) {
    let unsub = null, locked = false, started = false;
    const phrase = q.phrase || [];
    const status = h("p", { class: "room-hold-status" }, "Press Start and play: " + phrase.map(n => codeOf(n)).join(" "));
    const progress = h("div", { class: "room-play-progress" });
    const btn = h("button", { type: "button", class: "btn primary room-check" }, "Start listening");
    btn.addEventListener("click", async () => {
      if (locked || started) return;
      started = true;
      btn.disabled = true;
      status.textContent = "Listening... play the phrase now.";
      const seq = noteSequencer({ phrase, reps: q.reps || 1 });
      try {
        unsub = await listenMic(r => {
          const st = seq.feed(r);
          const dots = phrase.map((n, i) => {
            const done = i < st.matched;
            const current = i === st.matched;
            return h("span", { class: "room-play-dot" + (done ? " done" : "") + (current ? " current" : "") }, codeOf(n));
          });
          progress.replaceChildren(...dots);
          if (st.done && !locked) {
            locked = true;
            if (unsub) { unsub(); unsub = null; }
            status.textContent = "Phrase complete!";
            onAnswer({ passed: true, points: q.points || 20 });
          }
        });
      } catch (e) {
        status.textContent = "Microphone not available.";
        btn.disabled = false;
        started = false;
      }
    });
    return {
      el: h("div", { class: "room-question room-q-play" },
        q.prompt ? h("p", { class: "room-prompt" }, q.prompt) : null,
        progress, status, btn),
      destroy() { if (unsub) unsub(); }
    };
  },

  ear(q, onAnswer) {
    let locked = false, round = 0;
    const notes = q.notes || [0, 2, 4, 7];
    const count = q.count || 5;
    const pass = q.pass || Math.ceil(count * 0.7);
    let right = 0, total = 0;
    const feedback = h("p", { class: "room-feedback", hidden: true });
    const score = h("p", { class: "room-ear-score" });
    const host = h("div", { class: "room-ear-options" });
    const status = h("p", { class: "room-hold-status" });
    const replayWrap = h("div", { class: "room-ear-replay", hidden: true });

    function nextRound() {
      if (round >= count) {
        const passed = right >= pass;
        locked = true;
        score.textContent = right + " / " + count + " correct" + (passed ? " - passed!" : " - need " + pass + " to pass.");
        feedback.textContent = passed ? "Well done!" : "Keep practising. You need " + pass + " correct.";
        feedback.className = "room-feedback " + (passed ? "room-feedback-right" : "room-feedback-wrong");
        feedback.hidden = false;
        onAnswer({ passed, points: passed ? (q.points || 20) : 0 });
        return;
      }
      const target = notes[Math.floor(Math.random() * notes.length)];
      status.textContent = "Round " + (round + 1) + " of " + count + ". Listen...";
      score.textContent = right + " / " + total + " correct so far";
      host.replaceChildren();
      replayWrap.hidden = true;
      setTimeout(() => {
        try { playNote(target, 1.5); } catch (e) { /* audio unavailable */ }
        setTimeout(() => {
          status.textContent = "Which note was that?";
          const replay = h("button", { type: "button", class: "btn ghost small" }, "Play again");
          replay.addEventListener("click", () => { try { playNote(target, 1.5); } catch (e) {} });
          replayWrap.replaceChildren(replay);
          replayWrap.hidden = false;
          host.replaceChildren(...notes.map(n => {
            const btn = h("button", { type: "button", class: "room-option" }, codeOf(n), " ", h("span", { class: "small muted" }, nameOf(n)));
            btn.addEventListener("click", () => {
              if (locked) return;
              replayWrap.hidden = true;
              total++;
              round++;
              if (n === target) {
                right++;
                btn.classList.add("room-correct");
              } else {
                btn.classList.add("room-wrong");
                host.querySelector("[class*=room-option]:nth-child(" + (notes.indexOf(target) + 1) + ")")?.classList.add("room-correct");
              }
              setTimeout(nextRound, 800);
            });
            return btn;
          }));
        }, 1800);
      }, 400);
    }
    nextRound();
    return {
      el: h("div", { class: "room-question room-q-ear" },
        q.prompt ? h("p", { class: "room-prompt" }, q.prompt) : null,
        status, replayWrap, host, score, feedback)
    };
  },
};
