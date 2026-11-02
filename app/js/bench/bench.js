// Practice Bench UI. mountBench(container, opts) -> { destroy, setTab, loadNotation, stopAll }
import { getSettings, setSettings, onSettings } from "../core/settings.js";
import { LETTERS, NAME, DEVA, WEST, BASE, DIFF, codeOf, octName, fingOf, lessonFor, hzOf, westOf, letterOf, devaNotation } from "../core/theory.js";
import { ac, makeVoice, playNote, tanpura, click, tablaBol, setTablaLevel } from "../core/audio.js";
import { parseNotation, buildEvents, analyzeRange, playEvents, PRESETS } from "../core/notation.js";
import { analyzeAudioBuffer, decodeAudioFile, compareToExpected, drawPitchPlot, tuningOffset, CHECK_PLANS } from "../core/pitch.js";
import { listenMic, emitLive } from "../core/listen.js";
import { holdMeter, echoGame, tapGame, micIntro, countdown } from "../core/live.js";

const BENCH_TABS = [["play", "Play along"], ["tones", "Long tones"], ["echo", "Play back"], ["rhythm", "Tala &amp; drone"], ["ear", "Ear quiz"], ["chart", "Fingering"], ["check", "Check my flute"], ["about", "About"]];
const BENCH_HOLE_X = [430, 505, 580, 690, 765, 840];
const BENCH_TALAS = {
  teentaal: { name: "Teentaal (16)", div: [4, 4, 4, 4], marks: ["X", "2", "0", "3"], bols: "Dha Dhin Dhin Dha Dha Dhin Dhin Dha Dha Tin Tin Ta Ta Dhin Dhin Dha" },
  keherwa: { name: "Keherwa (8)", div: [4, 4], marks: ["X", "0"], bols: "Dha Ge Na Ti Na Ka Dhi Na" },
  dadra: { name: "Dadra (6)", div: [3, 3], marks: ["X", "0"], bols: "Dha Dhi Na Dha Ti Na" },
  rupak: { name: "Rupak (7)", div: [3, 2, 2], marks: ["0", "1", "2"], bols: "Tin Tin Na Dhi Na Dhi Na", note: "Rupak begins on khali: beat 1 is both sam and khali. Books number its talis differently (1, 2 or 2, 3)." },
  jhaptaal: { name: "Jhaptaal (10)", div: [2, 3, 2, 3], marks: ["X", "2", "0", "3"], bols: "Dhi Na Dhi Dhi Na Ti Na Dhi Dhi Na" },
  ektaal: { name: "Ektaal (12)", div: [2, 2, 2, 2, 2, 2], marks: ["X", "0", "2", "0", "3", "4"], bols: "Dhin Dhin DhaGe TiRaKiTa Tu Na Kat Ta DhaGe TiRaKiTa Dhi Na" }
};
const BENCH_EAR_LEVELS = { 2: [0, 7], 3: [0, 2, 4, 7], 4: [0, 2, 4, 5, 7, 9, 11], 6: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
let benchMounts = 0;

function benchGet(k, d) { try { const v = localStorage.getItem("bansuri.bench." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function benchSet(k, v) { try { localStorage.setItem("bansuri.bench." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
function benchEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c])); }
function pad2(n) { return String(n).padStart(2, "0"); }
function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function benchTemplate(uid, o) {
  const tabsHtml = o.tabs.map(([k, label], i) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${i === 0}">${label}</button>`).join("");
  const has = k => o.tabs.some(t => t[0] === k);
  const lede = o.heading ? `
    <div class="bb-lede">
      <span class="bb-eyebrow">Bansuri Mastery &middot; tool</span>
      <h1>Bansuri Practice Bench</h1>
      <p class="bb-muted">Finger the holes, choose your breath, and hear what a correctly played 6-hole bansuri should sound like. Play any sargam from the curriculum, run the tanpura and tala, quiz your ear, and check recordings of your own flute against the chart.</p>
    </div>` : "";
  const settingsHtml = o.settings ? `
  <details class="bb-flutebox">
    <summary><span class="bb-small bb-muted">Your flute</span> <b class="bb-mono" data-ref="fluteSum"></b> <span class="bb-small bb-link">Change</span></summary>
    <div class="bb-settings" aria-label="Your flute">
      <label class="bb-field">Your flute's Sa <select data-ref="saNote"></select></label>
      <label class="bb-field">Octave <select data-ref="saOct"><option value="4">4 (bass flutes)</option><option value="5">5 (medium flutes)</option></select></label>
      <label class="bb-field">A4 tuning (Hz) <input data-ref="a4" type="number" min="415" max="466" step="0.1"></label>
      <label class="bb-field">Volume <input data-ref="vol" type="range" min="0" max="100"></label>
    </div>
  </details>` : "";
  const header = lede || settingsHtml ? `<header class="bb-top">${lede}${settingsHtml}</header>` : "";
  const flute = o.flute ? `
  <section class="bb-instrument" aria-label="Flute">
    <svg class="bb-flute" data-ref="fluteSvg" viewBox="0 0 1000 145" role="group" aria-label="Bansuri: the blowing hole on the left and six finger holes. Each hole is a button: open, closed or half."></svg>
    <div class="bb-readout">
      <div class="bb-readmain">
        <div class="bb-notebig"><span class="bb-name" data-ref="rName">Sa</span><span class="bb-deva" data-ref="rDeva">सा</span><span class="bb-mono" data-ref="rCode">S</span></div>
        <div class="bb-facts" data-ref="rFacts"></div>
        <div data-ref="rStatus"></div>
      </div>
      <div class="bb-controls">
        <div class="bb-seg" role="group" aria-label="Breath">
          <button type="button" data-ref="reg1" aria-pressed="true">Gentle air &middot; reg. 1</button>
          <button type="button" data-ref="reg2" aria-pressed="false">Faster air &middot; reg. 2</button>
        </div>
        <button type="button" class="bb-btn bb-primary bb-blow" data-ref="blowBtn">Hold to blow</button>
      </div>
    </div>
    ${o.compact ? `<p class="bb-small bb-muted">Tap a hole on the flute to cover it (tap again: half, again: open), then press and hold <b>Hold to blow</b>.</p>` : `<details class="bb-howto" data-ref="howto" open>
      <summary><b>How to play this flute</b></summary>
      <ol>
        <li><b>Cover the holes.</b> Tap a hole on the flute to put a finger on it. Tap it again to half-cover it, and once more to open it. Hole 1 is the one nearest the blowing hole; the top hand covers holes 1-3 and the bottom hand holes 4-6.</li>
        <li><b>Choose your breath.</b> <i>Gentle air</i> plays the lower register; <i>Faster air</i> overblows into the upper register with the same fingers.</li>
        <li><b>Blow.</b> Press and hold <b>Hold to blow</b> (or the Space key). Change holes while you blow to move from note to note, just as on a real flute.</li>
        <li><b>Read the note.</b> Its name, sargam, pitch and the lesson that teaches it appear below the flute. Start with Sa: cover holes 1, 2 and 3 with gentle air.</li>
      </ol>
      <p class="bb-small bb-muted">Keyboard: Tab to a hole and press Enter or Space, or use keys <span class="bb-mono">1-6</span> for the holes, <span class="bb-mono">Q</span>/<span class="bb-mono">W</span> for the breath, and hold <span class="bb-mono">Space</span> to blow. The flute is shown with the blowing hole on the left (pointing right).</p>
    </details>`}
  </section>` : "";
  const panels = [];
  if (has("chart")) panels.push(`
  <section class="bb-panel" data-panel="chart" hidden>
    <div class="bb-card">
      <h2>Master fingering chart</h2>
      <p class="bb-muted bb-small">From the curriculum's conventions file. Pitches follow your Sa setting, in equal temperament. Click a row to set the flute and hear the note.</p>
      <div class="bb-tablewrap"><table><thead><tr><th>Sargam</th><th>Name</th><th>Fingering 1-6</th><th>Breath</th><th>Western</th><th>Hz</th><th>Difficulty</th><th>Lesson</th></tr></thead><tbody data-ref="chartBody"></tbody></table></div>
      <p class="bb-small bb-muted">Above <span class="bb-mono">M'</span> the 3rd register begins. Its fingerings differ from flute to flute, so they are not simulated here. Map them on your own flute with the <em>Check my flute</em> tab (L22).</p>
    </div>
  </section>`);
  if (has("play")) panels.push(`
  <section class="bb-panel" data-panel="play" hidden>
    <div class="bb-grid2">
      <div class="bb-card">
        <h2>Play sargam notation</h2>
        <div class="bb-row">
          <label class="bb-field bb-grow">Preset <select data-ref="preset"></select></label>
          <div class="bb-field">Tempo (BPM) <span class="bb-stepper"><button type="button" class="bb-btn bb-tiny" data-ref="slower" aria-label="Slower">-</button><input data-ref="bpm" type="number" min="30" max="220" value="72" aria-label="Tempo in BPM"><button type="button" class="bb-btn bb-tiny" data-ref="faster" aria-label="Faster">+</button></span></div>
          <label class="bb-check"><input type="checkbox" data-ref="clickOn"> Beat click</label>
          <label class="bb-check"><input type="checkbox" data-ref="countIn" checked> Count-in</label>
          <label class="bb-check"><input type="checkbox" data-ref="droneWithPlay"> Tanpura</label>
        </div>
        <div class="bb-row">
          <label class="bb-field">Repeat <select data-ref="loopSel"><option value="once">Play once</option><option value="all">Loop the piece</option></select></label>
          <label class="bb-check"><input type="checkbox" data-ref="checkMe"> I play, the mic checks</label>
          <label class="bb-check" title="A second flute plays the tune an octave lower, as company (not while the mic checks)"><input type="checkbox" data-ref="duetOn"> Duet: a second flute below</label>
        </div>
        <label class="bb-field" for="${uid}-notation">Notation</label>
        <details class="bb-help">
          <summary>How to write notation</summary>
          <dl class="bb-syntax">
            <dt>S R G m P D N</dt><dd>shuddha swaras (<span class="bb-mono">r g M d n</span> komal and tivra)</dd>
            <dt>.N &nbsp; S'</dt><dd>mandra (low) and taar (high) octave</dd>
            <dt>space</dt><dd>one beat per group</dd>
            <dt>SR</dt><dd>two notes in one beat</dd>
            <dt>-  _</dt><dd>hold the note; rest</dd>
            <dt>|  ||</dt><dd>bar line (the beat click accents the next beat); end</dd>
            <dt>{G}R</dt><dd>kan (grace note)</dd>
            <dt>G~R</dt><dd>meend (glide)</dd>
            <dt>G^</dt><dd>andolan (slow oscillation)</dd>
            <dt>,</dt><dd>breath</dd>
          </dl>
        </details>
        <textarea id="${uid}-notation" data-ref="notation" spellcheck="false"></textarea>
        <div class="bb-row">
          <button type="button" class="bb-btn bb-primary" data-ref="playBtn">Play</button>
          <button type="button" class="bb-btn" data-ref="stopBtn" disabled>Stop</button>
          <span class="bb-small bb-muted" data-ref="seqStatus" aria-live="polite"></span>
        </div>
        <p class="bb-small" data-ref="checkSum" aria-live="polite" hidden></p>
        <p class="bb-small bb-muted"><b>Play along:</b> tick "I play, the mic checks", and the app keeps the beat and drone while you play the melody; each note in the score turns green (right) or red (wrong), with a mark when it was early or late. <b>Repeat</b> can loop the piece or a single bar (tap a bar line in the score). Use <b>-</b> and <b>+</b> to work up the tempo. Space bar plays and stops.</p>
      </div>
      <div class="bb-card">
        <h2>Score and check</h2>
        <div class="bb-score" data-ref="score" aria-live="off"></div>
        <div class="bb-analysis" data-ref="analysis"></div>
        <p class="bb-small bb-muted">The range check uses the curriculum's rules: comfortable range <span class="bb-mono">.P</span> (lowest note) to <span class="bb-mono">G'</span>; <span class="bb-mono">M'</span> is the practical ceiling. Paste a song notation to see whether it fits your flute and which lesson unlocks it.</p>
      </div>
    </div>
  </section>`);
  if (has("tones")) panels.push(`
  <section class="bb-panel" data-panel="tones" hidden>
    <div class="bb-card">
      <h2>Long tones with live feedback</h2>
      <p class="bb-muted bb-small">Play into the microphone. The ring fills while your note stays steady and in tune; the bar shows flat or sharp (L07, L17).</p>
      <div class="bb-row">
        <label class="bb-field">Note <select data-ref="toneNote"><option value="any">Any steady note</option></select></label>
        <label class="bb-field">Hold <select data-ref="toneSecs"><option value="4">4 s</option><option value="8" selected>8 s</option><option value="12">12 s</option><option value="20">20 s</option></select></label>
        <label class="bb-field">Within <select data-ref="toneCents"><option value="30">30 cents (beginner)</option><option value="20" selected>20 cents</option><option value="10">10 cents (exact)</option></select></label>
      </div>
      <div data-ref="toneHost"></div>
    </div>
  </section>`);
  if (has("echo")) panels.push(`
  <section class="bb-panel" data-panel="echo" hidden>
    <div class="bb-card">
      <h2>Play it back</h2>
      <p class="bb-muted bb-small">Call and response, the way teachers teach: listen to a short phrase, then play it back on your flute. Two right in a row makes the next phrase longer.</p>
      <div data-ref="echoHost"></div>
    </div>
  </section>`);
  if (has("rhythm")) panels.push(`
  <section class="bb-panel" data-panel="rhythm" hidden>
    <div class="bb-grid2">
      <div class="bb-card">
        <h2>Tanpura</h2>
        <p class="bb-muted bb-small">A synthesised four-string tanpura tuned to your Sa (two octaves below the flute). Use it for long tones and intonation (L07, L17).</p>
        <div class="bb-row">
          <label class="bb-field">Tune for a raga <select data-ref="tanRaga"><option value="">Choose a raga</option><option value="pa">Pa: Yaman, Bhupali, Kafi, Khamaj, Bhimpalasi, Durga, Shivranjani</option><option value="ma">Ma: Malkauns, Hindol (no Pa); often Bageshri</option><option value="ni">Ni: Marwa, Puriya (no Pa)</option></select></label>
          <label class="bb-field">First string <select data-ref="tanFirst"><option value="pa">Pa (most ragas)</option><option value="ma">Ma (ragas without Pa)</option><option value="ni">Ni</option></select></label>
          <label class="bb-field">Speed <input data-ref="tanSpeed" type="range" min="60" max="140" value="100"></label>
          <label class="bb-field">Level <input data-ref="tanVol" type="range" min="0" max="100" value="55"></label>
        </div>
        <div class="bb-row"><button type="button" class="bb-btn bb-primary" data-ref="tanBtn" aria-pressed="false">Start tanpura</button></div>
      </div>
      <div class="bb-card">
        <h2>Tala metronome</h2>
        <div class="bb-row">
          <label class="bb-field">Tala <select data-ref="talaSel"></select></label>
          <label class="bb-field">Tempo (BPM) <input data-ref="talaBpm" type="number" min="20" max="300" value="80"></label>
          <label class="bb-field">Sound <select data-ref="talaSound"><option value="tabla">Tabla theka</option><option value="click">Clicks</option></select></label>
          <label class="bb-field">Tabla volume <input data-ref="tablaVol" type="range" min="0" max="100" value="85"></label>
          <button type="button" class="bb-btn bb-primary" data-ref="talaBtn">Start tala</button>
        </div>
        <div class="bb-beats" data-ref="beats"></div>
        <p class="bb-small bb-muted" data-ref="talaNote"></p>
        <p class="bb-small bb-muted"><b>Tabla theka</b> plays each bol shown under the beats on a synthesised tabla (the right drum is tuned to your Sa; sam is accented). <b>Clicks</b>: a deep stroke on sam (<span class="bb-mono">X</span>), a clap on tali (<span class="bb-mono">2</span>, <span class="bb-mono">3</span>...), a soft tap on khali (<span class="bb-mono">0</span>), light ticks elsewhere. The synthesis is a practice aid, not a real tabla. Thekas vary by gharana (L15).</p>
      </div>
      <div class="bb-card">
        <h2>Tap the beat</h2>
        <p class="bb-muted bb-small">Tap with the click to see whether you rush or drag. "Then two silent bars" tests the pulse you keep in your head (L06, L15).</p>
        <div data-ref="tapHost"></div>
      </div>
    </div>
  </section>`);
  if (has("check")) panels.push(`
  <section class="bb-panel" data-panel="check" hidden>
    <div class="bb-grid2">
      <div class="bb-card">
        <h2>Check a recording of your flute</h2>
        <p class="bb-muted bb-small">Record the notes with your phone's voice recorder: hold each note steadily for about 2 seconds, with a short silence between notes. Then choose what you played and upload the file. Nothing leaves your device: the analysis runs in this page.</p>
        <label class="bb-field">What did you play? <select data-ref="plan"></select></label>
        <label class="bb-field">Recording (any audio file your browser can open) <input type="file" data-ref="fileIn" accept="audio/*,video/*"></label>
        <p class="bb-small" data-ref="fileStatus"></p>
      </div>
      <div class="bb-card">
        <h2>Live: which note, how many cents</h2>
        <p class="bb-muted bb-small">The live tuner is part of Long tones now: choose "Any steady note" and play. It shows the note, how many cents flat or sharp, its Western name and Hz, and how clear the tone is.</p>
        <div class="bb-row"><button type="button" class="bb-btn bb-primary" data-ref="toTones">Open Long tones</button></div>
      </div>
    </div>
    <div class="bb-card" data-ref="resultCard" hidden>
      <h2>Results</h2>
      <div class="bb-small" data-ref="tuneNote" hidden></div>
      <canvas class="bb-plot" data-ref="plot" aria-label="Pitch over time, with horizontal lines for each swara"></canvas>
      <div class="bb-tablewrap"><table><thead><tr><th>#</th><th>Expected</th><th>Heard</th><th>Off by</th><th>Held</th><th>Verdict</th></tr></thead><tbody data-ref="resBody"></tbody></table></div>
      <p class="bb-small bb-muted">Verdicts: within &plusmn;10 cents is in tune; &plusmn;25 is close (fine for a beginner); more means adjust angle, air speed or half-hole coverage (L17, TS-05). The check uses equal temperament. Raga intonation can deliberately differ (L19, L33).</p>
    </div>
  </section>`);
  if (has("ear")) panels.push(`
  <section class="bb-panel" data-panel="ear" hidden>
    <div class="bb-card">
      <h2>Swara recognition quiz</h2>
      <p class="bb-muted bb-small">You hear Sa, then a second note. Name the second note. These are the levels of EX-EAR. Pass mark there: 18/20 for Levels 2-3, 16/20 for Level 4, 17/20 for Level 6.</p>
      <div class="bb-row">
        <label class="bb-field">Level <select data-ref="earLevel"><option value="2">Level 2: Sa or Pa</option><option value="3">Level 3: S R G P</option><option value="4">Level 4: all shuddha swaras</option><option value="6">Level 6: all 12 notes</option></select></label>
        <label class="bb-check"><input type="checkbox" data-ref="earDrone"> Tanpura under the quiz</label>
        <button type="button" class="bb-btn bb-primary" data-ref="earNext">New question</button>
        <button type="button" class="bb-btn" data-ref="earAgain">Hear again</button>
      </div>
      <div class="bb-quiz" data-ref="earOpts"></div>
      <p data-ref="earMsg" aria-live="polite">Press New question.</p>
      <p class="bb-small"><span data-ref="earScore">Score: 0 / 0</span> &middot; <button type="button" class="bb-btn bb-tiny" data-ref="earReset">Reset score</button></p>
    </div>
  </section>`);
  if (has("about")) panels.push(`
  <section class="bb-panel" data-panel="about" hidden>
    <div class="bb-grid2">
      <div class="bb-card">
        <h2>This bench can confirm</h2>
        <ul class="bb-tidy">
          <li>Which note every fingering in the master chart gives, in both breaths, and its exact pitch for your flute's Sa.</li>
          <li>How every curriculum melody, alankar, scale and raga phrase should sound, at any tempo.</li>
          <li>Whether a song notation fits your flute's range, which half-holes it needs, and which lesson unlocks it.</li>
          <li>Your Sa on Day 0, and whether each note of your real flute is in tune, from a recording.</li>
          <li>The beat structure of keherwa, dadra, teentaal, rupak, jhaptaal and ektaal, and the tihai examples.</li>
          <li>Your progress through EX-EAR Levels 2, 3, 4 and 6.</li>
        </ul>
      </div>
      <div class="bb-card">
        <h2>It cannot confirm</h2>
        <ul class="bb-tidy">
          <li><b>Your tone.</b> The flute sound here is synthesised. It shows pitch and melody, not what a beautiful bansuri tone sounds like. Use the listening library for that.</li>
          <li><b>Your embouchure, posture and hands.</b> Use a mirror, video and a teacher (L02, L04, L08).</li>
          <li><b>Raga intonation and ornament style.</b> Meend, kan and andolan here are mechanical sketches; masters bend notes in ways no tuner measures.</li>
          <li><b>3rd-register fingerings</b> (flute-specific, L22).</li>
          <li><b>Rhythm feel.</b> A metronome keeps time; it cannot tell you whether a phrase breathes musically.</li>
        </ul>
      </div>
    </div>
  </section>`);
  return `${header}${flute}
  <nav class="bb-tabs" role="tablist" aria-label="Workbench">${tabsHtml}</nav>
  ${panels.join("")}`;
}

export function mountBench(container, opts) {
  opts = opts || {};
  const uid = "bb" + (++benchMounts);
  const compact = !!opts.compact;
  const tabs = BENCH_TABS.filter(([k]) => !opts.tabs || opts.tabs.indexOf(k) >= 0);
  const o = { tabs, compact, heading: opts.heading !== undefined ? !!opts.heading : !compact, settings: !compact, flute: opts.flute !== false };
  const root = document.createElement("div");
  root.className = "bb-bench" + (compact ? " bb-compact" : "");
  root.innerHTML = benchTemplate(uid, o);
  container.appendChild(root);
  const q = r => root.querySelector(`[data-ref="${r}"]`);
  const has = k => tabs.some(t => t[0] === k);
  const cleanups = [];
  let destroyed = false, startedTan = false;
  const listen = (el, ev, fn, o2) => { if (!el) return; el.addEventListener(ev, fn, o2); cleanups.push(() => el.removeEventListener(ev, fn, o2)); };

  // ---------- Flute ----------
  let holes = ["X", "X", "X", "O", "O", "O"], reg = 1, liveVoice = null;
  function buildSvg() {
    if (!o.flute) return;
    // A bamboo flute seen from above: a rounded cylinder (highlight on top, shade below, faint grain),
    // raised nodes, silk thread bindings at the ends, holes with depth, and fingertips that come down
    // onto the holes they close (a half-holed finger slides off half the hole). Holes are numbered below,
    // with the hand that covers them.
    const s = [], id = k => uid + "-" + k, Y = 50, R = 21, top = Y - R, bot = Y + R;
    s.push("<defs>");
    s.push(`<linearGradient id="${id("bam")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--bamboo-deep)"/><stop offset="0.12" style="stop-color:var(--bamboo)"/><stop offset="0.3" style="stop-color:#f3dc9a"/><stop offset="0.45" style="stop-color:var(--bamboo)"/><stop offset="0.85" style="stop-color:var(--bamboo-deep)"/><stop offset="1" style="stop-color:#4a3511"/></linearGradient>`);
    s.push(`<radialGradient id="${id("hole")}" cx="0.45" cy="0.4" r="0.6"><stop offset="0" style="stop-color:#000"/><stop offset="0.7" style="stop-color:var(--hole)"/><stop offset="1" style="stop-color:#5a3d15"/></radialGradient>`);
    s.push(`<linearGradient id="${id("skin")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--finger-edge)"/><stop offset="0.3" style="stop-color:var(--finger)"/><stop offset="0.55" style="stop-color:#e2ab8c"/><stop offset="1" style="stop-color:var(--finger-edge)"/></linearGradient>`);
    s.push(`<linearGradient id="${id("cord")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:#5c1a1a"/><stop offset="0.35" style="stop-color:#b03a3a"/><stop offset="1" style="stop-color:#4a1212"/></linearGradient>`);
    // Fingers fade in from above, so they read as hands reaching down rather than posts.
    s.push(`<linearGradient id="${id("fadeg")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.35" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="${id("fade")}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="${bot + 30}"><rect x="0" y="0" width="1000" height="${bot + 30}" fill="url(#${id("fadeg")})"/></mask>`);
    s.push(`<filter id="${id("soft")}" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>`);
    s.push(`<filter id="${id("fsh")}" x="-50%" y="-20%" width="200%" height="150%"><feGaussianBlur stdDeviation="2.5"/></filter>`);
    s.push("</defs>");
    // Shadow, body, end grain.
    s.push(`<ellipse cx="500" cy="${bot + 10}" rx="470" ry="8" fill="#000" opacity="0.35" filter="url(#${id("soft")})"/>`);
    s.push(`<rect x="20" y="${top}" width="960" height="${2 * R}" rx="${R}" fill="url(#${id("bam")})"/>`);
    // Grain: faint long lines along the bamboo.
    [[0.2, 0.18], [0.62, 0.12], [0.78, 0.1]].forEach(([f, op]) => s.push(`<path d="M60 ${top + 2 * R * f} H 940" stroke="#fff" stroke-width="0.8" opacity="${op}"/>`));
    // Nodes: a raised ring, dark then light.
    [300, 640].forEach(x => s.push(`<rect x="${x - 3}" y="${top}" width="3" height="${2 * R}" fill="var(--bamboo-deep)" opacity="0.8"/><rect x="${x}" y="${top}" width="3" height="${2 * R}" fill="#f6e3a8" opacity="0.55"/>`));
    // Silk thread bindings near both ends, and the darker end grain.
    [[44, 30], [926, 30]].forEach(([x, w]) => {
      s.push(`<rect x="${x}" y="${top - 1}" width="${w}" height="${2 * R + 2}" rx="3" fill="url(#${id("cord")})"/>`);
      for (let k = 2; k < w; k += 4) s.push(`<line x1="${x + k}" y1="${top}" x2="${x + k}" y2="${bot}" stroke="#000" stroke-width="0.8" opacity="0.28"/>`);
      s.push(`<rect x="${x}" y="${top + 2}" width="${w}" height="4" fill="#fff" opacity="0.18"/>`);
    });
    // Blowing hole, with its rim, and the air stream (animated while a note sounds).
    s.push(`<ellipse cx="150" cy="${Y}" rx="15" ry="11" fill="#f3dc9a" opacity="0.45"/><ellipse cx="150" cy="${Y}" rx="13" ry="9.5" fill="url(#${id("hole")})"/>`);
    s.push(`<g class="bb-air" data-ref="air">` + [0, 1, 2].map(k => `<path d="M${96 + k * 4} ${8 + k * 5} q 14 ${6 - k} 26 ${16 - k * 2} t 24 ${14 - k * 3}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" opacity="${1 - k * 0.25}"/>`).join("") + "</g>");
    // Finger holes; each fingertip (with a nail) comes down from above onto its hole.
    BENCH_HOLE_X.forEach((x, i) => {
      s.push(`<g class="bb-holehit" data-i="${i}" data-ref="hole${i}" role="button" tabindex="0"><rect x="${x - 34}" y="0" width="68" height="${bot + 44}" fill="transparent"/><circle class="bb-holering" cx="${x}" cy="${Y}" r="20" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`);
      s.push(`<circle cx="${x}" cy="${Y}" r="12.5" fill="#f3dc9a" opacity="0.4"/><circle cx="${x}" cy="${Y}" r="11" fill="url(#${id("hole")})"/>`);
      s.push(`<g data-ref="pad${i}"><g mask="url(#${id("fade")})"><path d="M${x - 15} 0 V ${Y + 4} a 15 15 0 0 0 30 0 V 0 Z" fill="#000" opacity="0.35" filter="url(#${id("fsh")})" transform="translate(2 4)"/>`);
      s.push(`<path d="M${x - 16} 0 V ${Y + 2} a 16 16 0 0 0 32 0 V 0 Z" fill="url(#${id("skin")})" stroke="var(--finger-edge)" stroke-width="1"/>`);
      s.push(`<path d="M${x - 8} ${Y + 1} q 0 -12 8 -12 q 8 0 8 12 q 0 7 -8 7 q -8 0 -8 -7 Z" fill="#f2c9b4" opacity="0.85" stroke="var(--finger-edge)" stroke-width="0.6"/>`);
      s.push(`<path d="M${x - 15} ${Y - 26} q 15 4 30 0" fill="none" stroke="var(--finger-edge)" stroke-width="1" opacity="0.5"/></g></g></g>`);
    });
    // Labels below: the blowing hole, hole numbers, and which hand covers which holes.
    s.push(`<text class="bb-blowlab" x="150" y="${bot + 34}" text-anchor="middle">blowing hole</text>`);
    BENCH_HOLE_X.forEach((x, i) => s.push(`<circle cx="${x}" cy="${bot + 29}" r="11" class="bb-numdot"/><text x="${x}" y="${bot + 34}" text-anchor="middle" class="bb-num">${i + 1}</text>`));
    [[BENCH_HOLE_X[0], BENCH_HOLE_X[2], "top hand"], [BENCH_HOLE_X[3], BENCH_HOLE_X[5], "bottom hand"]].forEach(([a, b, t]) => {
      s.push(`<path d="M${a - 12} ${bot + 46} v 6 H ${b + 12} v -6" fill="none" class="bb-bracket"/><text class="bb-handlab" x="${(a + b) / 2}" y="${bot + 68}" text-anchor="middle">${t}</text>`);
    });
    q("fluteSvg").innerHTML = s.join("");
    q("fluteSvg").querySelectorAll(".bb-holehit").forEach(g => listen(g, "click", () => cycleHole(Number(g.dataset.i))));
    // On a phone the flute zooms in on the part that is played (blowing hole to hole 6), with
    // larger labels, so the holes are bigger to tap and the numbers can be read.
    const fit = () => { const svg = q("fluteSvg"); if (!svg) return; const narrow = root.clientWidth > 0 && root.clientWidth < 620; svg.setAttribute("viewBox", narrow ? "100 0 790 152" : "0 0 1000 145"); svg.classList.toggle("bb-narrow", narrow);
      // Larger phone labels: the first one starts at the edge, the hand labels sit clear of their brackets.
      const bl = svg.querySelector(".bb-blowlab"); if (bl) { bl.setAttribute("x", narrow ? "104" : "150"); bl.setAttribute("text-anchor", narrow ? "start" : "middle"); }
      svg.querySelectorAll(".bb-handlab").forEach(t => t.setAttribute("y", narrow ? "147" : "139"));
    };
    fit(); requestAnimationFrame(fit); listen(window, "resize", fit);
    // The guide is open on the first visit, then folded away (one tap to open it again).
    const howto = q("howto");
    if (howto) { try { if (localStorage.getItem("bansuri.bench.howtoSeen")) howto.open = false; else localStorage.setItem("bansuri.bench.howtoSeen", "1"); } catch (e) { /* storage unavailable */ } }
    // Keyboard: Enter or Space on a focused hole changes it (and does not start blowing).
    q("fluteSvg").querySelectorAll(".bb-holehit").forEach(g => listen(g, "keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); cycleHole(Number(g.dataset.i)); }
    }));
  }
  function cycleHole(i) { holes[i] = holes[i] === "O" ? "X" : holes[i] === "X" ? "H" : "O"; render(); }
  function setFingering(f, r) { holes = f.split(""); reg = r; render(); }
  function current() {
    const pat = holes.join(""), base = BASE[pat];
    return base === undefined ? { pat, semi: null } : { pat, semi: base + 12 * (reg - 1) };
  }
  function render() {
    const cur = current();
    if (o.flute) {
      holes.forEach((s, i) => {
        const pad = q("pad" + i);
        pad.style.display = s === "O" ? "none" : "";
        // Half-holing: the finger slides off to uncover half the hole (as it is really done).
        if (s === "H") pad.setAttribute("transform", "translate(-15 0)"); else pad.removeAttribute("transform");
        const g = q("hole" + i); g.dataset.s = s;
        const word = s === "X" ? "closed" : s === "H" ? "half closed" : "open";
        g.setAttribute("aria-label", `Hole ${i + 1}: ${word}`);
        let tip = g.querySelector("title"); if (!tip) { tip = document.createElementNS("http://www.w3.org/2000/svg", "title"); g.prepend(tip); }
        tip.textContent = `Hole ${i + 1}: ${word} (tap to change)`;
      });
      q("reg1").setAttribute("aria-pressed", String(reg === 1)); q("reg2").setAttribute("aria-pressed", String(reg === 2));
      const f = cur.pat.slice(0, 3) + " " + cur.pat.slice(3);
      if (cur.semi === null) {
        q("rName").textContent = "?"; q("rDeva").textContent = ""; q("rCode").textContent = f;
        q("rFacts").innerHTML = `<span>Fingering <b>${f}</b></span>`;
        q("rStatus").innerHTML = '<span class="bb-chip bb-warn">Not in the standard chart</span> <span class="bb-small bb-muted">Cross-fingerings vary between flutes (L25). Test this one on your own flute with the Check my flute tab.</span>';
        if (liveVoice) { liveVoice.stop(ac().currentTime); liveVoice = null; }
      } else {
        const s = cur.semi, L = letterOf(s);
        q("rName").textContent = capFirst(NAME[L]); q("rDeva").textContent = DEVA[L]; q("rCode").textContent = codeOf(s);
        q("rFacts").innerHTML = `<span>Saptak <b>${octName(s)}</b></span><span>Western <b>${westOf(s)}</b></span><span>Pitch <b>${hzOf(s).toFixed(1)} Hz</b></span><span>Fingering <b>${f}</b></span><span>Lesson <b>L${pad2(lessonFor(s))}</b></span>`;
        const hard = cur.pat.includes("H");
        q("rStatus").innerHTML = `<span class="bb-chip bb-good">Standard fingering</span> <span class="bb-small bb-muted">${DIFF[String(s)] || ""}${hard ? " &middot; half-hole: check it with a tuner on your flute" : ""}</span>`;
        if (liveVoice) liveVoice.glideNow(hzOf(s));
      }
    }
    root.querySelectorAll("[data-ref=chartBody] tr").forEach(tr => tr.classList.toggle("bb-current", cur.semi !== null && Number(tr.dataset.semi) === cur.semi));
  }
  function startBlow() {
    const cur = current(); if (cur.semi === null || liveVoice || destroyed) return;
    liveVoice = makeVoice(hzOf(cur.semi), ac().currentTime + 0.01);
    q("blowBtn").classList.add("bb-active"); q("air").classList.add("bb-on");
  }
  function stopBlow() {
    if (liveVoice) { liveVoice.stop(ac().currentTime); liveVoice = null; }
    if (o.flute) { q("blowBtn").classList.remove("bb-active"); q("air").classList.remove("bb-on"); }
  }
  if (o.flute) {
    const bb = q("blowBtn");
    listen(bb, "pointerdown", e => { e.preventDefault(); try { bb.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } startBlow(); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => listen(bb, ev, stopBlow));
    listen(bb, "keydown", e => { if (e.key === "Enter" && !e.repeat) startBlow(); });
    listen(bb, "keyup", e => { if (e.key === "Enter") stopBlow(); });
    listen(q("reg1"), "click", () => { reg = 1; render(); });
    listen(q("reg2"), "click", () => { reg = 2; render(); });
    const keyOk = e => {
      if (destroyed || !root.isConnected) return false;
      const t = e.target, tag = (t && t.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || (t && t.isContentEditable)) return false;
      return root.contains(t) || t === document.body || t === document.documentElement;
    };
    listen(document, "keydown", e => {
      if (!keyOk(e)) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (e.key >= "1" && e.key <= "6") cycleHole(Number(e.key) - 1);
      else if (e.key === "q" || e.key === "Q") { reg = 1; render(); }
      else if (e.key === "w" || e.key === "W") { reg = 2; render(); }
      else if (e.code === "Space" && !e.repeat && tag !== "button") { e.preventDefault(); startBlow(); }
    });
    listen(document, "keyup", e => { if (e.code === "Space") stopBlow(); });
  }

  // ---------- Settings ----------
  if (o.settings) {
    const sel = q("saNote");
    WEST.forEach((w, i) => { const op = document.createElement("option"); op.value = i; op.textContent = w; sel.appendChild(op); });
    const fill = () => {
      const s = getSettings(); sel.value = String(s.saNote); q("saOct").value = String(s.saOct); q("a4").value = String(s.a4); q("vol").value = String(Math.round(s.volume * 100));
      q("fluteSum").textContent = `Sa ${westOf(0)} · ${hzOf(0).toFixed(1)} Hz · A4 ${s.a4}`;
    };
    fill();
    listen(sel, "change", () => setSettings({ saNote: Number(sel.value) }));
    listen(q("saOct"), "change", () => setSettings({ saOct: Number(q("saOct").value) }));
    listen(q("a4"), "change", () => setSettings({ a4: Number(q("a4").value) }));
    listen(q("vol"), "input", () => setSettings({ volume: Number(q("vol").value) / 100 }));
    cleanups.push(onSettings(fill));
  }

  // ---------- Chart ----------
  function miniHtml(f) {
    if (!f) return "";
    return '<span class="bb-mini" aria-label="' + f + '">' + f.split("").map((c, i) => (i === 3 ? '<span class="bb-gap"></span>' : "") + `<i class="${c === "X" ? "x" : c === "H" ? "h" : ""}"></i>`).join("") + "</span>";
  }
  function buildChart() {
    const tb = q("chartBody"); if (!tb) { render(); return; }
    tb.innerHTML = "";
    for (let s = -5; s <= 18; s++) {
      const fo = fingOf(s), L = letterOf(s);
      const tr = document.createElement("tr"); tr.className = "bb-clickable"; tr.dataset.semi = s; tr.tabIndex = 0;
      tr.innerHTML = `<td class="bb-mono"><b>${codeOf(s)}</b></td><td>${octName(s)} ${NAME[L]} <span class="bb-muted">${DEVA[L]}</span></td><td>${miniHtml(fo.f)} <span class="bb-mono bb-small">${fo.f.slice(0, 3)} ${fo.f.slice(3)}</span></td><td>${fo.reg === 1 ? "gentle (1)" : "faster (2)"}</td><td class="bb-mono">${westOf(s)}</td><td>${hzOf(s).toFixed(1)}</td><td class="bb-small">${DIFF[String(s)]}</td><td class="bb-mono">L${pad2(lessonFor(s))}</td>`;
      const go = () => { if (o.flute) setFingering(fo.f, fo.reg); playNote(s, 1.0); };
      listen(tr, "click", go);
      listen(tr, "keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      tb.appendChild(tr);
    }
    render();
  }

  // ---------- Notation ----------
  // Playback runs in passes (one, or looped); each pass is its own playEvents call, started exactly
  // on the beat where the last one ends. seqToken invalidates passes and timers from older plays.
  let stopSeq = null, seqDrone = false, seqToken = 0, loopTimer = 0, passStops = [];
  let checkUnsub = null, checkReads = [], checkTimers = [];
  // The detector hears a note about 0.09 s after it starts (an analyser window plus a 5-reading
  // median). Timing is judged against that fixed figure, so a learner who is always late is told so.
  // The onsets heard are also kept, only to spot a device with a much larger delay (Bluetooth).
  const DETECT_LAG = 0.09;
  const lagSamples = [];
  let checkGen = 0;
  function seqUi(playing, text) {
    if (!has("play")) return;
    q("playBtn").textContent = playing ? "Restart" : "Play";
    q("stopBtn").disabled = !playing;
    q("seqStatus").textContent = text || "";
    root.classList.toggle("bb-seq-playing", !!playing);
  }
  function stopCheck() {
    checkGen++;
    checkTimers.forEach(clearTimeout); checkTimers = [];
    if (checkUnsub) { checkUnsub(); checkUnsub = null; }
  }
  // keepDrone: restarting playback keeps the tanpura that the previous play started.
  function seqStop(keepDrone) {
    seqToken++; clearTimeout(loopTimer);
    passStops.forEach(f => f()); passStops = []; stopSeq = null;
    stopCheck();
    seqUi(false);
    if (seqDrone && keepDrone !== true) { seqDrone = false; if (tanpura.isOn()) tanpura.stop(); }
    root.querySelectorAll(".bb-score span.bb-on").forEach(s => s.classList.remove("bb-on"));
  }
  // Bars as [first token, end token) ranges, for looping one bar.
  function barRanges(tokens) {
    const r = []; let st = null;
    tokens.forEach((tk, i) => { if (tk.type === "bar") { if (st !== null) { r.push([st, i]); st = null; } } else if (st === null && tk.type === "beat") st = i; });
    if (st !== null) r.push([st, tokens.length]);
    return r;
  }
  async function startCheck() {
    if (checkUnsub) return true;
    const g = checkGen;
    if (!(await micIntro(q("checkSum").parentElement)) || g !== checkGen) return false;
    if (!(await countdown(q("checkSum").parentElement, { btn: q("playBtn") })) || g !== checkGen || destroyed) return false;
    checkReads = [];
    try {
      const u = await listenMic(r => { if (r.semi !== null) { checkReads.push(r); if (checkReads.length > 3000) checkReads.splice(0, 1500); } });
      // Stopped, restarted or closed while the microphone was opening: release it at once.
      if (g !== checkGen || destroyed) { u(); return false; }
      if (checkUnsub) { u(); return true; }
      checkUnsub = u;
      return true;
    } catch (e) {
      const el = q("checkSum"); el.hidden = false;
      el.textContent = "The microphone is not available here, so notes cannot be checked. The melody plays instead.";
      return false;
    }
  }
  // Marks each note of a pass green or red from what the microphone heard during it.
  function checkPass(ev, t0, pass) {
    const c = ac(), tally = { ok: 0, n: 0, early: 0, late: 0, timed: 0, heard: 0 }, marked = new Set();
    ev.forEach((e, i) => {
      // The detector lags slightly, so the window starts a little into the note and ends a little after it.
      const a = t0 + e.start + Math.min(DETECT_LAG + 0.03, e.dur * 0.45), z = t0 + e.start + e.dur + DETECT_LAG * 0.6;
      checkTimers.push(setTimeout(() => {
        const rs = checkReads.filter(r => r.t >= a && r.t <= z), frames = Math.max(1, (z - a) / 0.033);
        const ok = rs.filter(r => r.near === e.semi).length >= frames * 0.35;
        const sp = root.querySelector(`.bb-score span[data-tk="${e.ti}"]`);
        // Each pass replaces the previous pass's mark on a note when that note's own verdict arrives.
        if (sp && !marked.has(e.ti)) { marked.add(e.ti); sp.classList.remove("bb-hit", "bb-miss", "bb-early", "bb-late"); }
        tally.n++; if (ok) tally.ok++;
        if (rs.length) tally.heard++;
        // Timing: when the note was first heard, against when it was written, for notes that follow
        // a different note (a held or repeated note has no clear start to time).
        const prev = ev[i - 1];
        if (ok && (!prev || prev.semi !== e.semi)) {
          const first = checkReads.find(r => r.t >= t0 + e.start - 0.25 && r.t <= z && r.near === e.semi);
          if (first) {
            const raw = first.t - (t0 + e.start);
            lagSamples.push(raw); if (lagSamples.length > 24) lagSamples.shift();
            const off = (raw - DETECT_LAG) * 1000, tol = Math.max(90, e.dur * 1000 * 0.2);
            tally.timed++;
            if (off < -tol) tally.early++; else if (off > tol) tally.late++;
            if (sp && Math.abs(off) > tol) sp.classList.add(off < 0 ? "bb-early" : "bb-late");
          }
        }
        if (sp) { if (!ok) { sp.classList.remove("bb-hit"); sp.classList.add("bb-miss"); } else if (!sp.classList.contains("bb-miss")) sp.classList.add("bb-hit"); }
        if (i === ev.length - 1) {
          const el = q("checkSum"); el.hidden = false;
          const onTime = tally.timed - tally.early - tally.late;
          const rhythm = tally.timed >= 3 ? ` Timing: ${onTime} of ${tally.timed} on the beat` + (tally.early > tally.late * 2 && tally.early >= 2 ? " (you rush: let the click lead)." : tally.late > tally.early * 2 && tally.late >= 2 ? " (you drag: move on with the click)." : ".") : "";
          const lagMed = lagSamples.length >= 6 ? lagSamples.slice().sort((x, y) => x - y)[lagSamples.length >> 1] : 0;
          const device = lagMed > 0.3 ? " Every note sounds late by about the same amount: with Bluetooth headphones or speakers, that delay is the device; use wired ones or the phone's speaker." : "";
          el.textContent = `Pass ${pass + 1}: ${tally.ok} of ${tally.n} notes right.` + rhythm + (tally.ok === tally.n && onTime === tally.timed ? " Clean! Try 5 BPM faster." : tally.ok / tally.n < 0.6 ? " Slow down 5-10 BPM, or loop the bar that turned red." : "") + device;
          // A pass with nothing heard (the learner paused while the loop ran on) is not recorded.
          if (tally.heard) emitLive({ type: "play", piece: opts.title || (q("preset").value !== "custom" ? q("preset").selectedOptions[0].textContent : "My own notation"), bpm: Number(q("bpm").value) || 0, ok: tally.ok, n: tally.n, onTime, timed: tally.timed });
        }
      }, Math.max(0, (z - c.currentTime) * 1000 + 80)));
    });
  }
  function renderScore(tokens) {
    const el = q("score"); el.innerHTML = "";
    const deva = getSettings().deva;
    tokens.forEach((tk, i) => {
      const s = document.createElement("span"); s.textContent = tk.text; s.dataset.tk = i; s.className = tk.type === "bar" ? "bb-barmark" : tk.type === "skip" ? "bb-skip" : tk.type === "mark" ? "bb-taalmark" : "";
      // With Devanagari on, each beat also shows its notes in Devanagari underneath.
      if (deva && tk.type === "beat") { const d = document.createElement("small"); d.className = "bb-deva"; d.textContent = devaNotation(tk.text); s.appendChild(d); }
      el.appendChild(s);
    });
  }
  function renderAnalysis(ev, skipped) {
    const el = q("analysis"), a = analyzeRange(ev);
    if (!a) { el.innerHTML = '<span class="bb-muted">No notes found yet.</span>'; return; }
    const out = [];
    const fitHtml = {
      below: `<span class="bb-chip bb-bad">Below your flute</span> goes down to <b class="bb-mono">${codeOf(a.lo)}</b>; the lowest note is <span class="bb-mono">.P</span>. Use another Sa position or flute (L26).`,
      reg3: `<span class="bb-chip bb-bad">Needs register 3</span> reaches <b class="bb-mono">${codeOf(a.hi)}</b>, above <span class="bb-mono">M'</span>: flute-specific (L22).`,
      ceiling: `<span class="bb-chip bb-warn">At the ceiling</span> reaches <b class="bb-mono">${codeOf(a.hi)}</b>, above the comfortable top <span class="bb-mono">G'</span>.`,
      ok: `<span class="bb-chip bb-good">Fits comfortably</span> within <span class="bb-mono">.P</span> to <span class="bb-mono">G'</span>.`
    }[a.fit];
    out.push(`<div>Range: <b class="bb-mono">${codeOf(a.lo)}</b> to <b class="bb-mono">${codeOf(a.hi)}</b> (${westOf(a.lo)} to ${westOf(a.hi)} on your flute). ${fitHtml}</div>`);
    out.push(`<div>Half-holes needed: ${a.halves.length ? a.halves.map(s => `<b class="bb-mono">${codeOf(s)}</b>`).join(" ") : "none"}</div>`);
    out.push(`<div>Notes used: ${a.notes.map(s => `<span class="bb-mono">${codeOf(s)}</span>`).join(" ")} &middot; Earliest lesson for every note: <b>${a.lesson >= 99 ? "not playable" : "L" + pad2(a.lesson)}</b></div>`);
    out.push(`<div class="bb-muted bb-small">${ev.length} notes &middot; about ${a.seconds.toFixed(1)} s at this tempo.</div>`);
    if (skipped.length) out.push(`<div class="bb-small bb-warntext">Ignored (not notation): ${skipped.slice(0, 8).map(s => `<span class="bb-mono">${benchEsc(s)}</span>`).join(" ")}${skipped.length > 8 ? " ..." : ""}</div>`);
    el.innerHTML = out.join("");
  }
  function refreshNotation() {
    if (!has("play")) return null;
    const p = parseNotation(q("notation").value);
    renderScore(p.tokens);
    const bpm = Math.min(300, Math.max(20, Number(q("bpm").value) || 72));
    const b = buildEvents(p.tokens, bpm);
    renderAnalysis(b.ev, p.skipped);
    refreshLoopBars(p.tokens);
    return { b, bpm };
  }
  function refreshLoopBars(tokens) {
    const sel = q("loopSel"), keep = sel.value, bars = barRanges(tokens);
    [...sel.options].filter(op => op.value.startsWith("bar:")).forEach(op => op.remove());
    if (bars.length > 1) bars.forEach((_, i) => { const op = document.createElement("option"); op.value = "bar:" + i; op.textContent = "Loop bar " + (i + 1); sel.appendChild(op); });
    sel.value = [...sel.options].some(op => op.value === keep) ? keep : "once";
    return bars;
  }
  async function playSeq() {
    seqStop(true);
    const r = refreshNotation(); if (!r || !r.b.ev.length) { seqStop(); return; }
    const token = seqToken;
    if (q("droneWithPlay").checked && !tanpura.isOn()) { tanpura.start(); startedTan = true; seqDrone = true; }
    else if (!q("droneWithPlay").checked && seqDrone) { seqDrone = false; tanpura.stop(); }
    q("checkSum").hidden = true;
    const checking = q("checkMe").checked && await startCheck();
    if (token !== seqToken) return;
    const tokens = parseNotation(q("notation").value).tokens, bars = barRanges(tokens);
    let pass = 0;
    const runPass = at => {
      if (token !== seqToken) return;
      const lv = q("loopSel").value, passNow = pass;
      let b = r.b;
      if (lv.startsWith("bar:") && bars[Number(lv.slice(4))]) {
        const [from, to] = bars[Number(lv.slice(4))];
        b = buildEvents(tokens.slice(from, to), r.bpm);
        b.ev.forEach(e => { e.ti += from; });
      }
      const counting = pass === 0 && q("clickOn").checked && q("countIn").checked;
      if (pass === 0) seqUi(true, counting ? "Count-in..." : checking ? "Your turn: play" : "Playing");
      const stop = playEvents(b.ev, b.beats, {
        bpm: r.bpm, at, click: q("clickOn").checked, countIn: counting ? b.barLen : 0, mute: checking, duet: q("duetOn") && q("duetOn").checked ? -12 : 0,
        onCount: k => { q("seqStatus").textContent = "Count-in: " + k; },
        onNote: e => {
          const label = (checking ? "Your turn: play" : "Playing") + (lv === "once" ? "" : ` (pass ${passNow + 1})`);
          if (q("seqStatus").textContent !== label) q("seqStatus").textContent = label;
          root.querySelectorAll(".bb-score span.bb-on").forEach(s => s.classList.remove("bb-on"));
          const sp = root.querySelector(`.bb-score span[data-tk="${e.ti}"]`); if (sp) sp.classList.add("bb-on");
          // A long score scrolls in its box: keep the note being played in view.
          if (sp) { const box = sp.parentElement; if (sp.offsetTop < box.scrollTop || sp.offsetTop > box.scrollTop + box.clientHeight - 30) box.scrollTop = Math.max(0, sp.offsetTop - box.clientHeight / 3); }
        },
        // The fingering changes a moment before each note, so there is time to place the fingers.
        lead: 0.3,
        onPreview: e => { const fo = fingOf(e.semi); if (fo.f && o.flute) { holes = fo.f.split(""); reg = fo.reg; render(); } },
        onEnd: () => { if (stop === stopSeq && token === seqToken) seqStop(); }
      });
      stopSeq = stop; passStops.push(stop); if (passStops.length > 3) passStops.shift();
      if (checking) checkPass(b.ev, stop.t0, passNow);
      pass++;
      if (lv !== "once") {
        const end = stop.t0 + b.beats.length * 60 / r.bpm;
        loopTimer = setTimeout(() => runPass(end), Math.max(0, (end - ac().currentTime - 0.4) * 1000));
      }
    };
    runPass(null);
  }
  function buildPresets() {
    if (!has("play")) return;
    const sel = q("preset");
    PRESETS.forEach((p, i) => { const op = document.createElement("option"); op.value = i; op.textContent = p[0]; sel.appendChild(op); });
    const custom = document.createElement("option"); custom.value = "custom"; custom.textContent = "My own notation"; sel.appendChild(custom);
    const presetIdx = opts.preset ? PRESETS.findIndex(p => p[0] === opts.preset) : -1;
    if (opts.notation) { sel.value = "custom"; q("notation").value = opts.notation; }
    else if (presetIdx >= 0) { sel.value = String(presetIdx); q("notation").value = PRESETS[presetIdx][1]; }
    else {
      const savedPreset = String(benchGet("preset", "12")), saved = benchGet("notation", null);
      sel.value = savedPreset;
      if (sel.value === "") sel.value = "12";
      q("notation").value = sel.value === "custom" && saved ? saved : (PRESETS[Number(sel.value)] || PRESETS[12])[1];
    }
    if (opts.bpm) q("bpm").value = String(opts.bpm);
    listen(sel, "change", () => { if (sel.value !== "custom") q("notation").value = PRESETS[Number(sel.value)][1]; benchSet("preset", sel.value); refreshNotation(); });
    listen(q("notation"), "input", () => { sel.value = "custom"; benchSet("preset", "custom"); benchSet("notation", q("notation").value); refreshNotation(); });
    listen(q("bpm"), "change", refreshNotation);
    listen(q("playBtn"), "click", playSeq);
    const nudge = d => { q("bpm").value = String(Math.min(220, Math.max(30, (Number(q("bpm").value) || 72) + d))); refreshNotation(); if (stopSeq) playSeq(); };
    listen(q("slower"), "click", () => nudge(-5));
    listen(q("faster"), "click", () => nudge(5));
    listen(q("checkMe"), "change", () => { if (stopSeq) playSeq(); });
    listen(q("loopSel"), "change", () => { if (stopSeq) playSeq(); });
    // Tapping a note in the score loops its bar.
    listen(q("score"), "click", e => {
      const sp = e.target.closest("span[data-tk]"); if (!sp) return;
      const i = Number(sp.dataset.tk), bars = barRanges(parseNotation(q("notation").value).tokens);
      const k = bars.findIndex(([a, z]) => i >= a && i < z);
      if (k < 0 || bars.length < 2) return;
      q("loopSel").value = "bar:" + k;
      playSeq();
    });
    listen(q("stopBtn"), "click", () => seqStop());
    // Remember the player options; the beat click can be switched on or off while playing.
    ["clickOn", "countIn", "droneWithPlay", "checkMe", "duetOn"].forEach(k => {
      const box = q(k), saved = benchGet("opt." + k, null);
      if (saved !== null) box.checked = !!saved;
      if (k === "checkMe" && opts.checkMe !== undefined) box.checked = !!opts.checkMe;
      listen(box, "change", () => { benchSet("opt." + k, box.checked); if (k === "clickOn" && stopSeq && stopSeq.setClick) stopSeq.setClick(box.checked); });
    });
    // Space plays and stops, unless the learner is typing or on a control that uses Space itself.
    listen(document, "keydown", e => {
      if (e.code !== "Space" || e.repeat || destroyed || q("playBtn").closest("[data-panel]").hidden) return;
      const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault(); if (stopSeq) seqStop(); else playSeq();
    });
    refreshNotation();
  }

  // ---------- Tanpura ----------
  function syncTan() {
    const b = q("tanBtn"); if (!b) return;
    b.textContent = tanpura.isOn() ? "Stop tanpura" : "Start tanpura";
    b.setAttribute("aria-pressed", String(tanpura.isOn()));
  }
  if (has("rhythm")) {
    listen(q("tanBtn"), "click", () => {
      seqDrone = false; // the tanpura panel takes over control of the drone
      if (tanpura.isOn()) tanpura.stop();
      else { tanpura.setFirst(q("tanFirst").value); tanpura.setSpeed(Number(q("tanSpeed").value) / 100); tanpura.setLevel(Number(q("tanVol").value) / 100); tanpura.start(); startedTan = !opts.keepDrone; }
    });
    listen(q("tanFirst"), "change", () => { tanpura.setFirst(q("tanFirst").value); benchSet("tanFirst", q("tanFirst").value); });
    // A raga preset sets the first string (Pa for most ragas; Ma when the raga omits Pa; Ni for a few).
    listen(q("tanRaga"), "change", () => { if (!q("tanRaga").value) return; q("tanFirst").value = q("tanRaga").value; q("tanFirst").dispatchEvent(new Event("change")); });
    { const f = benchGet("tanFirst", null); if (f && [...q("tanFirst").options].some(o => o.value === f)) q("tanFirst").value = f; const v = benchGet("tanVol", null); if (v !== null) q("tanVol").value = String(v); }
    listen(q("tanSpeed"), "input", () => tanpura.setSpeed(Number(q("tanSpeed").value) / 100));
    listen(q("tanVol"), "input", () => { tanpura.setLevel(Number(q("tanVol").value) / 100); benchSet("tanVol", Number(q("tanVol").value)); });
    if (q("tablaVol")) { const tv = benchGet("tablaVol", null); if (tv !== null) q("tablaVol").value = String(tv); setTablaLevel(Number(q("tablaVol").value) / 100); listen(q("tablaVol"), "input", () => { setTablaLevel(Number(q("tablaVol").value) / 100); benchSet("tablaVol", Number(q("tablaVol").value)); }); }
    cleanups.push(tanpura.onChange(syncTan));
    syncTan();
  }

  // ---------- Tala ----------
  const tala = { on: false, timer: null, next: 0, beat: 0, info: [], uiTimers: [] };
  function talaInfo() {
    const T = BENCH_TALAS[q("talaSel").value], bols = T.bols.split(" "), info = []; let b = 0;
    T.div.forEach((n, v) => {
      for (let k = 0; k < n; k++) {
        const mark = k === 0 ? T.marks[v] : "";
        let kind = "tick"; if (k === 0) kind = mark === "X" ? "sam" : mark === "0" ? "khali" : "tali";
        info.push({ mark, kind, bol: bols[b], vstart: k === 0 }); b++;
      }
    });
    return { T, info };
  }
  function drawBeats() {
    const { T, info } = talaInfo(); tala.info = info;
    q("beats").innerHTML = info.map((x, i) => `<div class="bb-beat${x.vstart ? " bb-vstart" : ""}" data-beat="${i}"><span class="bb-m">${x.mark}</span><span class="bb-n">${i + 1}</span><span class="bb-b">${x.bol}</span></div>`).join("");
    q("talaNote").textContent = T.note || "";
  }
  function talaTick() {
    const c = ac(), dur = 60 / Math.min(300, Math.max(20, Number(q("talaBpm").value) || 80));
    // If the timer was held up (busy page, scrolling on a phone), skip the missed beats instead of
    // playing them all at once.
    while (tala.next < c.currentTime - 0.02) { tala.next += dur; tala.beat = (tala.beat + 1) % tala.info.length; }
    while (tala.next < c.currentTime + 0.2) {
      const i = tala.beat, x = tala.info[i];
      if (q("talaSound").value === "click") click(tala.next, x.kind);
      else tablaBol(tala.next, x.bol, dur, x.kind === "sam");
      const at = tala.next;
      tala.uiTimers.push(setTimeout(() => {
        root.querySelectorAll(".bb-beat.bb-on").forEach(e => e.classList.remove("bb-on"));
        const e = root.querySelector(`.bb-beat[data-beat="${i}"]`); if (e) e.classList.add("bb-on");
      }, Math.max(0, (at - c.currentTime) * 1000)));
      if (tala.uiTimers.length > 64) tala.uiTimers.splice(0, 32);
      tala.next += dur; tala.beat = (tala.beat + 1) % tala.info.length;
    }
  }
  function talaStop() {
    if (!tala.on) return;
    tala.on = false; clearInterval(tala.timer); tala.uiTimers.forEach(clearTimeout); tala.uiTimers = [];
    root.querySelectorAll(".bb-beat.bb-on").forEach(e => e.classList.remove("bb-on"));
    q("talaBtn").textContent = "Start tala";
  }
  function talaToggle() {
    if (tala.on) { talaStop(); return; }
    const c = ac(); drawBeats(); tala.on = true; tala.beat = 0; tala.next = c.currentTime + 0.1;
    tala.timer = setInterval(talaTick, 25); talaTick(); q("talaBtn").textContent = "Stop tala";
  }
  if (has("rhythm")) {
    const sel = q("talaSel");
    Object.keys(BENCH_TALAS).forEach(k => { const op = document.createElement("option"); op.value = k; op.textContent = BENCH_TALAS[k].name; sel.appendChild(op); });
    if (opts.tala && BENCH_TALAS[opts.tala]) sel.value = opts.tala;
    if (opts.talaBpm) q("talaBpm").value = String(opts.talaBpm);
    listen(sel, "change", () => { const was = tala.on; if (was) talaStop(); drawBeats(); if (was) talaToggle(); });
    listen(q("talaBtn"), "click", talaToggle);
    drawBeats();
  }

  // ---------- Check my flute ----------
  let lastResult = null, lastFile = null;
  // A recording that sits consistently off the notes means the flute is tuned away from Sa at
  // A4 = 440 (common for bansuris). Offer to retune the app instead of marking every note wrong.
  function showTuning(result) {
    const el = q("tuneNote"), off = tuningOffset(result.segments), a4 = getSettings().a4;
    el.innerHTML = ""; el.hidden = true;
    if (!off || Math.abs(off.cents) < 20 || off.spread > 12) return;
    const target = Math.round(a4 * Math.pow(2, off.cents / 1200) * 10) / 10;
    if (target < 415 || target > 466) return;
    el.hidden = false;
    el.innerHTML = `<p><span class="bb-chip bb-warn">Flute tuning</span> The whole recording sits about <b class="bb-mono">${off.cents > 0 ? "+" : ""}${off.cents} cents</b> from the notes of your Sa (${westOf(0)} at A4 = ${a4} Hz), and every note is off by about the same amount. Your flute is probably tuned that way: many bansuris are. Tuning the app to your flute makes the tuner, drone and checks match it.</p>`;
    const b = document.createElement("button"); b.type = "button"; b.className = "bb-btn bb-primary"; b.textContent = `Tune the app to my flute (A4 = ${target} Hz)`;
    b.addEventListener("click", () => { setSettings({ a4: target }); if (lastFile) analyzeFile(lastFile); });
    el.appendChild(b);
  }
  function showResults(result, expected) {
    q("resultCard").hidden = false;
    lastResult = result;
    showTuning(result);
    const rows = compareToExpected(result.segments, expected);
    q("resBody").innerHTML = rows.map(r => {
      if (r.status === "missing") return `<tr><td>${r.n}</td><td class="bb-mono">${codeOf(r.expected)}</td><td colspan="3" class="bb-muted">Not found in the recording</td><td><span class="bb-chip bb-bad">Missing</span></td></tr>`;
      return `<tr><td>${r.n}</td><td class="bb-mono">${r.expected === null ? "-" : codeOf(r.expected)}</td><td><b class="bb-mono">${codeOf(r.near)}</b> ${westOf(r.near)}</td><td class="bb-mono">${r.cents > 0 ? "+" : ""}${r.cents} cents</td><td>${r.held.toFixed(1)} s</td><td><span class="bb-chip bb-${r.verdict[1]}">${r.verdict[0]}</span></td></tr>`;
    }).join("") || '<tr><td colspan="6" class="bb-muted">No steady notes found. Hold each note for at least half a second, closer to the phone.</td></tr>';
    drawPitchPlot(q("plot"), result);
    if (opts.onCheck) { try { opts.onCheck(rows); } catch (e) { /* ignore */ } }
  }
  async function analyzeFile(file) {
    const st = q("fileStatus");
    if (!file) return;
    lastFile = file;
    if (file.size > 40 * 1024 * 1024) { st.textContent = "That file is over 40 MB. Record a shorter clip (under 3 minutes)."; return; }
    st.textContent = "Reading the recording...";
    let audio;
    try { audio = await decodeAudioFile(file); }
    catch (e) { st.textContent = "This browser could not open that file. Try an MP3, M4A or WAV recording."; return; }
    const res = await analyzeAudioBuffer(audio, { onProgress: p => { if (!destroyed) st.textContent = `Analysing... ${p}%`; } });
    if (destroyed) return;
    st.textContent = `Done: ${res.seconds.toFixed(1)} s analysed, ${res.segments.length} steady note${res.segments.length === 1 ? "" : "s"} found.` + (res.truncated ? " Only the first 3 minutes were analysed." : "");
    showResults(res, CHECK_PLANS[Number(q("plan").value)][1]);
  }
  if (has("check")) {
    const sel = q("plan");
    CHECK_PLANS.forEach((p, i) => { const op = document.createElement("option"); op.value = i; op.textContent = p[0]; sel.appendChild(op); });
    if (opts.checkPlan !== undefined && CHECK_PLANS[opts.checkPlan]) sel.value = String(opts.checkPlan);
    // Reset the input after reading, so choosing the same file again analyses it again.
    listen(q("fileIn"), "change", e => { const f = e.target.files[0]; e.target.value = ""; analyzeFile(f); });
    listen(sel, "change", () => { if (lastResult) showResults(lastResult, CHECK_PLANS[Number(sel.value)][1]); });
    if (q("toTones")) { if (has("tones")) listen(q("toTones"), "click", () => setTab("tones")); else q("toTones").parentElement.hidden = true; }
  }

  // ---------- Ear quiz ----------
  const quiz = { target: null, answered: true, right: benchGet("earRight", 0), total: benchGet("earTotal", 0), voices: [], drone: false };
  function quizScore() { q("earScore").textContent = `Score: ${quiz.right} / ${quiz.total}`; benchSet("earRight", quiz.right); benchSet("earTotal", quiz.total); }
  // Only one question sounds at a time: a new question, "Hear again" or a compare note cuts the last one.
  function quizHush() { quiz.voices.forEach(v => v.stop()); quiz.voices = []; }
  function quizPlay() {
    if (quiz.target === null) return;
    quizHush();
    const c = ac(), t = c.currentTime + 0.05;
    const a = makeVoice(hzOf(0), t); a.stop(t + 0.8);
    const b = makeVoice(hzOf(quiz.target), t + 1.0); b.stop(t + 2.2);
    quiz.voices = [a, b];
  }
  function quizNew() {
    const set = BENCH_EAR_LEVELS[q("earLevel").value]; let n;
    do { n = set[Math.floor(Math.random() * set.length)]; } while (set.length > 2 && n === quiz.target && Math.random() < 0.7);
    quiz.target = n; quiz.answered = false; q("earMsg").textContent = "Which note came second?";
    q("earOpts").innerHTML = set.map(s => `<button type="button" class="bb-btn" data-s="${s}">${LETTERS[s]}</button>`).join("");
    q("earOpts").querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => quizAnswer(Number(btn.dataset.s), btn)));
    if (q("earDrone").checked && !tanpura.isOn()) { tanpura.start(); startedTan = true; quiz.drone = true; }
    quizPlay();
  }
  function quizAnswer(s, btn) {
    if (quiz.answered) { quizHush(); quiz.voices = [playNote(s, 0.8)]; return; }
    quiz.answered = true; quiz.total++;
    const ok = s === quiz.target; if (ok) quiz.right++;
    btn.classList.add(ok ? "bb-right" : "bb-wrong");
    if (!ok) { const r = q("earOpts").querySelector(`[data-s="${quiz.target}"]`); if (r) r.classList.add("bb-right"); }
    q("earMsg").textContent = ok ? `Correct: ${NAME[LETTERS[quiz.target]]}.` : `It was ${NAME[LETTERS[quiz.target]]} (${LETTERS[quiz.target]}). Tap any answer to hear and compare it.`;
    quizScore();
    if (opts.onEar) { try { opts.onEar({ level: q("earLevel").value, correct: ok }); } catch (e) { /* ignore */ } }
  }
  if (has("ear")) {
    if (opts.earLevel && BENCH_EAR_LEVELS[opts.earLevel]) q("earLevel").value = String(opts.earLevel);
    listen(q("earNext"), "click", quizNew);
    listen(q("earAgain"), "click", quizPlay);
    listen(q("earReset"), "click", () => { quiz.right = 0; quiz.total = 0; quizScore(); });
    listen(q("earLevel"), "change", () => { quizHush(); q("earOpts").innerHTML = ""; quiz.target = null; quiz.answered = true; q("earMsg").textContent = "Press New question."; });
    listen(q("earDrone"), "change", () => {
      if (q("earDrone").checked) { if (quiz.target !== null && !tanpura.isOn()) { tanpura.start(); startedTan = true; quiz.drone = true; } }
      else if (quiz.drone) { quiz.drone = false; if (tanpura.isOn()) tanpura.stop(); }
    });
    quizScore();
  }

  // ---------- Live exercises (they listen to the real flute) ----------
  const liveWidgets = {};
  function mountTone() {
    if (liveWidgets.tones) liveWidgets.tones.destroy();
    const v = q("toneNote").value;
    liveWidgets.tones = holdMeter({ targets: v === "any" ? null : [Number(v)], seconds: Number(q("toneSecs").value), cents: Number(q("toneCents").value), ghost: opts.ghost || null });
    q("toneHost").replaceChildren(liveWidgets.tones.el);
  }
  if (has("tones")) {
    const sel = q("toneNote");
    for (let s = -5; s <= 17; s++) { const op = document.createElement("option"); op.value = String(s); op.textContent = `${codeOf(s)}  ${NAME[letterOf(s)]}`; sel.appendChild(op); }
    ["toneNote", "toneSecs", "toneCents"].forEach(k => {
      const saved = benchGet("live." + k, null);
      if (saved !== null && [...q(k).options].some(op => op.value === saved)) q(k).value = saved;
      listen(q(k), "change", () => { benchSet("live." + k, q(k).value); mountTone(); });
    });
    mountTone();
  }
  if (has("echo")) { liveWidgets.echo = echoGame({}); q("echoHost").replaceChildren(liveWidgets.echo.el); }
  if (has("rhythm")) { liveWidgets.rhythm = tapGame({ bpm: 72 }); q("tapHost").replaceChildren(liveWidgets.rhythm.el); }

  // ---------- Tabs ----------
  function setTab(name) {
    if (!has(name)) name = tabs.length ? tabs[0][0] : "";
    root.querySelectorAll(".bb-tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    root.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
    // Close the microphone (and stop the tap game) when its tab is left.
    for (const [k, w] of Object.entries(liveWidgets)) if (k !== name && w.stop) w.stop();
    if (!compact) benchSet("tab", name);
  }
  root.querySelectorAll(".bb-tabs button").forEach(b => listen(b, "click", () => setTab(b.dataset.tab)));
  if (tabs.length < 2) { const nav = root.querySelector(".bb-tabs"); if (nav) nav.hidden = true; }

  cleanups.push(onSettings(() => { if (!destroyed) { buildChart(); refreshNotation(); } }));

  buildSvg(); buildChart(); buildPresets();
  setTab(opts.tab || (compact ? null : benchGet("tab", null)) || (tabs[0] && tabs[0][0]));

  function stopEverything() {
    stopBlow(); seqStop(); if (has("rhythm")) talaStop();
    Object.values(liveWidgets).forEach(w => w.destroy());
    if (startedTan && tanpura.isOn()) tanpura.stop();
    startedTan = false;
  }

  return {
    destroy() {
      if (destroyed) return;
      stopEverything(); destroyed = true;
      cleanups.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
      root.remove();
    },
    setTab,
    loadNotation(text, bpm) {
      if (!has("play")) return;
      q("preset").value = "custom"; q("notation").value = text || "";
      if (bpm) q("bpm").value = String(bpm);
      refreshNotation(); setTab("play");
    },
    stopAll: stopEverything
  };
}
