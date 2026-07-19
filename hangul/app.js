/* 한글놀이 — 낱말을 보여주고, 아이가 소리 내어 읽으면 발음을 확인해 주는 앱
 * 음성 인식: Web Speech API (iPad Safari는 iOS 14.5+ 지원, HTTPS 필요)
 * 지원하지 않는 브라우저에서는 부모님 확인(⭕/🔁) 모드로 자동 전환 */

(() => {
  "use strict";

  const ROUND_SIZE = 10; // 한 판에 낱말 10개
  const MAX_TRIES = 3;   // 3번 시도하면 정답을 들려주고 다음으로

  const $ = (id) => document.getElementById(id);
  const screens = { home: $("home"), play: $("play"), done: $("done") };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const srSupported = Boolean(SR);

  // ---------- 상태 ----------
  let category = null;
  let queue = [];      // 이번 판 낱말들
  let index = 0;
  let tries = 0;
  let roundStars = 0;
  let recognition = null;
  let recognizing = false;
  let advancing = false; // 정답/도움/건너뛰기 중복 진행(더블탭) 방지

  const store = {
    get stars() { return Number(localStorage.getItem("hangul.stars") || 0); },
    set stars(v) { localStorage.setItem("hangul.stars", String(v)); },
  };

  // ---------- 한글 자모 분해 + 유사도 ----------
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

  function toJamo(str) {
    let out = "";
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const i = code - 0xac00;
        out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
      } else {
        out += ch;
      }
    }
    return out;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  const normalize = (s) => s.replace(/[\s.,!?~'"‘’“”·]/g, "");

  function similarity(target, heard) {
    const a = toJamo(normalize(target));
    const b = toJamo(normalize(heard));
    if (!a.length || !b.length) return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  // 인식된 후보들 중 최고 점수 계산
  function scoreCandidates(target, candidates) {
    let best = { sim: 0, heard: candidates[0] || "" };
    for (const c of candidates) {
      const t = normalize(target), h = normalize(c);
      // 낱말이 문장 속에 포함돼 인식되기도 함 ("토끼" → "토끼야")
      if (h === t || (t.length >= 2 && h.includes(t))) return { sim: 1, heard: c };
      // 한 글자 낱말("곰")은 "곰이에요"처럼 붙여 말해도 정답 인정
      if (t.length === 1 && h.startsWith(t)) return { sim: 1, heard: c };
      const sim = similarity(target, c);
      if (sim > best.sim) best = { sim, heard: c };
    }
    return best;
  }

  // ---------- 말하기 (TTS) ----------
  let koVoice = null;
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    koVoice = voices.find((v) => v.lang.startsWith("ko")) || null;
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text, rate = 0.85) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      if (koVoice) u.voice = koVoice;
      u.rate = rate;
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  }

  // ---------- 효과음 (Web Audio) ----------
  let audioCtx = null;
  function tone(freq, start, dur, type = "sine", gain = 0.15) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + start);
    o.stop(audioCtx.currentTime + start + dur);
  }
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  function soundGood() {
    if (!audioCtx) return;
    tone(523, 0, 0.15); tone(659, 0.12, 0.15); tone(784, 0.24, 0.25);
  }
  function soundAlmost() {
    if (!audioCtx) return;
    tone(440, 0, 0.15); tone(494, 0.14, 0.2);
  }
  function soundFanfare() {
    if (!audioCtx) return;
    [523, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.2, "triangle", 0.18));
  }

  // ---------- 색종이 ----------
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  let pieces = [];
  let confettiRunning = false;

  function resizeCanvas() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  }
  addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function burstConfetti(count = 90) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];
    for (let i = 0; i < count; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height * 0.35,
        vx: (Math.random() - 0.5) * 22 * devicePixelRatio,
        vy: (Math.random() * -14 - 4) * devicePixelRatio,
        size: (6 + Math.random() * 8) * devicePixelRatio,
        color: colors[i % colors.length],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 90 + Math.random() * 40,
      });
    }
    if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(tick); }
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces = pieces.filter((p) => p.life > 0 && p.y < canvas.height + 40);
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.5 * devicePixelRatio;
      p.vx *= 0.99; p.rot += p.vr; p.life--;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (pieces.length) requestAnimationFrame(tick);
    else { confettiRunning = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  // ---------- 화면 전환 ----------
  function show(name) {
    for (const [k, el] of Object.entries(screens)) el.classList.toggle("hidden", k !== name);
  }

  function updateStars() {
    $("starCount").textContent = store.stars;
    $("starCountPlay").textContent = store.stars;
  }

  // ---------- 홈 ----------
  function renderHome() {
    const grid = $("categoryGrid");
    grid.innerHTML = "";
    for (const cat of WORD_CATEGORIES) {
      const btn = document.createElement("button");
      btn.className = "category-card";
      btn.innerHTML = `<span class="cat-emoji">${cat.emoji}</span>${cat.name}<span class="cat-count">낱말 ${cat.words.length}개</span>`;
      btn.addEventListener("click", () => { ensureAudio(); startRound(cat); });
      grid.appendChild(btn);
    }
    if (!srSupported) $("srNotice").classList.remove("hidden");
    updateStars();
  }

  // ---------- 놀이 진행 ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startRound(cat) {
    category = cat;
    queue = shuffle(cat.words).slice(0, ROUND_SIZE);
    index = 0;
    roundStars = 0;
    show("play");
    $("parentControls").classList.toggle("hidden", srSupported);
    $("btnMic").classList.toggle("hidden", !srSupported);
    showWord();
  }

  function current() { return queue[index]; }

  function showWord() {
    tries = 0;
    const { w, e } = current();
    $("wordText").textContent = w;
    // 문장·긴 낱말은 글자를 줄여 카드 밖으로 넘치지 않게
    $("wordText").classList.toggle("long", w.includes(" ") || w.length > 5);
    const hint = $("hintEmoji");
    hint.textContent = e;
    hint.classList.add("hidden");
    $("btnHint").classList.remove("hidden");
    setFeedback("", "");
    $("heardText").textContent = "";
    $("progressText").textContent = `${index + 1} / ${queue.length}`;
    $("progressFill").style.width = `${(index / queue.length) * 100}%`;
    $("wordCard").classList.remove("shake", "pop");
  }

  function setFeedback(msg, cls) {
    const fb = $("feedback");
    fb.textContent = msg;
    fb.className = "feedback" + (cls ? " " + cls : "");
  }

  const PRAISES = ["참 잘했어요!", "정말 멋져요!", "우와, 최고예요!", "딩동댕! 정답이에요!", "짝짝짝! 잘 읽었어요!"];

  async function onCorrect() {
    if (advancing) return;
    advancing = true;
    roundStars++;
    store.stars++;
    updateStars();
    $("progressFill").style.width = `${((index + 1) / queue.length) * 100}%`;
    const praise = PRAISES[Math.floor(Math.random() * PRAISES.length)];
    setFeedback("🎉 " + praise, "good");
    $("wordCard").classList.add("pop");
    soundGood();
    burstConfetti();
    await speak(praise, 1);
    await next(600);
  }

  async function onAlmost(heard) {
    setFeedback("🙂 아주 비슷해요! 한 번만 더!", "almost");
    if (heard) $("heardText").textContent = `이렇게 들렸어요: "${heard}"`;
    soundAlmost();
    await speak("아주 비슷해요. 한 번만 더 해 볼까요?", 1);
  }

  async function onWrong(heard) {
    setFeedback("💪 괜찮아요, 다시 해 봐요!", "retry");
    if (heard) $("heardText").textContent = `이렇게 들렸어요: "${heard}"`;
    $("wordCard").classList.add("shake");
    setTimeout(() => $("wordCard").classList.remove("shake"), 600);
    await speak("괜찮아요. 들어보기를 누르고 다시 따라 해 볼까요?", 1);
  }

  async function onGiveHelp() {
    if (advancing) return;
    advancing = true;
    // 여러 번 시도했으면 정답을 들려주고 다음으로
    setFeedback(`🔊 "${current().w}" 라고 읽어요`, "almost");
    $("hintEmoji").classList.remove("hidden");
    await speak(current().w, 0.75);
    await next(1200);
  }

  function next(delay = 0) {
    return new Promise((resolve) => {
      setTimeout(() => {
        index++;
        if (index >= queue.length) finishRound();
        else showWord();
        advancing = false;
        resolve();
      }, delay);
    });
  }

  function finishRound() {
    show("done");
    $("doneStars").textContent = (roundStars > 0 ? "⭐".repeat(roundStars) : "🙂") + `  (${roundStars} / ${queue.length})`;
    soundFanfare();
    burstConfetti(140);
    speak(`오늘 별을 ${roundStars}개 모았어요. 참 잘했어요!`, 1);
  }

  // ---------- 음성 인식 ----------
  function listen() {
    return new Promise((resolve, reject) => {
      recognition = new SR();
      recognition.lang = "ko-KR";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 5;

      const candidates = [];
      let settled = false;

      recognition.onresult = (ev) => {
        for (const result of ev.results) {
          for (const alt of result) candidates.push(alt.transcript);
        }
      };
      recognition.onerror = (ev) => {
        if (settled) return;
        settled = true;
        reject(new Error(ev.error));
      };
      recognition.onend = () => {
        if (settled) return;
        settled = true;
        resolve(candidates);
      };
      recognition.start();
    });
  }

  function setMicOverlay(on) {
    $("micOverlay").classList.toggle("hidden", !on);
  }

  async function onMic() {
    if (recognizing) return;
    ensureAudio();
    speechSynthesis.cancel();
    recognizing = true;
    setMicOverlay(true);
    try {
      const candidates = await listen();
      setMicOverlay(false);
      if (!candidates.length) {
        setFeedback("🔇 소리가 안 들렸어요. 다시 말해 볼까요?", "almost");
        return;
      }
      const { sim, heard } = scoreCandidates(current().w, candidates);
      tries++;
      if (sim >= 0.8) {
        await onCorrect();
      } else if (tries >= MAX_TRIES) {
        await onGiveHelp();
      } else if (sim >= 0.5) {
        await onAlmost(heard);
      } else {
        await onWrong(heard);
      }
    } catch (err) {
      setMicOverlay(false);
      if (err.message === "not-allowed" || err.message === "service-not-allowed") {
        setFeedback("🎤 마이크를 허용해 주세요 (설정 → Safari → 마이크)", "retry");
      } else if (err.message === "no-speech") {
        setFeedback("🔇 소리가 안 들렸어요. 크게 말해 볼까요?", "almost");
      } else if (err.message !== "aborted") {
        setFeedback("⚠️ 잠깐 문제가 있었어요. 다시 눌러 주세요", "retry");
      }
    } finally {
      recognizing = false;
    }
  }

  // ---------- 이벤트 ----------
  $("btnHome").addEventListener("click", () => { speechSynthesis.cancel(); show("home"); updateStars(); });
  $("btnDoneHome").addEventListener("click", () => { show("home"); updateStars(); });
  $("btnReplay").addEventListener("click", () => startRound(category));
  $("btnListen").addEventListener("click", () => { ensureAudio(); speak(current().w, 0.75); });
  $("btnMic").addEventListener("click", onMic);
  $("btnSkip").addEventListener("click", () => {
    if (advancing) return;
    advancing = true;
    speechSynthesis.cancel();
    next();
  });
  $("btnHint").addEventListener("click", () => {
    $("hintEmoji").classList.remove("hidden");
    $("btnHint").classList.add("hidden");
  });
  $("btnMicCancel").addEventListener("click", () => {
    if (recognition) recognition.abort();
    setMicOverlay(false);
  });

  // 부모님 확인 모드 (음성 인식 미지원 브라우저)
  $("btnParentOk").addEventListener("click", () => { ensureAudio(); onCorrect(); });
  $("btnParentRetry").addEventListener("click", () => {
    setFeedback("💪 다시 한 번 읽어 볼까요?", "almost");
  });

  // ---------- 시작 ----------
  renderHome();
  show("home");
})();
