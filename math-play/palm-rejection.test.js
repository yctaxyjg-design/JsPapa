/*
 * 팜 리젝션 회귀 테스트 — 의존성 없이 Node로 실행.
 *   node math-play/palm-rejection.test.js
 * 핵심: 700ms를 넘는 긴 애플펜슬 필기 직후의 손바닥 터치도 걸러지는지
 * (펜 시각을 pointerup에서 갱신하지 않으면 회귀하는 지점).
 */
'use strict';

var PalmGate = require('./palm-rejection.js').PalmGate;

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + name);
}

// 1) 펜 입력은 항상 그리기로 받아들인다
check('펜 down은 통과', new PalmGate().shouldStart('pen', 1000, false) === true);

// 2) 처음부터 손가락(펜 이력 없음)은 통과 — 펜 없는 기기 지원
check('펜 이력 없으면 손가락 통과', new PalmGate().shouldStart('touch', 1000, false) === true);

// 3) 펜으로 그리는 도중(penActive)의 손바닥 터치는 거부
check('펜 그리는 중 손바닥 거부', new PalmGate().shouldStart('touch', 1000, /*penActive*/ true) === false);

// 4) 짧은 펜 터치 직후(700ms 이내)의 손바닥 거부
(function () {
  var g = new PalmGate(700);
  g.shouldStart('pen', 1000, false);      // 펜 down → lastPenAt=1000
  g.penSeen(1100);                         // pen up
  check('펜 뗀 직후(100ms) 손바닥 거부', g.shouldStart('touch', 1200, false) === false);
})();

// 5) ★회귀 케이스★ — 700ms를 넘는 긴 필기 직후의 손바닥도 거부해야 한다
(function () {
  var g = new PalmGate(700);
  g.shouldStart('pen', 2000, false);      // 펜 down @2000
  g.penSeen(2400); g.penSeen(2800);        // pointermove (긴 필기)
  g.penSeen(3000);                         // pen up @3000 (총 1000ms 필기)
  // 펜을 뗀 직후 100ms 뒤 손바닥. lastPenAt이 up(3000)으로 갱신됐으므로 거부.
  // (만약 lastPenAt이 down 시각 2000에 머물면 3100-2000=1100>700 → 잘못 통과 = 회귀)
  check('긴 필기(>700ms) 직후 손바닥 거부(회귀 방지)', g.shouldStart('touch', 3100, false) === false);
})();

// 6) 펜을 뗀 지 오래되면(graceMs 초과) 손가락 입력을 다시 허용한다
(function () {
  var g = new PalmGate(700);
  g.shouldStart('pen', 2000, false);
  g.penSeen(3000);                         // pen up @3000
  check('펜 뗀 지 오래(800ms)면 손가락 통과', g.shouldStart('touch', 3800, false) === true);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
