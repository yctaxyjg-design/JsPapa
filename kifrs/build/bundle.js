#!/usr/bin/env node
/**
 * 단일 파일 빌드기 — kifrs-standalone.html 생성
 *
 * index.html / kifrs.css / ../styles.css / search.js / corpus.json 을 하나의
 * HTML 파일로 인라인한다. 결과물은 서버·인터넷·설치 없이 브라우저로 더블클릭만
 * 하면 동작한다(회사 PC 등 잠긴 환경, 개인용·비배포 목적).
 *
 * 사용법:  node build/bundle.js   (kifrs/ 에서 실행)
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");          // kifrs/
const repo = path.resolve(root, "..");                // repo root

const read = (p) => fs.readFileSync(p, "utf8");

const sharedCss = read(path.join(repo, "styles.css"));
const kifrsCss = read(path.join(root, "kifrs.css"));
const searchJs = read(path.join(root, "search.js"));
const corpus = read(path.join(root, "corpus.json"));
let html = read(path.join(root, "index.html"));

// <link rel=stylesheet ...> 두 개를 인라인 <style> 로 치환
html = html.replace(
  /\s*<link rel="stylesheet" href="\.\.\/styles\.css" \/>\s*<link rel="stylesheet" href="kifrs\.css" \/>/,
  `\n  <style>\n${sharedCss}\n${kifrsCss}\n  </style>`
);

// <script src="search.js"> 앞에 내장 corpus 를 주입하고, 스크립트를 인라인
html = html.replace(
  /\s*<script src="search\.js"><\/script>/,
  `\n  <script>window.__KIFRS_CORPUS__ = ${corpus};</script>\n  <script>\n${searchJs}\n  </script>`
);

// 안내 문구의 build/ 경로 참조는 standalone 에선 의미 없으니 살짝 정리
html = html.replace(
  /이 검색은 기준서/,
  "이 파일은 단독 실행본(standalone)입니다. 인터넷·서버 없이 동작합니다. 이 검색은 기준서"
);

const out = path.join(root, "kifrs-standalone.html");
fs.writeFileSync(out, html, "utf8");
console.log(`생성됨: ${out} (${(html.length / 1024).toFixed(1)} KB)`);
