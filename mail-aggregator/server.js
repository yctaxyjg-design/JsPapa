import express from "express";
import { ImapFlow } from "imapflow";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3300);
const DEMO = process.env.MAIL_DEMO === "1" || process.argv.includes("--demo");
const CONFIG_PATH = process.env.MAIL_CONFIG ?? path.join(__dirname, "accounts.json");

function loadConfig() {
  if (DEMO) return demoConfig();
  if (!existsSync(CONFIG_PATH)) {
    console.error(
      `설정 파일이 없습니다: ${CONFIG_PATH}\n` +
        `accounts.example.json을 accounts.json으로 복사한 뒤 계정 정보를 채워주세요.\n` +
        `계정 없이 UI만 보려면: npm run demo`
    );
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (!Array.isArray(cfg.accounts) || cfg.accounts.length === 0) {
    console.error("accounts.json의 accounts 배열이 비어 있습니다.");
    process.exit(1);
  }
  return cfg;
}

const config = loadConfig();
const pollMinutes = Math.max(1, Number(config.pollMinutes ?? 5));
const perAccount = Math.max(1, Number(config.messagesPerAccount ?? 30));

// accountId → { messages: [], lastSync: ISO | null, error: string | null, syncing: bool }
const state = new Map(
  config.accounts.map((a) => [
    a.id,
    { messages: [], lastSync: null, error: null, syncing: false },
  ])
);

function decodeAddress(addr) {
  if (!addr) return { name: "", address: "" };
  return { name: addr.name ?? "", address: addr.address ?? "" };
}

async function syncAccount(account) {
  const slot = state.get(account.id);
  if (slot.syncing) return;
  slot.syncing = true;
  const client = new ImapFlow({
    host: account.host,
    port: account.port ?? 993,
    secure: account.secure ?? true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = client.mailbox.exists;
      const messages = [];
      if (total > 0) {
        const from = Math.max(1, total - perAccount + 1);
        for await (const msg of client.fetch(`${from}:*`, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
        })) {
          const env = msg.envelope ?? {};
          messages.push({
            accountId: account.id,
            uid: msg.uid,
            subject: env.subject ?? "(제목 없음)",
            from: decodeAddress(env.from?.[0]),
            date: (env.date ?? msg.internalDate ?? new Date(0)).toISOString(),
            seen: msg.flags?.has("\\Seen") ?? false,
          });
        }
      }
      messages.sort((a, b) => b.date.localeCompare(a.date));
      slot.messages = messages;
      slot.lastSync = new Date().toISOString();
      slot.error = null;
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    slot.error = err.responseText ?? err.message ?? String(err);
    console.error(`[${account.id}] 동기화 실패:`, slot.error);
    try {
      await client.logout();
    } catch {
      /* 이미 끊긴 연결 */
    }
  } finally {
    slot.syncing = false;
  }
}

async function syncAll() {
  if (DEMO) {
    refreshDemo();
    return;
  }
  await Promise.allSettled(config.accounts.map((a) => syncAccount(a)));
}

// ---- 데모 모드: 실제 IMAP 없이 UI 확인용 가짜 데이터 ----

function demoConfig() {
  return {
    pollMinutes: 1,
    messagesPerAccount: 10,
    accounts: [
      { id: "gmail", label: "Gmail", color: "#ea4335" },
      { id: "naver", label: "네이버", color: "#03c75a" },
      { id: "work", label: "회사", color: "#0078d4" },
    ],
  };
}

const DEMO_SAMPLES = [
  ["뉴스레터: 이번 주 기술 동향", "Tech Weekly", "news@techweekly.io"],
  ["회의 일정 변경 안내", "김부장", "kim@company.co.kr"],
  ["주문하신 상품이 발송되었습니다", "쇼핑몰", "noreply@shop.example"],
  ["카드 이용대금 명세서", "카드사", "billing@card.example"],
  ["프로젝트 리뷰 요청드립니다", "박대리", "park@company.co.kr"],
  ["세미나 등록 확인", "학회 사무국", "office@conf.example"],
];

function refreshDemo() {
  const now = Date.now();
  for (const [i, account] of config.accounts.entries()) {
    const slot = state.get(account.id);
    slot.messages = DEMO_SAMPLES.map(([subject, name, address], j) => ({
      accountId: account.id,
      uid: j + 1,
      subject: `${subject} #${j + 1}`,
      from: { name, address },
      date: new Date(now - (j * 3 + i) * 47 * 60 * 1000).toISOString(),
      seen: j % 3 !== 0,
    }));
    slot.lastSync = new Date().toISOString();
    slot.error = null;
  }
}

// ---- HTTP 서버 ----

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/messages", (req, res) => {
  const all = [...state.values()].flatMap((s) => s.messages);
  all.sort((a, b) => b.date.localeCompare(a.date));
  res.json({ messages: all });
});

app.get("/api/status", (req, res) => {
  res.json({
    demo: DEMO,
    pollMinutes,
    accounts: config.accounts.map((a) => {
      const s = state.get(a.id);
      return {
        id: a.id,
        label: a.label ?? a.id,
        color: a.color ?? "#888888",
        lastSync: s.lastSync,
        error: s.error,
        syncing: s.syncing,
        count: s.messages.length,
        unread: s.messages.filter((m) => !m.seen).length,
      };
    }),
  });
});

app.post("/api/refresh", (req, res) => {
  syncAll(); // 백그라운드로 진행, 완료를 기다리지 않음
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(
    `통합 메일함 실행 중: http://localhost:${PORT}` +
      (DEMO ? " (데모 모드)" : ` — ${config.accounts.length}개 계정, ${pollMinutes}분마다 동기화`)
  );
  syncAll();
  setInterval(syncAll, pollMinutes * 60 * 1000);
});
