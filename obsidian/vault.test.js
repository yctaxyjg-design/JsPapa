// vault.js 자가 테스트 — 외부 의존성 없이 Node에서 바로 실행한다.
//   node obsidian/vault.test.js
var V = require("./vault.js");

var passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error("  ✗ " + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function has(arr, v, msg) { ok(arr.indexOf(v) !== -1, msg + " — " + JSON.stringify(arr) + " 에 " + v + " 없음"); }
function no(arr, v, msg) { ok(arr.indexOf(v) === -1, msg + " — " + JSON.stringify(arr) + " 에 " + v + " 있으면 안 됨"); }

// ── 프론트매터 태그 ──────────────────────────────────────────
eq(V.frontmatterTags("tags: [일기, 회고]").length, 2, "인라인 배열 태그 2개");
has(V.frontmatterTags("tags: [일기, 회고]"), "회고", "배열 태그 파싱");
has(V.frontmatterTags("tags:\n  - 프로젝트\n  - 아이디어"), "아이디어", "YAML 리스트 태그");
has(V.frontmatterTags("tag: 단일"), "단일", "단수 tag 키");
eq(V.frontmatterTags("title: 제목만").length, 0, "tags 없으면 빈 배열");

// ── 인라인 태그 ─────────────────────────────────────────────
has(V.inlineTags("오늘은 #독서 #건강/운동 했다"), "독서", "한글 인라인 태그");
has(V.inlineTags("오늘은 #독서 #건강/운동 했다"), "건강/운동", "중첩 태그");
no(V.inlineTags("# 제목입니다"), "제목입니다", "마크다운 헤딩은 태그 아님");
no(V.inlineTags("색상 #1234 코드"), "1234", "숫자만은 태그 아님");
no(V.inlineTags("코드 `#태그아님` 끝"), "태그아님", "인라인 코드 속 #는 무시");

// ── 링크 추출/정규화 ─────────────────────────────────────────
has(V.rawLinks("여기 [[다른 노트]] 참고"), "다른 노트", "위키링크");
has(V.rawLinks("[[대상|보이는이름]] 링크"), "대상", "별칭 링크는 대상만");
eq(V.normalizeTarget("폴더/노트제목.md#섹션"), "노트제목", "경로·확장자·헤딩 제거 후 정규화");
eq(V.normalizeTarget("大文字ABC"), "大文字abc".toLowerCase(), "소문자화");

// ── 노트 파싱 ───────────────────────────────────────────────
var n = V.parseNote({ path: "일기/2026-07-19.md", content: "---\ntags: [일기]\n---\n# 오늘\n#산책 을 했다. [[운동 계획]] 참고.", mtime: 100 });
eq(n.name, "2026-07-19", "basename 추출");
has(n.tags, "일기", "프론트매터+본문 태그 병합(프론트매터)");
has(n.tags, "산책", "프론트매터+본문 태그 병합(본문)");
has(n.linkKeys, "운동 계획", "링크 정규화 키");
ok(n.chars > 0, "글자 수 계산됨");

// ── 볼트 분석: 백링크·고아·깨진 링크 ─────────────────────────
var vault = V.analyze([
  { path: "A.md", content: "[[B]] 로 이어짐", mtime: 3 },
  { path: "B.md", content: "본문. #태그하나", mtime: 2 },
  { path: "C.md", content: "[[없는노트]] 를 가리킴", mtime: 1 },
  { path: "D.md", content: "완전히 혼자인 노트", mtime: 0 }
]);
eq(vault.stats.noteCount, 4, "노트 4개");
var B = vault.notes.filter(function (x) { return x.name === "B"; })[0];
eq(B.backlinks.length, 1, "B는 A로부터 백링크 1");
var A = vault.notes.filter(function (x) { return x.name === "A"; })[0];
eq(A.resolvedOut.length, 1, "A는 해결된 링크 1");
eq(A.isOrphan, false, "A는 고아 아님");
var C = vault.notes.filter(function (x) { return x.name === "C"; })[0];
eq(C.broken.length, 1, "C는 깨진 링크 1");
has(C.broken, "없는노트", "깨진 링크 대상 기록");
var D = vault.notes.filter(function (x) { return x.name === "D"; })[0];
eq(D.isOrphan, true, "D는 고아 노트");
eq(vault.stats.orphanCount, 1, "고아 노트 총 1개");
eq(vault.stats.brokenCount, 1, "깨진 링크 총 1개");
eq(vault.stats.tagCount, 1, "태그 종류 1");

// ── 리포트 생성 ─────────────────────────────────────────────
var report = V.generateReport(vault, { date: "2026-07-19" });
ok(report.indexOf("# 📊 볼트 정리 리포트") === 0, "리포트 제목으로 시작");
ok(report.indexOf("[[D]]") !== -1, "고아 노트 D가 리포트에 포함");
ok(report.indexOf("없는노트") !== -1, "깨진 링크 대상이 리포트에 포함");
ok(report.indexOf("생성: 2026-07-19") !== -1, "생성일 표기");

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
