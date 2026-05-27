"use strict";

/* =========================================================
   트레몰로 하모니카 24홀 (C키) — 솔로 튜닝, 3옥타브 C장조
   24 물리 구멍 = 12 음 위치(각 위치가 트레몰로로 2겹).
   위 칸 = 불기(날숨 ▲), 아래 칸 = 들숨(▼).
   ========================================================= */

const SEMITONE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const SOLFEGE = { C: "도", D: "레", E: "미", F: "파", G: "솔", A: "라", B: "시" };

const toMidi = (name, oct) => (oct + 1) * 12 + SEMITONE[name];
const toFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// 12 음 위치. blow/draw = [음이름, 옥타브]
const POSITIONS = [
  { hole: 1, blow: ["C", 4], draw: ["D", 4] },
  { hole: 2, blow: ["E", 4], draw: ["F", 4] },
  { hole: 3, blow: ["G", 4], draw: ["A", 4] },
  { hole: 4, blow: ["C", 5], draw: ["B", 4] },
  { hole: 5, blow: ["C", 5], draw: ["D", 5] },
  { hole: 6, blow: ["E", 5], draw: ["F", 5] },
  { hole: 7, blow: ["G", 5], draw: ["A", 5] },
  { hole: 8, blow: ["C", 6], draw: ["B", 5] },
  { hole: 9, blow: ["C", 6], draw: ["D", 6] },
  { hole: 10, blow: ["E", 6], draw: ["F", 6] },
  { hole: 11, blow: ["G", 6], draw: ["A", 6] },
  { hole: 12, blow: ["C", 7], draw: ["B", 6] },
];

const labelOf = ([name, oct]) => `${name}${oct}`;
const solfegeOf = ([name]) => SOLFEGE[name];

// 음(midi) -> [{hole, type}] 역참조 (낮은 구멍 우선)
function findPlaces(midi) {
  const out = [];
  for (const p of POSITIONS) {
    if (toMidi(...p.blow) === midi) out.push({ hole: p.hole, type: "blow", note: p.blow });
    if (toMidi(...p.draw) === midi) out.push({ hole: p.hole, type: "draw", note: p.draw });
  }
  return out;
}

/* ---------------- 오디오 (Web Audio, 트레몰로 떨림 합성) -------------- */
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playFreq(freq, dur = 0.7) {
  const ctx = ensureAudio();
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  // 엔벨로프
  const peak = 0.22;
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  master.gain.setValueAtTime(peak, t0 + Math.max(0.05, dur - 0.12));
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // 두 리드를 살짝 어긋나게 -> 트레몰로 비트(떨림)
  const detunes = [-7, +7]; // cents
  detunes.forEach((cents) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = cents;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  });
}

function playNote([name, oct], dur = 0.7) {
  playFreq(toFreq(toMidi(name, oct)), dur);
}

/* ----------------------- 탭 전환 ----------------------- */
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  const id = btn.dataset.tab;
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === id));
  if (id !== "practice") stopSong();
  if (id === "quiz") newQuiz(); // 사용자 제스처 직후라 듣기 문제 소리가 바로 재생됨
});

/* ----------------------- 1) 도면 ----------------------- */
const harmonicaEl = document.getElementById("harmonica");
const nowPlayingEl = document.getElementById("now-playing");
const showNames = document.getElementById("show-names");
const showSolfege = document.getElementById("show-solfege");

function cellInner(noteArr) {
  const name = showNames.checked ? `<span class="note">${labelOf(noteArr)}</span>` : "";
  const sol = showSolfege.checked ? `<span class="sol">${solfegeOf(noteArr)}</span>` : "";
  return name + sol || "&nbsp;";
}

function renderHarmonica() {
  harmonicaEl.innerHTML = "";
  for (const p of POSITIONS) {
    const hole = document.createElement("div");
    hole.className = "hole";
    hole.innerHTML = `
      <div class="breath-label blow">▲ 불기</div>
      <div class="cell blow" data-hole="${p.hole}" data-type="blow">${cellInner(p.blow)}</div>
      <div class="cell draw" data-hole="${p.hole}" data-type="draw">${cellInner(p.draw)}</div>
      <div class="breath-label draw">▼ 들숨</div>
      <div class="hole-num">${p.hole}</div>`;
    harmonicaEl.appendChild(hole);
  }
}

harmonicaEl.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const p = POSITIONS[+cell.dataset.hole - 1];
  const noteArr = cell.dataset.type === "blow" ? p.blow : p.draw;
  playNote(noteArr, 0.8);
  cell.classList.add("lit");
  setTimeout(() => cell.classList.remove("lit"), 400);
  const breath = cell.dataset.type === "blow" ? "불기 ▲" : "들숨 ▼";
  nowPlayingEl.textContent = `${p.hole}번 ${breath} · ${labelOf(noteArr)} (${solfegeOf(noteArr)})`;
});

showNames.addEventListener("change", renderHarmonica);
showSolfege.addEventListener("change", renderHarmonica);

/* ----------------------- 2) 찾기 ----------------------- */
const finderNotesEl = document.getElementById("finder-notes");
const finderResultEl = document.getElementById("finder-result");

// 연주 가능한 모든 음(중복 제거, 음높이순)
const ALL_NOTES = (() => {
  const map = new Map();
  for (const p of POSITIONS) {
    for (const arr of [p.blow, p.draw]) map.set(toMidi(...arr), arr);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, arr]) => arr);
})();

function renderFinderButtons() {
  finderNotesEl.innerHTML = "";
  for (const arr of ALL_NOTES) {
    const b = document.createElement("button");
    b.className = "note-btn";
    b.dataset.midi = toMidi(...arr);
    b.innerHTML = `${labelOf(arr)}<br><small style="color:var(--muted)">${solfegeOf(arr)}</small>`;
    finderNotesEl.appendChild(b);
  }
}

finderNotesEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".note-btn");
  if (!btn) return;
  document.querySelectorAll("#finder-notes .note-btn").forEach((x) => x.classList.toggle("active", x === btn));
  const midi = +btn.dataset.midi;
  const places = findPlaces(midi);
  playFreq(toFreq(midi), 0.8);
  const arr = places[0].note;
  const chips = places
    .map((pl) => {
      const tag = pl.type === "blow" ? '<span class="tag-blow">불기 ▲</span>' : '<span class="tag-draw">들숨 ▼</span>';
      return `<span class="match-chip" data-hole="${pl.hole}" data-type="${pl.type}"><strong>${pl.hole}번</strong> ${tag}</span>`;
    })
    .join("");
  finderResultEl.innerHTML = `
    <div><strong style="color:var(--text);font-size:1.1rem">${labelOf(arr)} (${solfegeOf(arr)})</strong> 은(는) ${places.length}곳에서 연주합니다:</div>
    <div class="matches">${chips}</div>`;
});

finderResultEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".match-chip");
  if (!chip) return;
  const p = POSITIONS[+chip.dataset.hole - 1];
  playNote(chip.dataset.type === "blow" ? p.blow : p.draw, 0.8);
});

/* ----------------------- 3) 음계 · 동요 ----------------------- */
// 'rest' = 쉼표. 음은 [이름, 옥타브].
const R = "rest";
const SONGS = {
  "C장조 음계 (1옥타브)": [
    ["C", 4], ["D", 4], ["E", 4], ["F", 4], ["G", 4], ["A", 4], ["B", 4], ["C", 5],
  ],
  "C장조 음계 (2옥타브)": [
    ["C", 4], ["D", 4], ["E", 4], ["F", 4], ["G", 4], ["A", 4], ["B", 4],
    ["C", 5], ["D", 5], ["E", 5], ["F", 5], ["G", 5], ["A", 5], ["B", 5], ["C", 6],
  ],
  "학교종": [
    ["G", 4], ["G", 4], ["A", 4], ["A", 4], ["G", 4], ["G", 4], ["E", 4], R,
    ["G", 4], ["G", 4], ["E", 4], ["E", 4], ["D", 4], R,
    ["G", 4], ["G", 4], ["A", 4], ["A", 4], ["G", 4], ["G", 4], ["E", 4], R,
    ["G", 4], ["E", 4], ["D", 4], ["E", 4], ["C", 4],
  ],
  "반짝반짝 작은별": [
    ["C", 4], ["C", 4], ["G", 4], ["G", 4], ["A", 4], ["A", 4], ["G", 4], R,
    ["F", 4], ["F", 4], ["E", 4], ["E", 4], ["D", 4], ["D", 4], ["C", 4], R,
    ["G", 4], ["G", 4], ["F", 4], ["F", 4], ["E", 4], ["E", 4], ["D", 4], R,
    ["G", 4], ["G", 4], ["F", 4], ["F", 4], ["E", 4], ["E", 4], ["D", 4], R,
    ["C", 4], ["C", 4], ["G", 4], ["G", 4], ["A", 4], ["A", 4], ["G", 4], R,
    ["F", 4], ["F", 4], ["E", 4], ["E", 4], ["D", 4], ["D", 4], ["C", 4],
  ],
  "비행기": [
    ["E", 4], ["D", 4], ["C", 4], ["D", 4], ["E", 4], ["E", 4], ["E", 4], R,
    ["D", 4], ["D", 4], ["D", 4], R,
    ["E", 4], ["G", 4], ["G", 4], R,
    ["E", 4], ["D", 4], ["C", 4], ["D", 4], ["E", 4], ["E", 4], ["E", 4], R,
    ["D", 4], ["D", 4], ["E", 4], ["D", 4], ["C", 4],
  ],
};

const songSelect = document.getElementById("song-select");
const songSheet = document.getElementById("song-sheet");
const tempoEl = document.getElementById("tempo");
const tempoVal = document.getElementById("tempo-val");
let playTimer = null;

Object.keys(SONGS).forEach((name) => {
  const o = document.createElement("option");
  o.value = name;
  o.textContent = name;
  songSelect.appendChild(o);
});

function renderSong() {
  stopSong();
  songSheet.innerHTML = "";
  const seq = SONGS[songSelect.value];
  seq.forEach((tok, i) => {
    const chip = document.createElement("div");
    if (tok === R) {
      chip.className = "note-chip rest";
      chip.textContent = "𝄽";
    } else {
      const place = findPlaces(toMidi(...tok))[0];
      const breath = place.type === "blow" ? "불 ▲" : "들 ▼";
      chip.className = "note-chip";
      chip.dataset.index = i;
      chip.innerHTML = `
        <span class="chip-hole">${place.hole}</span>
        <span class="chip-breath ${place.type}">${breath}</span>
        <span class="chip-note">${labelOf(tok)} ${solfegeOf(tok)}</span>`;
    }
    songSheet.appendChild(chip);
  });
}

songSheet.addEventListener("click", (e) => {
  const chip = e.target.closest(".note-chip:not(.rest)");
  if (!chip) return;
  const tok = SONGS[songSelect.value][+chip.dataset.index];
  playNote(tok, 0.6);
  flash(chip);
});

function flash(el) {
  el.classList.add("lit");
  setTimeout(() => el.classList.remove("lit"), 260);
}

function stopSong() {
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  songSheet.querySelectorAll(".lit").forEach((c) => c.classList.remove("lit"));
}

function playSong() {
  stopSong();
  ensureAudio();
  const seq = SONGS[songSelect.value];
  const beat = 60 / +tempoEl.value; // 초/박
  const chips = [...songSheet.children];
  let i = 0;
  const step = () => {
    if (i >= seq.length) {
      playTimer = null;
      return;
    }
    const tok = seq[i];
    const chip = chips[i];
    if (tok !== R) {
      playNote(tok, beat * 0.9);
      flash(chip);
      chip.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
    i++;
    playTimer = setTimeout(step, beat * 1000);
  };
  step();
}

songSelect.addEventListener("change", renderSong);
tempoEl.addEventListener("input", () => (tempoVal.textContent = tempoEl.value));
document.getElementById("play-song").addEventListener("click", playSong);
document.getElementById("stop-song").addEventListener("click", stopSong);

/* ----------------------- 4) 퀴즈 ----------------------- */
const quizStage = document.getElementById("quiz-stage");
const quizOptions = document.getElementById("quiz-options");
const quizFeedback = document.getElementById("quiz-feedback");
const nextQuizBtn = document.getElementById("next-quiz");
const scoreEl = document.getElementById("score");
const totalEl = document.getElementById("total");

let quizMode = "listen";
let score = 0;
let total = 0;
let current = null;

// 모든 (구멍,호흡) 조합
const ALL_PLACES = POSITIONS.flatMap((p) => [
  { hole: p.hole, type: "blow", note: p.blow },
  { hole: p.hole, type: "draw", note: p.draw },
]);

const sample = (arr, n, exclude) => {
  const pool = arr.filter((x) => x !== exclude);
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
};
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

document.querySelector(".quiz-mode").addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  document.querySelectorAll(".mode-btn").forEach((m) => m.classList.toggle("active", m === btn));
  quizMode = btn.dataset.mode;
  newQuiz();
});

function newQuiz() {
  quizFeedback.textContent = "";
  quizFeedback.className = "quiz-feedback";
  nextQuizBtn.hidden = true;
  quizOptions.innerHTML = "";

  const target = ALL_PLACES[Math.floor(Math.random() * ALL_PLACES.length)];
  current = target;
  const breathTxt = target.type === "blow" ? '<span class="tag-blow">불기 ▲</span>' : '<span class="tag-draw">들숨 ▼</span>';

  if (quizMode === "listen") {
    quizStage.innerHTML = `<p>들리는 소리는 몇 번 구멍의 어떤 호흡일까요?</p>
      <button class="replay-btn" id="replay">🔊 다시 듣기</button>`;
    document.getElementById("replay").onclick = () => playNote(target.note, 0.8);
    playNote(target.note, 0.8);

    // 같은 음높이(동일 소리)는 보기에서 제외 — 정답이 애매해지지 않도록
    const distractPool = ALL_PLACES.filter((p) => toMidi(...p.note) !== toMidi(...target.note));
    const distractors = sample(distractPool, 3, target);
    shuffle([target, ...distractors]).forEach((pl) => {
      const b = document.createElement("button");
      b.className = "opt-btn";
      const t = pl.type === "blow" ? '<span class="tag-blow">▲</span>' : '<span class="tag-draw">▼</span>';
      b.innerHTML = `${pl.hole}번 ${t}`;
      b.onclick = () => answer(b, pl.hole === target.hole && pl.type === target.type, target);
      quizOptions.appendChild(b);
    });
  } else {
    quizStage.innerHTML = `<p>이 구멍은 무슨 음일까요?</p>
      <div class="big">${target.hole}번 ${breathTxt}</div>`;
    // 음이름 보기: 같은 음높이는 정답으로 인정
    const distractors = sample(ALL_PLACES, 3, target).filter(
      (d) => toMidi(...d.note) !== toMidi(...target.note)
    );
    while (distractors.length < 3) {
      const extra = ALL_PLACES[Math.floor(Math.random() * ALL_PLACES.length)];
      if (toMidi(...extra.note) !== toMidi(...target.note) && !distractors.includes(extra)) distractors.push(extra);
    }
    shuffle([target, ...distractors]).forEach((pl) => {
      const b = document.createElement("button");
      b.className = "opt-btn";
      b.innerHTML = `${labelOf(pl.note)}<br><small style="color:var(--muted)">${solfegeOf(pl.note)}</small>`;
      const correct = toMidi(...pl.note) === toMidi(...target.note);
      b.onclick = () => answer(b, correct, target);
      quizOptions.appendChild(b);
    });
  }
}

function answer(btn, correct, target) {
  [...quizOptions.children].forEach((b) => (b.disabled = true));
  total++;
  if (correct) {
    score++;
    btn.classList.add("correct");
    quizFeedback.textContent = "정답! 🎉";
    quizFeedback.className = "quiz-feedback ok";
  } else {
    btn.classList.add("wrong");
    // 정답 표시
    [...quizOptions.children].forEach((b) => {
      if (quizMode === "listen") {
        if (b.innerHTML.startsWith(`${target.hole}번`) && b.innerHTML.includes(target.type === "blow" ? "▲" : "▼"))
          b.classList.add("correct");
      } else if (b.innerHTML.includes(labelOf(target.note))) {
        b.classList.add("correct");
      }
    });
    const breath = target.type === "blow" ? "불기 ▲" : "들숨 ▼";
    quizFeedback.textContent = `아쉬워요. 정답은 ${target.hole}번 ${breath} · ${labelOf(target.note)}(${solfegeOf(target.note)})`;
    quizFeedback.className = "quiz-feedback bad";
  }
  playNote(target.note, 0.7);
  scoreEl.textContent = score;
  totalEl.textContent = total;
  nextQuizBtn.hidden = false;
}

nextQuizBtn.addEventListener("click", newQuiz);

/* ----------------------- 초기화 ----------------------- */
renderHarmonica();
renderFinderButtons();
renderSong();
newQuiz();
