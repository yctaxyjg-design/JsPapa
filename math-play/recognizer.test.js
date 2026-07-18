/*
 * recognizer.js 자가 테스트 — 의존성 없이 Node로 실행한다.
 *   node math-play/recognizer.test.js
 * 내장 숫자 템플릿이 자기 숫자로, 충분히 낮은 거리로 인식되는지와
 * 빈 입력·낙서가 걸러지는지를 검증한다.
 */
'use strict';

var rec = require('./recognizer.js');
var RAW = rec._raw;

var GOOD_MAX = 1.34;   // 정상 필체 기대 상한 (app.js UNSURE_DISTANCE=1.8보다 여유)
var UNSURE = 1.8;      // 이 값을 넘으면 "잘 모르겠어요"로 처리(app.js와 동일 기준)

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + name + (detail ? '  ' + detail : ''));
}

// 1) 내장 템플릿은 각자 자기 숫자로, 낮은 거리로 인식돼야 한다
RAW.forEach(function (t, idx) {
  var r = rec.recognize(t.strokes);
  var d = r ? r.distance.toFixed(3) : 'null';
  check('tpl#' + idx + ' (digit ' + t.digit + ') 인식',
    !!r && r.digit === t.digit, r ? '→ ' + r.digit + ' (d=' + d + ')' : '→ null');
  check('tpl#' + idx + ' (digit ' + t.digit + ') 거리 < ' + GOOD_MAX,
    !!r && r.distance < GOOD_MAX, 'd=' + d);
});

// 2) 잉크가 없거나 너무 짧으면 null
check('빈 입력 → null', rec.recognize([]) === null);
check('점 하나 → null', rec.recognize([[{ x: 5, y: 5 }]]) === null);

// 3) 아무 숫자도 아닌 낙서는 UNSURE(1.8) 이상이어야 다시 쓰게 유도된다
var scribble = [[
  { x: 10, y: 50 }, { x: 20, y: 20 }, { x: 30, y: 55 },
  { x: 40, y: 18 }, { x: 50, y: 52 }, { x: 60, y: 22 }, { x: 70, y: 55 }
]];
var sr = rec.recognize(scribble);
check('낙서는 UNSURE(' + UNSURE + ') 이상', !sr || sr.distance >= UNSURE,
  sr ? 'd=' + sr.distance.toFixed(3) + ' (→' + sr.digit + ')' : 'null');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
