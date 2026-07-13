/*
 * 수학놀이터 — 애플펜슬로 배우는 수 개념 (6세)
 *
 * 교육 이론 배경
 *  - 세어 보고 쓰기  : 일대일 대응 세기 + 몬테소리 모래 숫자판(따라 쓰기)
 *  - 번쩍! 몇 개?    : 직산(subitizing), Number Talks의 점 패턴
 *  - 사과 가르기     : 수 가르기·모으기(한국 1학년), 싱가포르 수학 Number Bond
 *  - 10 만들기       : 십틀(ten frame), Make-10 덧셈 전략
 *  - 똑같이 나눠요   : 공평 분배(fair sharing) = 나눗셈의 원개념
 */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var ROUNDS = 5;
  var UNSURE_DISTANCE = 1.8; // recognizer 자가 테스트 기준(정상 ≤1.34, 낙서 ≥2.0)

  /* ================= 유틸 ================= */

  var NATIVE = ['영', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
  var NATIVE_DET = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ================= 음성(TTS) ================= */

  var tts = {
    ok: typeof speechSynthesis !== 'undefined',
    speak: function (text) {
      if (!this.ok) return;
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'ko-KR';
        u.rate = 0.95;
        u.pitch = 1.1;
        speechSynthesis.speak(u);
      } catch (e) { /* 음성 미지원 환경 */ }
    }
  };

  /* ================= 효과음(WebAudio) ================= */

  var sfx = (function () {
    var ctx = null;
    function ensure() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { return null; }
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, start, dur, type, vol) {
      var c = ensure();
      if (!c) return;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, c.currentTime + start);
      g.gain.linearRampToValueAtTime(vol || 0.18, c.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + start);
      o.stop(c.currentTime + start + dur + 0.05);
    }
    return {
      ensure: ensure,
      pop: function () { tone(660, 0, 0.12, 'triangle', 0.15); },
      tick: function () { tone(880, 0, 0.08, 'sine', 0.1); },
      good: function () { tone(523, 0, 0.18, 'triangle'); tone(659, 0.12, 0.18, 'triangle'); tone(784, 0.24, 0.3, 'triangle'); },
      bad: function () { tone(300, 0, 0.2, 'sine', 0.12); tone(240, 0.18, 0.28, 'sine', 0.12); },
      fanfare: function () {
        [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.13, 0.25, 'triangle', 0.16); });
        tone(1319, 0.55, 0.5, 'triangle', 0.14);
      }
    };
  })();

  document.addEventListener('pointerdown', function () { sfx.ensure(); }, true);

  /* ================= 폭죽 ================= */

  var confetti = (function () {
    var canvas = document.getElementById('confetti');
    var ctx = canvas.getContext('2d');
    var parts = [];
    var running = false;
    var COLORS = ['#ff8fab', '#ffd93d', '#7ed957', '#6bc5ff', '#c39bff', '#ff9d5c'];

    function resize() {
      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
    }
    resize();
    addEventListener('resize', resize);

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts = parts.filter(function (p) { return p.y < canvas.height + 40 && p.life > 0; });
      if (!parts.length) { running = false; return; }
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12 * devicePixelRatio;
        p.rot += p.vr; p.life--;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      });
      requestAnimationFrame(loop);
    }

    return {
      burst: function (n) {
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        n = n || 120;
        var dpr = devicePixelRatio;
        for (var i = 0; i < n; i++) {
          parts.push({
            x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.5,
            y: canvas.height * 0.25,
            vx: (Math.random() - 0.5) * 9 * dpr,
            vy: (Math.random() * -6 - 2) * dpr,
            vr: (Math.random() - 0.5) * 0.3,
            rot: Math.random() * Math.PI,
            s: (6 + Math.random() * 8) * dpr,
            life: 140 + Math.random() * 60,
            color: pick(COLORS)
          });
        }
        if (!running) { running = true; loop(); }
      }
    };
  })();

  /* ================= 별 저장 ================= */

  var store = {
    key: 'mathplay.stars.v1',
    data: (function () {
      try { return JSON.parse(localStorage.getItem('mathplay.stars.v1')) || {}; }
      catch (e) { return {}; }
    })(),
    add: function (game, n) {
      this.data[game] = (this.data[game] || 0) + n;
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* 시크릿 모드 등 */ }
    },
    get: function (game) { return this.data[game] || 0; }
  };

  /* ================= 잉크 패드 (펜슬/터치 필기) ================= */

  function InkPad(canvas, opts) {
    opts = opts || {};
    var self = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = [];
    this.onStrokeEnd = opts.onStrokeEnd || null;
    this.onInk = opts.onInk || null;
    this.idleMs = opts.idleMs || 0;
    this.onIdle = opts.onIdle || null;
    this.enabled = true;
    this._cur = null;
    this._lastPenAt = 0;
    this._idleTimer = null;

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      self.redraw();
    }
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    resize();

    function toLocal(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function down(e) {
      if (!self.enabled) return;
      var now = e.timeStamp || Date.now();
      if (e.pointerType === 'pen') self._lastPenAt = now;
      // 팜 리젝션: 펜으로 그리는 도중이거나 펜을 막 뗀 직후(700ms)의 터치는
      // 손바닥이 닿은 것으로 보고 무시한다. 펜을 한동안 안 쓰면 손가락이 다시 먹힌다.
      if (e.pointerType === 'touch') {
        var penActive = self._cur && self._cur.type === 'pen';
        var recentPen = self._lastPenAt && (now - self._lastPenAt) < 700;
        if (penActive || recentPen) return;
      }
      e.preventDefault();
      if (self._idleTimer) { clearTimeout(self._idleTimer); self._idleTimer = null; }
      canvas.setPointerCapture(e.pointerId);
      self._cur = { id: e.pointerId, type: e.pointerType, pts: [toLocal(e)] };
    }

    function move(e) {
      if (!self._cur || e.pointerId !== self._cur.id) return;
      e.preventDefault();
      var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      events.forEach(function (ev) {
        var p = toLocal(ev);
        var pts = self._cur.pts;
        var last = pts[pts.length - 1];
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 1) return;
        pts.push(p);
        self._drawSeg(pts[pts.length - 2], p);
      });
    }

    function up(e) {
      if (!self._cur || e.pointerId !== self._cur.id) return;
      var stroke = self._cur.pts;
      self._cur = null;
      // 점 하나짜리 낙서(우연한 터치)는 버림
      var len = 0;
      for (var i = 1; i < stroke.length; i++) {
        len += Math.abs(stroke[i].x - stroke[i - 1].x) + Math.abs(stroke[i].y - stroke[i - 1].y);
      }
      if (stroke.length < 3 || len < 6) { self.redraw(); return; }
      self.strokes.push(stroke);
      if (self.onInk) self.onInk();
      if (self.onStrokeEnd) self.onStrokeEnd(stroke);
      if (self.onIdle && self.idleMs) {
        self._idleTimer = setTimeout(function () { self.onIdle(self.strokes); }, self.idleMs);
      }
    }

    this._down = down; this._move = move; this._up = up;
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  InkPad.prototype._drawSeg = function (a, b) {
    var ctx = this.ctx, d = devicePixelRatio;
    ctx.strokeStyle = '#3a3d7a';
    ctx.lineWidth = 6 * d;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x * d, a.y * d);
    ctx.lineTo(b.x * d, b.y * d);
    ctx.stroke();
  };

  InkPad.prototype.redraw = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    var self = this;
    this.strokes.forEach(function (s) {
      for (var i = 1; i < s.length; i++) self._drawSeg(s[i - 1], s[i]);
    });
  };

  InkPad.prototype.clear = function () {
    this.strokes = [];
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  InkPad.prototype.destroy = function () {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this._down);
    this.canvas.removeEventListener('pointermove', this._move);
    this.canvas.removeEventListener('pointerup', this._up);
    this.canvas.removeEventListener('pointercancel', this._up);
  };

  /* ================= 게임 공통 셸 ================= */

  function gameShell(def) {
    app.innerHTML = '';
    var root = el('div', 'game');

    var head = el('div', 'game-head');
    var backBtn = el('button', 'btn-round', '🏠');
    backBtn.setAttribute('aria-label', '처음으로');
    backBtn.addEventListener('click', function () { tts.ok && speechSynthesis.cancel(); showHome(); });
    var prompt = el('div', 'prompt-bar', '');
    var speakBtn = el('button', 'btn-round', '🔊');
    speakBtn.setAttribute('aria-label', '문제 다시 듣기');
    var lastPrompt = '';
    speakBtn.addEventListener('click', function () { if (lastPrompt) tts.speak(lastPrompt); });
    var starRow = el('div', 'star-row', '');
    head.appendChild(backBtn);
    head.appendChild(prompt);
    head.appendChild(speakBtn);
    head.appendChild(starRow);

    var body = el('div', 'game-body');
    var stage = el('div', 'stage');
    body.appendChild(stage);

    root.appendChild(head);
    root.appendChild(body);
    app.appendChild(root);

    var shell = {
      root: root, body: body, stage: stage,
      stars: 0,
      setPrompt: function (text, speech) {
        prompt.innerHTML = '<span>' + def.emoji + '</span> ' + text;
        lastPrompt = speech || text;
        tts.speak(lastPrompt);
      },
      addStar: function () {
        this.stars++;
        this.renderStars();
        sfx.tick();
      },
      renderStars: function () {
        var html = '';
        for (var i = 0; i < ROUNDS; i++) {
          html += i < this.stars ? '⭐' : '<span class="off">⭐</span>';
        }
        starRow.innerHTML = html;
      },
      finish: function () {
        store.add(def.id, this.stars);
        var fin = el('div', 'finish');
        var starsTxt = '';
        for (var i = 0; i < this.stars; i++) starsTxt += '⭐';
        fin.appendChild(el('div', 'fin-stars', starsTxt || '🌱'));
        var msg = this.stars >= ROUNDS ? '와! 다 맞혔어요!' : '참 잘했어요!';
        fin.appendChild(el('div', 'fin-msg', msg));
        var btns = el('div', 'fin-btns');
        var again = el('button', 'btn-primary', '또 하기');
        again.addEventListener('click', function () { startGame(def); });
        var home = el('button', 'btn-secondary', '처음으로');
        home.addEventListener('click', showHome);
        btns.appendChild(again);
        btns.appendChild(home);
        fin.appendChild(btns);
        stage.appendChild(fin);
        confetti.burst(this.stars >= ROUNDS ? 200 : 90);
        sfx.fanfare();
        tts.speak(this.stars > 0
          ? msg + ' 별을 ' + NATIVE_DET[this.stars] + ' 개 모았어요!'
          : msg + ' 다음엔 더 잘할 수 있어요!');
      }
    };
    shell.renderStars();
    return shell;
  }

  /* ================= 쓰기 패널 ================= */

  function writePanel(shell) {
    var panel = el('div', 'write-panel');
    var box = el('div', 'write-box');
    var canvas = document.createElement('canvas');
    var hint = el('div', 'write-hint', '여기에 펜으로 숫자를 써요 ✏️');
    var guide = el('div', 'trace-guide', '');
    var feedback = el('div', 'write-feedback');
    var fbBig = el('div', 'fb-big', '');
    var fbMsg = el('div', 'fb-msg', '');
    feedback.appendChild(fbBig);
    feedback.appendChild(fbMsg);
    box.appendChild(canvas);
    box.appendChild(guide);
    box.appendChild(hint);
    box.appendChild(feedback);

    var actions = el('div', 'write-actions');
    var checkBtn = el('button', 'btn-big btn-check', '✔ 다 썼어요!');
    var eraseBtn = el('button', 'btn-big btn-erase', '🧽 지우기');
    actions.appendChild(checkBtn);
    actions.appendChild(eraseBtn);

    panel.appendChild(box);
    panel.appendChild(actions);
    shell.body.appendChild(panel);

    var state = { expected: null, onCorrect: null, onWrong: null, wrongCount: 0, locked: false };

    var pad = new InkPad(canvas, {
      idleMs: 1300,
      onIdle: function () { attempt(); },
      onInk: function () { hint.style.display = 'none'; }
    });

    function attempt() {
      if (state.locked || state.expected === null || !pad.strokes.length) return;
      var res = window.DigitRecognizer.recognize(pad.strokes);
      if (!res || res.distance > UNSURE_DISTANCE) {
        showFeedback('bad', '🤔', '음… 잘 모르겠어요. 다시 써 볼까요?', '음, 잘 모르겠어요. 또박또박 다시 써 볼까요?');
        return;
      }
      if (res.digit === state.expected) {
        state.locked = true;
        pad.clear();
        sfx.good();
        feedback.className = 'write-feedback show good';
        fbBig.textContent = String(res.digit);
        fbMsg.textContent = '딩동댕! 맞았어요!';
        if (state.onCorrect) state.onCorrect();
      } else {
        state.wrongCount++;
        showFeedback('bad', String(res.digit), '"' + res.digit + '"라고 썼네요. 다시 세어 볼까요?',
          res.digit + '라고 썼네요. 다시 한번 잘 세어 볼까요?');
        if (state.onWrong) state.onWrong(state.wrongCount);
      }
    }

    function showFeedback(kind, big, msg, speech) {
      sfx.bad();
      feedback.className = 'write-feedback show ' + kind;
      fbBig.textContent = big;
      fbMsg.textContent = msg;
      box.classList.add('shake');
      tts.speak(speech);
      setTimeout(function () {
        box.classList.remove('shake');
        feedback.className = 'write-feedback';
        pad.clear();
      }, 1400);
    }

    checkBtn.addEventListener('click', attempt);
    eraseBtn.addEventListener('click', function () { pad.clear(); });

    return {
      pad: pad,
      /** 새 문제 출제: expected 숫자, guideDigit(따라 쓰기 안내, null이면 없음) */
      ask: function (expected, guideDigit, onCorrect, onWrong) {
        state.expected = expected;
        state.onCorrect = onCorrect;
        state.onWrong = onWrong || null;
        state.wrongCount = 0;
        state.locked = false;
        guide.textContent = guideDigit === null || guideDigit === undefined ? '' : String(guideDigit);
        feedback.className = 'write-feedback';
        hint.style.display = '';
        pad.clear();
      },
      clearFeedback: function () { feedback.className = 'write-feedback'; }
    };
  }

  /* ================= 게임 1: 세어 보고 쓰기 ================= */

  var COUNT_EMOJI = ['🍓', '🐤', '🎈', '🐟', '🦋', '🍩', '🚗', '🐞'];

  function runCount(def) {
    var shell = gameShell(def);
    var panel = writePanel(shell);
    var round = 0;

    function nextRound() {
      if (round >= ROUNDS) { shell.finish(); return; }
      var n = [randInt(1, 3), randInt(2, 5), randInt(3, 6), randInt(5, 8), randInt(6, 9)][round];
      var emoji = pick(COUNT_EMOJI);
      shell.stage.innerHTML = '';
      var field = el('div', 'obj-field');
      var counted = 0;
      for (var i = 0; i < n; i++) {
        (function () {
          var obj = el('div', 'count-obj', emoji);
          obj.addEventListener('pointerdown', function () {
            if (obj.classList.contains('counted')) return;
            counted++;
            obj.dataset.n = counted;
            obj.classList.add('counted', 'pulse');
            sfx.pop();
            tts.speak(NATIVE[counted]);
          });
          field.appendChild(obj);
        })();
      }
      shell.stage.appendChild(field);

      shell.setPrompt('그림을 하나씩 콕콕 눌러 세고, 숫자를 써 보세요!',
        '그림을 하나씩 눌러서 세어 보고, 몇 개인지 펜으로 숫자를 써 보세요!');

      // 처음 두 판은 따라 쓰기 안내(몬테소리 모래 숫자판)
      var guide = round < 2 ? n : null;
      panel.ask(n, guide, function onCorrect() {
        shell.addStar();
        tts.speak(NATIVE_DET[n] + ' 개! 정말 잘 세었어요!');
        confetti.burst(50);
        round++;
        setTimeout(nextRound, 1800);
      }, function onWrong(cnt) {
        if (cnt >= 2) hintCount(field, n);
      });
    }

    /* 힌트: 하나씩 짚으며 함께 세기 */
    function hintCount(field, n) {
      var objs = field.querySelectorAll('.count-obj');
      tts.speak('선생님이랑 같이 세어 볼까요?');
      var i = 0;
      var timer = setInterval(function () {
        if (i >= n) { clearInterval(timer); return; }
        var o = objs[i];
        o.dataset.n = i + 1;
        o.classList.add('counted', 'pulse');
        sfx.pop();
        i++;
      }, 650);
    }

    nextRound();
  }

  /* ================= 게임 2: 번쩍! 몇 개? (직산) ================= */

  var DICE = {
    1: [[50, 50]],
    2: [[32, 32], [68, 68]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[32, 32], [68, 32], [32, 68], [68, 68]],
    5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[32, 26], [68, 26], [32, 50], [68, 50], [32, 74], [68, 74]]
  };

  function dotLayout(n) {
    if (n <= 6) return DICE[n];
    // 7~9는 5+나머지 두 무리로 → "5를 기준으로 보는" 수 감각
    var left = DICE[5].map(function (p) { return [p[0] * 0.5, p[1]]; });
    var right = DICE[n - 5].map(function (p) { return [50 + p[0] * 0.5, p[1]]; });
    return left.concat(right);
  }

  function runFlash(def) {
    var shell = gameShell(def);
    var panel = writePanel(shell);
    var round = 0;

    function nextRound() {
      if (round >= ROUNDS) { shell.finish(); return; }
      var n = [randInt(2, 3), randInt(3, 5), randInt(4, 6), randInt(5, 8), randInt(6, 9)][round];
      var showMs = round < 2 ? 2200 : 1500;
      var emoji = pick(['⭐', '🌟', '🐥', '🍬']);
      shell.stage.innerHTML = '';

      var dots = dotLayout(n).map(function (p) {
        var d = el('div', 'flash-dot', emoji);
        d.style.left = p[0] + '%';
        d.style.top = p[1] + '%';
        shell.stage.appendChild(d);
        return d;
      });

      var timerBar = el('div', 'flash-timer');
      timerBar.style.width = '100%';
      timerBar.style.transition = 'width ' + showMs + 'ms linear';
      shell.stage.appendChild(timerBar);

      var cover = el('div', 'flash-cover');
      cover.appendChild(el('div', '', '🌥️'));
      cover.appendChild(el('div', 'fc-msg', '몇 개였을까? 숫자로 써 보세요!'));
      var peek = el('button', 'btn-peek', '👀 한 번 더 보기');
      cover.appendChild(peek);
      shell.stage.appendChild(cover);

      function hide() { cover.classList.add('show'); }
      function show(ms) {
        cover.classList.remove('show');
        timerBar.style.transition = 'none';
        timerBar.style.width = '100%';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            timerBar.style.transition = 'width ' + ms + 'ms linear';
            timerBar.style.width = '0%';
          });
        });
        setTimeout(hide, ms);
      }

      peek.addEventListener('click', function () { show(1200); });

      shell.setPrompt('번쩍! 몇 개인지 한눈에 알아맞혀요!',
        '별이 잠깐 나타났다 숨어요! 몇 개였는지 한눈에 알아맞혀 보세요!');
      show(showMs);

      panel.ask(n, null, function onCorrect() {
        cover.classList.remove('show');
        dots.forEach(function (d) { d.style.transform = 'translate(-50%,-50%) scale(1.25)'; });
        shell.addStar();
        tts.speak('맞아요! ' + NATIVE_DET[n] + ' 개였어요!');
        confetti.burst(50);
        round++;
        setTimeout(nextRound, 1900);
      }, function onWrong(cnt) {
        if (cnt >= 2) {
          // 두 번 틀리면 아예 보여 주고 세게 한다
          cover.classList.remove('show');
          tts.speak('숨기지 않을게요. 천천히 세어 보세요!');
        }
      });
    }

    nextRound();
  }

  /* ================= 게임 3: 사과 가르기 (수 가르기 = number bond) ================= */

  function runSplit(def) {
    var shell = gameShell(def);
    var round = 0;
    var NS = [4, 5, 6, 8, 9];

    function nextRound() {
      if (round >= ROUNDS) { shell.finish(); return; }
      var n = NS[round];
      shell.stage.innerHTML = '';

      var row = el('div', 'split-row');
      var objs = [];
      for (var i = 0; i < n; i++) {
        var o = el('div', 'split-obj', '🍎');
        row.appendChild(o);
        objs.push(o);
      }
      shell.stage.appendChild(row);

      var eq = el('div', 'big-equation');
      shell.stage.appendChild(eq);

      var msg = el('div', 'stage-msg');
      shell.stage.appendChild(msg);

      var canvas = document.createElement('canvas');
      canvas.className = 'ink-overlay';
      shell.stage.appendChild(canvas);

      shell.setPrompt('사과 ' + n + '개! 사이에 선을 그어 두 무리로 갈라요',
        '사과가 ' + NATIVE_DET[n] + ' 개 있어요. 사과 사이에 위에서 아래로 선을 그어서, 두 무리로 갈라 보세요!');

      var done = false;
      var pad = new InkPad(canvas, {
        onStrokeEnd: function (stroke) {
          if (done) { pad.clear(); return; }
          var minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, sumX = 0;
          stroke.forEach(function (p) {
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            sumX += p.x;
          });
          var h = maxY - minY, w = maxX - minX;
          var stageH = shell.stage.getBoundingClientRect().height;

          if (h < stageH * 0.25 || h < w) {
            pad.clear();
            flashMsg('위에서 아래로 ↕ 길게 그어 보세요!');
            return;
          }
          var splitX = sumX / stroke.length;
          var stageRect = shell.stage.getBoundingClientRect();
          var left = 0;
          objs.forEach(function (o) {
            var r = o.getBoundingClientRect();
            var cx = r.left + r.width / 2 - stageRect.left;
            if (cx < splitX) left++;
          });
          if (left === 0 || left === n) {
            pad.clear();
            flashMsg('사과 사이에 그어야 갈라져요!');
            return;
          }
          done = true;
          var right = n - left;
          objs.forEach(function (o, i) { o.classList.add(i < left ? 'go-left' : 'go-right'); });
          setTimeout(function () { pad.clear(); }, 350);
          eq.innerHTML = n + ' = <span class="eq-a">' + left + '</span> + <span class="eq-b">' + right + '</span>';
          eq.classList.add('show');
          sfx.good();
          tts.speak(NATIVE[n] + '는 ' + NATIVE[left] + '와 ' + NATIVE[right] + '로 가를 수 있어요!');
          shell.addStar();
          confetti.burst(50);
          round++;
          setTimeout(function () { pad.destroy(); nextRound(); }, 2600);
        }
      });

      function flashMsg(text) {
        msg.textContent = text;
        msg.classList.add('show');
        sfx.bad();
        tts.speak(text.replace('↕', ''));
        setTimeout(function () { msg.classList.remove('show'); }, 1600);
      }
    }

    nextRound();
  }

  /* ================= 게임 4: 10 만들기 (십틀) ================= */

  function runTen(def) {
    var shell = gameShell(def);
    var panel = writePanel(shell);
    var round = 0;
    var KS = [9, 5, 8, 6, 7]; // 채워져 있는 개수 (답 = 10-k)

    function nextRound() {
      if (round >= ROUNDS) { shell.finish(); return; }
      var k = KS[round];
      var answer = 10 - k;
      shell.stage.innerHTML = '';

      var wrap = el('div', 'ten-frame-wrap');
      var frame = el('div', 'ten-frame');
      var cells = [];
      for (var i = 0; i < 10; i++) {
        var c = el('div', 'tf-cell', i < k ? '<span>🍎</span>' : '');
        frame.appendChild(c);
        cells.push(c);
      }
      wrap.appendChild(frame);
      wrap.appendChild(el('div', 'ten-caption', '🍎 ' + k + '개 · 빈 칸은 몇 개?'));
      shell.stage.appendChild(wrap);

      shell.setPrompt('몇 개 더 있으면 10이 될까요? 숫자를 써요!',
        '사과가 ' + NATIVE_DET[k] + ' 개 있어요. 몇 개 더 있으면 열 개가 될까요? 빈 칸을 세어 보고 숫자를 써 보세요!');

      panel.ask(answer, null, function onCorrect() {
        // 빈 칸이 하나씩 채워지는 애니메이션 → 10 완성 경험
        var i = k;
        var timer = setInterval(function () {
          if (i >= 10) {
            clearInterval(timer);
            tts.speak(k + ' 더하기 ' + answer + '는 10! 십틀이 가득 찼어요!');
            return;
          }
          cells[i].innerHTML = '<span class="drop-in">🍏</span>';
          sfx.pop();
          i++;
        }, 320);
        shell.addStar();
        confetti.burst(50);
        round++;
        setTimeout(nextRound, 2400 + answer * 320);
      }, function onWrong(cnt) {
        if (cnt >= 2) {
          tts.speak('빈 칸을 콕콕 짚으면서 세어 보세요!');
        }
      });
    }

    nextRound();
  }

  /* ================= 게임 5: 똑같이 나눠요 (공평 분배 = 나눗셈 개념) ================= */

  function runShare(def) {
    var shell = gameShell(def);
    var round = 0;
    var SETUPS = [
      { c: 4, f: 2 }, { c: 6, f: 2 }, { c: 6, f: 3 }, { c: 8, f: 2 }, { c: 9, f: 3 }
    ];
    var FACES = ['🐰', '🐻', '🦊'];

    function nextRound() {
      if (round >= ROUNDS) { shell.finish(); return; }
      var setup = SETUPS[round];
      var nCookie = setup.c, nFriend = setup.f;
      shell.stage.innerHTML = '';

      var jar = el('div', 'share-jar');
      jar.appendChild(el('div', 'share-jar-label', '🍪 쿠키 바구니'));
      shell.stage.appendChild(jar);

      var eq = el('div', 'big-equation');
      shell.stage.appendChild(eq);
      var msg = el('div', 'stage-msg');
      shell.stage.appendChild(msg);

      // 친구들
      var friends = [];
      for (var f = 0; f < nFriend; f++) {
        var fr = el('div', 'share-friend');
        fr.style.left = ((f + 1) * 100 / (nFriend + 1)) + '%';
        fr.appendChild(el('div', 'sf-face', FACES[f]));
        fr.appendChild(el('div', 'sf-plate', '🍽️'));
        var cnt = el('div', 'sf-count', '0개');
        fr.appendChild(cnt);
        shell.stage.appendChild(fr);
        friends.push({ el: fr, count: cnt, cookies: 0 });
      }

      // 쿠키 (바구니 영역 안에 격자로)
      var cookies = [];
      var cols = Math.ceil(nCookie / 2);
      for (var i = 0; i < nCookie; i++) {
        var ck = el('div', 'share-cookie', '🍪');
        var col = i % cols, rowi = Math.floor(i / cols);
        var homeX = 18 + (col + 0.5) * (64 / cols);
        var homeY = 10 + rowi * 16 + 8;
        ck.style.left = homeX + '%';
        ck.style.top = homeY + '%';
        ck.dataset.home = homeX + ',' + homeY;
        ck.dataset.owner = '';
        shell.stage.appendChild(ck);
        cookies.push(ck);
      }

      var canvas = document.createElement('canvas');
      canvas.className = 'ink-overlay';
      shell.stage.appendChild(canvas);

      shell.setPrompt('쿠키 ' + nCookie + '개를 ' + nFriend + '명에게 똑같이!',
        '쿠키 ' + NATIVE_DET[nCookie] + ' 개를 친구 ' + NATIVE_DET[nFriend] +
        ' 명에게 똑같이 나눠 주세요! 쿠키에서 접시까지 펜으로 선을 그어요.');

      var locked = false;

      function stagePos(elem) {
        var sr = shell.stage.getBoundingClientRect();
        var r = elem.getBoundingClientRect();
        return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top, w: r.width };
      }

      function nearest(list, p, maxDist) {
        var best = null, bd = Infinity;
        list.forEach(function (item) {
          var q = stagePos(item.el || item);
          var d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < bd) { bd = d; best = item; }
        });
        return bd <= maxDist ? best : null;
      }

      function updateCounts() {
        friends.forEach(function (fr, i) {
          fr.cookies = cookies.filter(function (c) { return c.dataset.owner === String(i); }).length;
          fr.count.textContent = fr.cookies + '개';
        });
      }

      function giveCookie(cookie, fi) {
        cookie.dataset.owner = String(fi);
        var plate = friends[fi].el.querySelector('.sf-plate');
        var sr = shell.stage.getBoundingClientRect();
        var pr = plate.getBoundingClientRect();
        var idx = cookies.filter(function (c) { return c.dataset.owner === String(fi); }).length;
        var px = (pr.left + pr.width / 2 - sr.left) / sr.width * 100 + (idx - 2) * 3.4;
        var py = (pr.top + pr.height * 0.28 - sr.top) / sr.height * 100;
        cookie.style.left = px + '%';
        cookie.style.top = py + '%';
        sfx.pop();
        updateCounts();
        if (cookies.every(function (c) { return c.dataset.owner !== ''; })) {
          setTimeout(evaluate, 550);
        }
      }

      function takeBack(cookie) {
        cookie.dataset.owner = '';
        var home = cookie.dataset.home.split(',');
        cookie.style.left = home[0] + '%';
        cookie.style.top = home[1] + '%';
        updateCounts();
      }

      function evaluate() {
        if (locked) return;
        var counts = friends.map(function (f) { return f.cookies; });
        var equal = counts.every(function (c) { return c === counts[0]; });
        if (equal) {
          locked = true;
          var each = counts[0];
          eq.innerHTML = nCookie + '개 ÷ ' + nFriend + '명 = <span class="eq-a">' + each + '개씩</span>';
          eq.classList.add('show');
          sfx.good();
          confetti.burst(60);
          tts.speak('쿠키 ' + NATIVE_DET[nCookie] + ' 개를 ' + NATIVE_DET[nFriend] +
            ' 명이 나누면 ' + NATIVE_DET[each] + ' 개씩! 모두 똑같아서 행복해요!');
          shell.addStar();
          round++;
          setTimeout(function () { pad.destroy(); nextRound(); }, 3000);
        } else {
          var minC = Math.min.apply(null, counts);
          var sadIdx = counts.indexOf(minC);
          friends.forEach(function (f, i) { f.el.classList.toggle('sad', i === sadIdx); });
          msg.textContent = FACES[sadIdx] + ' 접시가 더 적어요!';
          msg.classList.add('show');
          sfx.bad();
          tts.speak('어? ' + '접시에 놓인 쿠키 수가 달라요. 똑같이 다시 나눠 볼까요?');
          setTimeout(function () {
            msg.classList.remove('show');
            friends.forEach(function (f) { f.el.classList.remove('sad'); });
            cookies.forEach(takeBack);
          }, 2200);
        }
      }

      var pad = new InkPad(canvas, {
        onStrokeEnd: function (stroke) {
          pad.clear();
          if (locked) return;
          var start = stroke[0], end = stroke[stroke.length - 1];
          var free = cookies.filter(function (c) { return c.dataset.owner === ''; });
          var given = cookies.filter(function (c) { return c.dataset.owner !== ''; });

          var cookie = nearest(free, start, 70);
          if (cookie) {
            var friendEls = friends.map(function (f) { return f.el; });
            var fEl = nearest(friendEls, end, 130);
            if (fEl) { giveCookie(cookie, friendEls.indexOf(fEl)); return; }
          }
          // 접시 위 쿠키에서 바구니로 되돌리는 선
          var back = nearest(given, start, 60);
          if (back) {
            var jarPos = stagePos(jar);
            var jr = jar.getBoundingClientRect();
            var sr = shell.stage.getBoundingClientRect();
            if (end.x > jr.left - sr.left && end.x < jr.right - sr.left &&
                end.y > jr.top - sr.top && end.y < jr.bottom - sr.top) {
              takeBack(back);
              sfx.tick();
            }
          }
        }
      });
    }

    nextRound();
  }

  /* ================= 홈 화면 ================= */

  var GAMES = [
    { id: 'count', emoji: '🍓', name: '세어 보고 쓰기', desc: '콕콕 누르며 세고, 펜으로 숫자 쓰기', run: runCount },
    { id: 'flash', emoji: '✨', name: '번쩍! 몇 개?', desc: '한눈에 알아맞히는 수 감각 놀이', run: runFlash },
    { id: 'split', emoji: '🍎', name: '사과 가르기', desc: '선을 그어 수를 두 무리로 가르기', run: runSplit },
    { id: 'ten', emoji: '🐣', name: '10 만들기', desc: '십틀을 채워서 10과 친해지기', run: runTen },
    { id: 'share', emoji: '🍪', name: '똑같이 나눠요', desc: '친구들에게 공평하게 나눠 주기', run: runShare }
  ];

  var PARENT_NOTE =
    '<h2>부모님께 — 무엇을 배우나요?</h2>' +
    '<p>이 앱은 연산 반복 훈련이 아니라, 검증된 수학 교육 이론에 기반해 <b>수 개념의 원리</b>를 몸으로 익히게 합니다. 애플펜슬(또는 손가락)로 직접 쓰고 긋는 활동이 핵심입니다.</p>' +
    '<ul>' +
    '<li><b>세어 보고 쓰기</b> — 하나씩 짚으며 세는 <b>일대일 대응</b>과 몬테소리 모래 숫자판식 <b>숫자 따라 쓰기</b></li>' +
    '<li><b>번쩍! 몇 개?</b> — 세지 않고 한눈에 양을 파악하는 <b>직산(subitizing)</b>. 주사위·5묶음 패턴으로 수 감각을 키워요</li>' +
    '<li><b>사과 가르기</b> — 초등 1학년 <b>가르기와 모으기</b>, 싱가포르 수학의 <b>Number Bond</b>. 덧셈·뺄셈의 뿌리입니다</li>' +
    '<li><b>10 만들기</b> — <b>십틀(ten frame)</b>로 10의 보수를 익혀요. 받아올림 덧셈의 핵심 전략(Make-10)</li>' +
    '<li><b>똑같이 나눠요</b> — <b>공평 분배</b>로 나눗셈의 원개념을 놀이로 경험해요</li>' +
    '</ul>' +
    '<p>팁: 아이패드 사파리에서 <b>공유 → 홈 화면에 추가</b>를 하면 전체 화면 앱처럼 쓸 수 있어요. 스피커 버튼 🔊 을 누르면 문제를 다시 읽어 줍니다.</p>';

  function showHome() {
    app.innerHTML = '';
    var home = el('div', 'home');
    home.appendChild(el('h1', 'home-title', '🎨 수학놀이터'));
    home.appendChild(el('div', 'home-sub', '펜슬로 쓰고, 긋고, 나누면서 수의 원리를 배워요'));

    var grid = el('div', 'card-grid');
    GAMES.forEach(function (g) {
      var card = el('button', 'game-card');
      card.appendChild(el('div', 'g-emoji', g.emoji));
      card.appendChild(el('div', 'g-name', g.name));
      card.appendChild(el('div', 'g-desc', g.desc));
      var stars = store.get(g.id);
      card.appendChild(el('div', 'g-stars', stars ? '⭐ ' + stars : '　'));
      card.addEventListener('click', function () { startGame(g); });
      grid.appendChild(card);
    });
    home.appendChild(grid);

    var foot = el('div', 'home-foot');
    var link = el('button', 'parent-link', '부모님께: 무엇을 배우나요?');
    link.addEventListener('click', function () {
      var overlay = el('div', 'parent-note');
      var box = el('div', 'pn-box', PARENT_NOTE);
      var close = el('button', 'pn-close', '닫기');
      close.addEventListener('click', function () { overlay.remove(); });
      box.appendChild(close);
      overlay.appendChild(box);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    });
    foot.appendChild(link);
    home.appendChild(foot);

    app.appendChild(home);
  }

  function startGame(def) {
    def.run(def);
  }

  showHome();
})();
