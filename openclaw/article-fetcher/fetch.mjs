#!/usr/bin/env node
// 저장된 본인 세션으로 유료 기사 본문을 추출해 stdout 으로 출력(제목 + 본문 텍스트).
// 오픈클로/크론이 이 출력을 받아 번역·요약한다.
//
// 사용법:  node fetch.mjs ft https://www.ft.com/content/....
// 출력:    JSON  { site, url, title, text }   (--text 옵션이면 순수 텍스트)
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const [site, url, ...rest] = process.argv.slice(2);
const asText = rest.includes('--text');
const sites = JSON.parse(readFileSync(join(__dir, 'sites.json'), 'utf8'));
if (!site || !sites[site] || !url) {
  console.error(`사용법: node fetch.mjs <${Object.keys(sites).join('|')}> <기사URL> [--text]`);
  process.exit(1);
}
const cfg = sites[site];
const stateDir = process.env.ARTICLE_STATE_DIR || join(process.env.HOME, '.openclaw', 'article-sessions');
const statePath = join(stateDir, `${site}.json`);
if (!existsSync(statePath)) {
  console.error(`세션이 없습니다: ${statePath}\n먼저 실행:  node login.mjs ${site}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: statePath,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  locale: 'en-US',
});
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // 세션 만료 감지: 로그인 페이지로 튕기면 안내
  if (/login|sign-?in|subscribe/i.test(page.url()) && page.url() !== url) {
    throw new Error(`로그인 세션이 만료된 것 같습니다. 갱신:  node login.mjs ${site}`);
  }
  await page.waitForSelector(cfg.articleSelector, { timeout: 15000 }).catch(() => {});

  const result = await page.evaluate(({ articleSelector, titleSelector }) => {
    const pick = (sel) => {
      for (const s of sel.split(',').map((x) => x.trim())) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
    };
    const titleEl = pick(titleSelector);
    const bodyEl = pick(articleSelector) || document.body;
    // 광고/추천/공유 등 잡음 제거
    bodyEl.querySelectorAll('script,style,aside,figure figcaption,[class*="promo"],[class*="advert"],[data-test-id*="related"]').forEach((n) => n.remove());
    const text = bodyEl.innerText.replace(/\n{3,}/g, '\n\n').trim();
    return { title: titleEl ? titleEl.innerText.trim() : document.title, text };
  }, cfg);

  if (!result.text || result.text.length < 200) {
    throw new Error('본문 추출 실패(페이월 미해제 또는 셀렉터 불일치). 세션 갱신 또는 sites.json 셀렉터 확인 필요.');
  }

  if (asText) {
    process.stdout.write(`# ${result.title}\n\n${result.text}\n`);
  } else {
    process.stdout.write(JSON.stringify({ site, url, title: result.title, text: result.text }, null, 2) + '\n');
  }
} finally {
  await browser.close();
}
