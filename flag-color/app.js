// 국기 색칠 놀이 — 6세용, 아이패드 사파리 최적화. 빌드 없음·외부 의존 없음.
(function () {
  "use strict";

  const el = {
    startScreen: document.getElementById("start-screen"),
    playScreen: document.getElementById("play-screen"),
    winScreen: document.getElementById("win-screen"),
    endScreen: document.getElementById("end-screen"),
    startBtn: document.getElementById("start-btn"),
    homeBtn: document.getElementById("home-btn"),
    clearBtn: document.getElementById("clear-btn"),
    progress: document.getElementById("progress"),
    stars: document.getElementById("stars"),
    canvasWrap: document.getElementById("canvas-wrap"),
    canvasName: document.getElementById("canvas-name"),
    refWrap: document.getElementById("ref-wrap"),
    palette: document.getElementById("palette"),
    hint: document.getElementById("hint"),
    winFlag: document.getElementById("win-flag"),
    winName: document.getElementById("win-name"),
    winFact: document.getElementById("win-fact"),
    replayBtn: document.getElementById("replay-btn"),
    nextBtn: document.getElementById("next-btn"),
    restartBtn: document.getElementById("restart-btn"),
    endScore: document.getElementById("end-score"),
    endStars: document.getElementById("end-stars"),
  };

  const colorOf = (key) => (PALETTE.find((p) => p.key === key) || {}).color;
  const labelOf = (key) => (PALETTE.find((p) => p.key === key) || {}).label;
  const BLANK = "#eef0f3"; // 아직 안 칠한 칸 색

  let order = [];       // 이번 판 국기 순서
  let idx = 0;          // 현재 문제 번호
  let selected = null;  // 고른 색 key
  let solved = 0;       // 맞힌 개수
  let checkedOnce = false; // 이번 국기에서 "다시 볼까요" 안내를 한 번만

  // ---------- 화면 전환 ----------
  function show(screen) {
    [el.startScreen, el.playScreen, el.winScreen, el.endScreen].forEach((s) =>
      s.classList.remove("active")
    );
    screen.classList.add("active");
  }

  // ---------- SVG 국기 만들기 ----------
  function regionTag(r, i, fill, extra) {
    const f = `fill="${fill}"`;
    if (r.t === "rect")
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${f} ${extra}/>`;
    if (r.t === "circle")
      return `<circle cx="${r.cx}" cy="${r.cy}" r="${r.r}" ${f} ${extra}/>`;
    return `<path d="${r.d}" ${f} ${extra}/>`;
  }

  // 색칠용(빈 칸) SVG
  function canvasSVG(flag) {
    const inner = flag.regions
      .map((r, i) =>
        regionTag(r, i, BLANK, `class="region" data-idx="${i}"`)
      )
      .join("");
    return (
      `<svg viewBox="0 0 300 200" class="flag-svg canvas-svg" ` +
      `role="img" aria-label="${flag.name} 국기 색칠하기">` +
      inner +
      `<rect x="1.5" y="1.5" width="297" height="197" class="frame"/></svg>`
    );
  }

  // 정답 미리보기 SVG
  function refSVG(flag) {
    const inner = flag.regions
      .map((r, i) => regionTag(r, i, colorOf(r.answer), 'class="ref-region"'))
      .join("");
    return (
      `<svg viewBox="0 0 300 200" class="flag-svg" role="img" ` +
      `aria-label="${flag.name} 정답 국기">` +
      inner +
      `<rect x="1.5" y="1.5" width="297" height="197" class="frame"/></svg>`
    );
  }

  // ---------- 팔레트 ----------
  function buildPalette() {
    el.palette.innerHTML = PALETTE.map(
      (p) =>
        `<button class="swatch" data-key="${p.key}" style="--sw:${p.color}" ` +
        `aria-label="${p.label}" title="${p.label}"></button>`
    ).join("");
  }

  function selectColor(key) {
    selected = key;
    el.palette.querySelectorAll(".swatch").forEach((b) =>
      b.classList.toggle("on", b.dataset.key === key)
    );
    el.palette.classList.remove("nudge");
  }

  // ---------- 문제 로드 ----------
  function loadFlag() {
    const flag = order[idx];
    checkedOnce = false;
    el.progress.textContent = `${idx + 1} / ${order.length}`;
    el.canvasName.textContent = flag.name;
    el.canvasWrap.innerHTML = canvasSVG(flag);
    el.refWrap.innerHTML = refSVG(flag);
    el.hint.textContent = "먼저 색을 골라요 🎨";
    selected = null;
    el.palette.querySelectorAll(".swatch").forEach((b) => b.classList.remove("on"));

    el.canvasWrap
      .querySelector("svg")
      .addEventListener("pointerdown", onRegionTap);
  }

  function currentSVG() {
    return el.canvasWrap.querySelector("svg");
  }

  // ---------- 색칠 ----------
  function onRegionTap(e) {
    const region = e.target.closest(".region");
    if (!region) return;
    e.preventDefault();
    if (!selected) {
      // 아직 색을 안 골랐으면 팔레트를 흔들어 알려준다
      el.palette.classList.remove("nudge");
      void el.palette.offsetWidth;
      el.palette.classList.add("nudge");
      el.hint.textContent = "아래에서 색을 먼저 골라요! 👇";
      return;
    }
    region.setAttribute("fill", colorOf(selected));
    region.dataset.current = selected;
    region.classList.remove("wrong");
    // 톡 눌리는 느낌
    region.classList.remove("pop");
    void region.getBBox; // reflow 대용
    region.classList.add("pop");
    fillBeep();
    el.hint.textContent = "";
    checkComplete();
  }

  function checkComplete() {
    const flag = order[idx];
    const regions = Array.from(currentSVG().querySelectorAll(".region"));
    const allFilled = regions.every((r) => r.dataset.current);
    if (!allFilled) return;

    const wrong = regions.filter(
      (r) => r.dataset.current !== flag.regions[+r.dataset.idx].answer
    );
    if (wrong.length === 0) {
      win();
    } else if (!checkedOnce) {
      checkedOnce = true;
      wrong.forEach((r) => r.classList.add("wrong"));
      setTimeout(() => wrong.forEach((r) => r.classList.remove("wrong")), 1800);
      el.hint.textContent = "거의 다 됐어요! 색을 다시 볼까요? 😊";
      speak("거의 다 됐어요. 색을 다시 볼까요?");
    }
  }

  function clearFlag() {
    const regions = currentSVG().querySelectorAll(".region");
    regions.forEach((r) => {
      r.setAttribute("fill", BLANK);
      delete r.dataset.current;
      r.classList.remove("wrong", "pop");
    });
    checkedOnce = false;
    el.hint.textContent = "다시 색칠해 볼까요? 🎨";
  }

  // ---------- 정답! ----------
  function win() {
    const flag = order[idx];
    solved++;
    renderStars();
    playCorrect();
    confetti();
    setTimeout(() => {
      el.winFlag.innerHTML = refSVG(flag);
      el.winName.textContent = `${flag.name}  ${flag.emoji}`;
      el.winFact.textContent = flag.fact;
      show(el.winScreen);
      speak(`${flag.name} 국기를 완성했어요! ${flag.fact}`);
    }, 700);
  }

  function nextFlag() {
    idx++;
    if (idx >= order.length) {
      endGame();
    } else {
      show(el.playScreen);
      loadFlag();
    }
  }

  function endGame() {
    el.endScore.textContent = `국기 ${order.length}개 중 ${solved}개를 멋지게 색칠했어요!`;
    el.endStars.textContent = "⭐".repeat(Math.max(1, solved));
    show(el.endScreen);
    speak("참 잘했어요! 국기를 모두 색칠했어요.");
  }

  function renderStars() {
    el.stars.textContent = "⭐".repeat(solved);
  }

  // ---------- 게임 시작/종료 ----------
  function startGame() {
    unlockAudio();
    order = shuffle(FLAGS.slice());
    idx = 0;
    solved = 0;
    renderStars();
    buildPalette();
    show(el.playScreen);
    loadFlag();
  }

  function shuffle(a) {
    // Fisher–Yates
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- 소리 (WebAudio, 외부 파일 없음) ----------
  let audioCtx = null;
  function getAudio() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
    return audioCtx;
  }
  function unlockAudio() {
    const ctx = getAudio();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }
  function beep(freq, start, dur, type, gainVal) {
    const ctx = getAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainVal || 0.2, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  // 색칠할 때 짧고 통통 튀는 소리
  function fillBeep() {
    unlockAudio();
    beep(660, 0, 0.09, "triangle", 0.18);
  }
  // 완성: 밝게 올라가는 "딩-동-댕-딩~"
  function playCorrect() {
    if (!getAudio()) return;
    unlockAudio();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      beep(f, i * 0.11, 0.2, "triangle", 0.25)
    );
  }

  // ---------- TTS ----------
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 0.98;
      u.pitch = 1.05;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // ---------- 색종이 축하 ----------
  function confetti() {
    const colors = PALETTE.map((p) => p.color).filter((c) => c !== "#ffffff");
    const wrap = document.createElement("div");
    wrap.className = "confetti";
    for (let i = 0; i < 36; i++) {
      const s = document.createElement("span");
      s.style.left = Math.random() * 100 + "%";
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = Math.random() * 0.3 + "s";
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2200);
  }

  // ---------- 이벤트 ----------
  el.startBtn.addEventListener("click", startGame);
  el.restartBtn.addEventListener("click", startGame);
  el.homeBtn.addEventListener("click", () => show(el.startScreen));
  el.clearBtn.addEventListener("click", clearFlag);
  el.nextBtn.addEventListener("click", nextFlag);
  el.replayBtn.addEventListener("click", () => {
    const flag = order[idx];
    speak(`${flag.name} 국기를 완성했어요! ${flag.fact}`);
  });
  el.palette.addEventListener("pointerdown", (e) => {
    const sw = e.target.closest(".swatch");
    if (!sw) return;
    e.preventDefault();
    unlockAudio();
    selectColor(sw.dataset.key);
    el.hint.textContent = `${labelOf(sw.dataset.key)} 색으로 칠해요!`;
  });
})();
