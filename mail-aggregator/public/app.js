const REFRESH_UI_MS = 60 * 1000;

let status = { accounts: [], pollMinutes: 5, demo: false };
let messages = [];
let activeAccount = "all"; // "all" | accountId

const $ = (sel) => document.querySelector(sel);

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function loadAll() {
  try {
    const [s, m] = await Promise.all([
      fetchJson("/api/status"),
      fetchJson("/api/messages"),
    ]);
    status = s;
    messages = m.messages;
    render();
  } catch (err) {
    $("#sync-info").textContent = `서버 연결 실패: ${err.message}`;
  }
}

function accountById(id) {
  return status.accounts.find((a) => a.id === id);
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function renderTabs() {
  const nav = $("#account-tabs");
  nav.innerHTML = "";
  const totalUnread = status.accounts.reduce((n, a) => n + a.unread, 0);
  const tabs = [
    { id: "all", label: "전체", color: null, unread: totalUnread, error: null },
    ...status.accounts,
  ];
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (activeAccount === tab.id ? " active" : "");
    if (tab.color) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = tab.color;
      btn.appendChild(dot);
    }
    btn.appendChild(document.createTextNode(tab.label));
    if (tab.unread > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = tab.unread;
      btn.appendChild(badge);
    }
    if (tab.error) {
      btn.classList.add("has-error");
      btn.title = `동기화 오류: ${tab.error}`;
    }
    btn.addEventListener("click", () => {
      activeAccount = tab.id;
      render();
    });
    nav.appendChild(btn);
  }
}

function renderMessages() {
  const list = $("#message-list");
  list.innerHTML = "";
  const shown =
    activeAccount === "all"
      ? messages
      : messages.filter((m) => m.accountId === activeAccount);

  if (shown.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    const acct = accountById(activeAccount);
    li.textContent = acct?.error
      ? `동기화 오류: ${acct.error}`
      : "표시할 메일이 없습니다.";
    list.appendChild(li);
    return;
  }

  for (const msg of shown) {
    const acct = accountById(msg.accountId);
    const li = document.createElement("li");
    li.className = "message" + (msg.seen ? "" : " unread");

    const stripe = document.createElement("span");
    stripe.className = "stripe";
    stripe.style.background = acct?.color ?? "#888";

    const body = document.createElement("div");
    body.className = "body";

    const top = document.createElement("div");
    top.className = "line1";
    const from = document.createElement("span");
    from.className = "from";
    from.textContent = msg.from.name || msg.from.address || "(발신자 없음)";
    from.title = msg.from.address;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = relativeTime(msg.date);
    time.title = new Date(msg.date).toLocaleString("ko-KR");
    top.append(from, time);

    const subject = document.createElement("div");
    subject.className = "subject";
    subject.textContent = msg.subject;

    const meta = document.createElement("div");
    meta.className = "line3";
    meta.textContent = acct?.label ?? msg.accountId;

    body.append(top, subject, meta);
    li.append(stripe, body);
    list.appendChild(li);
  }
}

function renderSyncInfo() {
  const el = $("#sync-info");
  const errors = status.accounts.filter((a) => a.error);
  const syncing = status.accounts.some((a) => a.syncing);
  const times = status.accounts
    .map((a) => a.lastSync)
    .filter(Boolean)
    .sort();
  const latest = times.at(-1);
  const parts = [];
  if (status.demo) parts.push("데모 모드");
  if (syncing) parts.push("동기화 중…");
  else if (latest) parts.push(`마지막 동기화 ${relativeTime(latest)}`);
  if (errors.length) parts.push(`오류 ${errors.length}건`);
  parts.push(`${status.pollMinutes}분 주기`);
  el.textContent = parts.join(" · ");
}

function render() {
  renderTabs();
  renderMessages();
  renderSyncInfo();
}

$("#refresh-btn").addEventListener("click", async () => {
  const btn = $("#refresh-btn");
  btn.disabled = true;
  try {
    await fetchJson("/api/refresh", { method: "POST" });
    // 서버 동기화가 도는 동안 잠시 기다렸다가 다시 읽는다
    setTimeout(async () => {
      await loadAll();
      btn.disabled = false;
    }, 2500);
  } catch {
    btn.disabled = false;
  }
});

loadAll();
setInterval(loadAll, REFRESH_UI_MS);
