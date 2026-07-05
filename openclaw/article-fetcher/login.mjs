#!/usr/bin/env node
// 본인 구독 계정으로 한 번 로그인 → 세션(storageState) 저장.
// 이후 fetch.mjs 가 이 세션을 재사용해 유료 기사에 접근한다.
//
// 사용법:  node login.mjs ft         (또는 economist)
// 준비:    npm i playwright   (최초 1회, 이미 설치돼 있으면 생략)
//
// 창이 뜨면 평소처럼 로그인(2FA 포함) 후, 터미널에서 Enter 를 누르면 저장된다.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dir = dirname(fileURLToPath(import.meta.url));
const site = process.argv[2];
const sites = JSON.parse(readFileSync(join(__dir, 'sites.json'), 'utf8'));
if (!site || !sites[site]) {
  console.error(`사용법: node login.mjs <${Object.keys(sites).join('|')}>`);
  process.exit(1);
}
const cfg = sites[site];
const stateDir = process.env.ARTICLE_STATE_DIR || join(process.env.HOME, '.openclaw', 'article-sessions');
mkdirSync(stateDir, { recursive: true });
const statePath = join(stateDir, `${site}.json`);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded' });

console.log(`\n▶ 열린 창에서 ${cfg.name} 계정으로 로그인하세요 (2FA 포함).`);
console.log('  로그인이 끝나면 이 터미널에서 Enter 를 누르세요...');

await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('', () => { rl.close(); resolve(); });
});

await context.storageState({ path: statePath });
await browser.close();
console.log(`\n✔ 세션 저장 완료: ${statePath}`);
console.log('  이제 오프라인으로 기사를 받을 수 있습니다:  node fetch.mjs ' + site + ' <기사URL>');
console.log('  (쿠키는 만료되므로, 접근이 안 되면 이 스크립트를 다시 실행해 갱신하세요.)');
