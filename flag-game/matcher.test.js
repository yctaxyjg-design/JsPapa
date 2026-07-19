/*
 * 국기 놀이 정답 판정 회귀 테스트 — 의존성 없이 Node로 실행.
 *   node flag-game/matcher.test.js
 * 핵심: 부분 문자열 매칭(includes)으로 인한 인도 ↔ 인도네시아 오판이 없어야 한다.
 */
"use strict";

var m = require("./matcher.js");
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; return; }
  fail++;
  console.log("  ✗ " + name);
}

var INDIA = ["인도", "india"];
var INDONESIA = ["인도네시아", "indonesia"];

// 정상 정답
check("'인도' → 인도 정답", m.matches("인도", INDIA) === true);
check("'인도네시아' → 인도네시아 정답", m.matches("인도네시아", INDONESIA) === true);

// ★회귀 케이스★ — includes였다면 잘못 통과하던 것들
check("'인도네시아'는 인도 정답이 아니다", m.matches("인도네시아", INDIA) === false);
check("'인도'는 인도네시아 정답이 아니다", m.matches("인도", INDONESIA) === false);

// 정규화(공백·문장부호·대소문자)
check("공백/문장부호 무시", m.matches(" 인 도 . ", INDIA) === true);
check("영문 대소문자 무시", m.matches("India", INDIA) === true);
check("빈 입력은 오답", m.matches("", INDIA) === false);

// 다른 나라 오판 없음
check("'미국'은 인도 정답이 아니다", m.matches("미국", INDIA) === false);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
