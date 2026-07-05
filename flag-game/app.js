/* 국기 맞히기 놀이 — 음성으로 나라 이름을 맞히는 6세용 게임 */
(function () {
  "use strict";

  const ROUND_SIZE = 10;
  const CHOICE_COUNT = 3;

  // ---------- 화면 요소 ----------
  const screens = {
    start: document.getElementById("start-screen"),
    quiz: document.getElementById("quiz-screen"),
    info: document.getElementById("info-screen"),
    end: document.getElementById("end-screen"),
  };
  const el = {
    startBtn: document.getElementById("start-btn"),
    micNote: document.getElementById("mic-support-note"),
    homeBtn: document.getElementById("home-btn"),
    progress: document.getElementById("progress"),
    stars: document.getElementById("stars"),
    flag: document.getElementById("flag"),
    feedback: document.getElementById("feedback"),
    micBtn: document.getElementById("mic-btn"),
    micLabel: document.querySelector("#mic-btn .mic-label"),
    choices: document.getElementById("choices"),
    infoFlag: document.getElementById("info-flag"),
    infoName: document.getElementById("info-name"),
    infoFeature: document.getElementById("info-feature"),
    infoCapital: document.getElementById("info-capital"),
    infoHistory: document.getElementById("info-history"),
    replayVoiceBtn: document.getElementById("replay-voice-btn"),
    nextBtn: document.getElementById("next-btn"),
    restartBtn: document.getElementById("restart-btn"),
    endScore: document.getElementById("end-score"),
    endStars: document.getElementById("end-stars"),
  };

  // ---------- 게임 상태 ----------
  let round = [];        // 이번 판에 나올 나라들
  let current = 0;       // 현재 문제 번호
  let starCount = 0;     // 한 번에 맞힌 문제 수
  let missedThisQuestion = false;

  // ---------- 음성 인식 ----------
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechSupported = Boolean(SpeechRec);
  let recognition = null;
  let listening = false;

  if (!speechSupported) {
    el.micNote.textContent = "이 브라우저는 음성 인식이 안 돼서, 버튼을 눌러 답을 골라요.";
  } else {
    el.micNote.textContent = "마이크 사용을 허용해 주세요. 아이가 말로 정답을 맞힐 수 있어요!";
  }

  function normalize(text) {
    return String(text).toLowerCase().replace(/[\s.,!?~'"‘’“”·-]/g, "");
  }

  function transcriptMatches(transcript, country) {
    const heard = normalize(transcript);
    if (!heard) return false;
    return country.aliases.some((alias) => heard.includes(normalize(alias)));
  }

  function startListening() {
    if (!speechSupported || listening) return;
    recognition = new SpeechRec();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;

    listening = true;
    el.micBtn.classList.add("listening");
    el.micLabel.textContent = "듣고 있어요...";
    setFeedback("나라 이름을 크게 말해 보세요! 👂", "listening");

    recognition.onresult = (event) => {
      const alternatives = Array.from(event.results[0]).map((r) => r.transcript);
      const country = round[current];
      if (alternatives.some((t) => transcriptMatches(t, country))) {
        handleCorrect();
      } else {
        handleWrong(`"${alternatives[0].trim()}" 이라고 들렸어요. 다시 한번 말해 볼까요?`);
      }
    };
    recognition.onerror = (event) => {
      stopListeningUI();
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        el.micBtn.classList.add("hidden");
        setFeedback("마이크를 쓸 수 없어요. 아래 버튼으로 골라 보세요!", "");
      } else if (event.error !== "aborted") {
        setFeedback("잘 안 들렸어요. 마이크를 다시 눌러 보세요!", "");
      }
    };
    recognition.onend = stopListeningUI;

    try {
      recognition.start();
    } catch (_) {
      stopListeningUI();
    }
  }

  function stopListeningUI() {
    listening = false;
    el.micBtn.classList.remove("listening");
    el.micLabel.textContent = "눌러서 말하기";
  }

  function abortListening() {
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch (_) {}
      recognition = null;
    }
    stopListeningUI();
  }

  // ---------- 음성 안내 (TTS) ----------
  function speak(text, opts) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ko-KR";
    utter.rate = 0.95;
    utter.pitch = 1.1;
    const koVoice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang && v.lang.startsWith("ko"));
    if (koVoice) utter.voice = koVoice;
    if (opts && opts.onend) utter.onend = opts.onend;
    window.speechSynthesis.speak(utter);
  }

  // iOS는 사용자 터치 안에서 한 번 재생해야 이후 음성이 나온다
  function unlockSpeech() {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(" ");
    utter.volume = 0;
    window.speechSynthesis.speak(utter);
    window.speechSynthesis.getVoices(); // 목소리 목록 미리 불러오기
  }

  // ---------- 화면 전환 ----------
  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function setFeedback(text, cls) {
    el.feedback.textContent = text;
    el.feedback.className = "feedback" + (cls ? " " + cls : "");
  }

  // ---------- 게임 진행 ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startGame() {
    round = shuffle(COUNTRIES).slice(0, ROUND_SIZE);
    current = 0;
    starCount = 0;
    if (speechSupported) el.micBtn.classList.remove("hidden");
    show("quiz");
    showQuestion();
  }

  function showQuestion() {
    const country = round[current];
    missedThisQuestion = false;

    el.progress.textContent = `${current + 1} / ${round.length}`;
    el.stars.textContent = "⭐".repeat(Math.min(starCount, 5)) + (starCount > 5 ? `+${starCount - 5}` : "");

    // 국기 애니메이션 다시 재생
    el.flag.textContent = country.flag;
    el.flag.style.animation = "none";
    void el.flag.offsetWidth;
    el.flag.style.animation = "";

    setFeedback("", "");
    buildChoices(country);
    speak("이 나라는 어디일까요?");
  }

  function buildChoices(answer) {
    const others = shuffle(COUNTRIES.filter((c) => c !== answer)).slice(0, CHOICE_COUNT - 1);
    const options = shuffle([answer, ...others]);
    el.choices.innerHTML = "";
    options.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = c.name;
      btn.addEventListener("click", () => {
        if (c === answer) {
          btn.classList.add("right");
          handleCorrect();
        } else {
          btn.classList.add("wrong");
          btn.disabled = true;
          handleWrong(`음... ${c.name}이(가) 아니에요. 다시 골라 볼까요?`);
        }
      });
      el.choices.appendChild(btn);
    });
  }

  function handleWrong(message) {
    missedThisQuestion = true;
    setFeedback(message, "");
    speak("괜찮아요! 다시 한번 해 볼까요?");
  }

  function handleCorrect() {
    abortListening();
    if (!missedThisQuestion) starCount++;
    dropConfetti();

    const country = round[current];
    el.infoFlag.textContent = country.flag;
    el.infoName.textContent = country.name;
    el.infoFeature.textContent = country.feature;
    el.infoCapital.textContent = `이 나라의 수도는 ${country.capital}이에요.`;
    el.infoHistory.textContent = country.history;

    setTimeout(() => {
      show("info");
      speakCountryInfo(country);
    }, 600);
  }

  function speakCountryInfo(country) {
    const text =
      `딩동댕! 정답은 ${country.name}이에요! ` +
      `${country.feature} ` +
      `이 나라의 수도는 ${country.capital}이에요. ` +
      country.history;
    speak(text);
  }

  function nextQuestion() {
    window.speechSynthesis && window.speechSynthesis.cancel();
    current++;
    if (current >= round.length) {
      finishGame();
    } else {
      show("quiz");
      showQuestion();
    }
  }

  function finishGame() {
    el.endScore.textContent = `${round.length}문제 중에 ${starCount}문제를 한 번에 맞혔어요!`;
    el.endStars.textContent = starCount > 0 ? "⭐".repeat(starCount) : "💪";
    show("end");
    speak(
      starCount >= round.length * 0.7
        ? "우와, 정말 대단해요! 나라 박사님이네요!"
        : "참 잘했어요! 또 같이 놀아요!"
    );
  }

  function dropConfetti() {
    const emojis = ["🎉", "⭐", "🎊", "✨", "🌟"];
    for (let i = 0; i < 18; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti";
      piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.animationDuration = 1.2 + Math.random() * 1.3 + "s";
      piece.style.animationDelay = Math.random() * 0.3 + "s";
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3000);
    }
  }

  function goHome() {
    abortListening();
    window.speechSynthesis && window.speechSynthesis.cancel();
    show("start");
  }

  // ---------- 이벤트 연결 ----------
  el.startBtn.addEventListener("click", () => {
    unlockSpeech();
    startGame();
  });
  el.micBtn.addEventListener("click", () => {
    if (listening) {
      abortListening();
    } else {
      startListening();
    }
  });
  el.nextBtn.addEventListener("click", nextQuestion);
  el.replayVoiceBtn.addEventListener("click", () => speakCountryInfo(round[current]));
  el.restartBtn.addEventListener("click", startGame);
  el.homeBtn.addEventListener("click", goHome);

  // iOS Safari가 목소리 목록을 늦게 주는 경우 대비
  if ("speechSynthesis" in window && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
})();
