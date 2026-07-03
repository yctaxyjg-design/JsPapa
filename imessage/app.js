const STORAGE_KEY = "imessage-auto-reply.v1";

const TONE_LABELS = {
  "polite-warm": "존댓말 · 다정하게",
  "polite-formal": "존댓말 · 정중하게 (업무)",
  "casual-friendly": "반말 · 친근하게",
  "casual-brief": "반말 · 간결하게",
};

const LENGTH_LABELS = {
  short: "아주 짧게, 한 문장으로",
  normal: "보통 길이, 1~2문장으로",
  long: "여유 있게, 2~3문장까지",
};

const EMOJI_LABELS = {
  none: "이모지는 쓰지 않는다",
  light: "이모지는 가끔 하나 정도만 쓴다",
  free: "이모지를 자유롭게 쓴다",
};

const MODEL_LABELS = {
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "claude-opus-4-8": "Claude Opus 4.8",
};

const MESSAGE_PLACEHOLDER = "[받은 메시지]";

const $ = (sel) => document.querySelector(sel);

let people = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
}

function buildSystemPrompt(p) {
  const lines = [
    "너는 지금부터 '나'를 대신해 iMessage/SMS 답장을 쓰는 대리 응답자다.",
    `- 답장 상대: ${p.name}${p.relationship ? ` (${p.relationship})` : ""}`,
    `- 말투: ${TONE_LABELS[p.tone] ?? p.tone}`,
    `- 길이: ${LENGTH_LABELS[p.length] ?? p.length}`,
    `- 이모지: ${EMOJI_LABELS[p.emoji] ?? p.emoji}`,
  ];
  if (p.style) lines.push(`- 분위기/스타일: ${p.style}`);
  const examples = (p.examples || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (examples.length) {
    lines.push("", "내가 평소 보내는 답장 예시:");
    for (const ex of examples) lines.push(`- ${ex}`);
  }
  lines.push(
    "",
    "규칙:",
    "- 상대가 방금 보낸 메시지에 대한 답장 문구만 출력한다. 따옴표, 설명, 서두를 붙이지 않는다.",
    "- 돈, 약속 확정, 민감한 부탁처럼 내가 직접 판단해야 하는 내용이면 확답하지 말고 \"확인하고 다시 연락할게\" 취지로 보류하는 답장을 쓴다.",
    "- 모르는 사실을 지어내지 않는다."
  );
  return lines.join("\n");
}

function buildRequestBody(p) {
  const body = {
    model: p.model,
    max_tokens: 300,
    system: buildSystemPrompt(p),
    messages: [{ role: "user", content: MESSAGE_PLACEHOLDER }],
  };
  return JSON.stringify(body, null, 2);
}

function renderList() {
  const list = $("#person-list");
  list.innerHTML = "";
  if (people.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "아직 등록된 대상이 없습니다.";
    list.appendChild(li);
    return;
  }
  for (const p of people) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("strong");
    title.textContent = p.relationship ? `${p.name} · ${p.relationship}` : p.name;
    const sub = document.createElement("span");
    sub.textContent = `${TONE_LABELS[p.tone] ?? p.tone} · ${MODEL_LABELS[p.model] ?? p.model}`;
    meta.append(title, sub);

    const del = document.createElement("button");
    del.className = "delete";
    del.type = "button";
    del.textContent = "삭제";
    del.addEventListener("click", () => removePerson(p.id));

    li.append(meta, del);
    list.appendChild(li);
  }
}

function copyBlock(labelText, content) {
  const wrap = document.createElement("div");
  wrap.className = "copy-block";

  const head = document.createElement("div");
  head.className = "copy-head";
  const label = document.createElement("span");
  label.textContent = labelText;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost copy-btn";
  btn.textContent = "복사";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(content);
      btn.textContent = "복사됨 ✓";
    } catch {
      btn.textContent = "복사 실패";
    }
    setTimeout(() => (btn.textContent = "복사"), 1500);
  });
  head.append(label, btn);

  const pre = document.createElement("pre");
  pre.textContent = content;

  wrap.append(head, pre);
  return wrap;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function guideSteps(p) {
  const name = escapeHtml(p.name);
  const shortcutName = `자동답장-${name}`;
  return [
    {
      title: "준비: Anthropic API 키",
      steps: [
        "<code>console.anthropic.com</code>에서 API 키를 발급받으세요 (사용량만큼 과금).",
        "API 키는 비밀번호처럼 다루고, 이 페이지나 다른 곳에 붙여넣어 저장하지 마세요. 단축어 안에만 입력합니다.",
      ],
    },
    {
      title: `단축어 만들기 — "${shortcutName}"`,
      steps: [
        `단축어 앱 → 새로운 단축어 → 이름을 <code>${shortcutName}</code>으로 지정`,
        "동작 추가 → <code>텍스트</code> → 아래 \"요청 본문\"을 그대로 붙여넣고, <code>[받은 메시지]</code> 부분을 지운 뒤 그 자리에 변수 <code>단축어 입력</code>을 삽입 (변수 삽입 시 따옴표는 그대로 둡니다)",
        "동작 추가 → <code>URL 콘텐츠 가져오기</code> → URL: <code>https://api.anthropic.com/v1/messages</code>, 방법: <code>POST</code>",
        "같은 동작에서 헤더 3개 추가: <code>x-api-key</code> = 내 API 키, <code>anthropic-version</code> = <code>2023-06-01</code>, <code>content-type</code> = <code>application/json</code>",
        "요청 본문: <code>파일</code> 선택 → 위에서 만든 <code>텍스트</code> 변수를 지정",
        "동작 추가 → <code>사전 값 가져오기</code> → <code>content</code> 키 → 이어서 <code>목록에서 항목 가져오기</code>(첫 번째 항목) → 다시 <code>사전 값 가져오기</code>로 <code>text</code> 키를 꺼내면 답장 문구가 나옵니다",
        `동작 추가 → <code>메시지 보내기</code> → 받는 사람: <code>${name}</code>, 내용: 방금 꺼낸 <code>text</code> 변수 → <code>실행 시 보기</code>를 끄면 확인 없이 자동 발송됩니다 (처음엔 켜두고 테스트 권장)`,
      ],
    },
    {
      title: "오토메이션 등록",
      steps: [
        "단축어 앱 → 오토메이션 → 새 오토메이션 → <code>메시지</code>",
        `보낸 사람: <code>${name}</code> 선택 (이 사람의 메시지에만 작동합니다)`,
        "<code>즉시 실행</code>을 선택해야 알림 확인 없이 자동으로 돌아갑니다",
        `동작으로 <code>단축어 실행</code> → <code>${shortcutName}</code> 선택 → 단축어 입력은 자동으로 받은 메시지 내용이 전달됩니다`,
      ],
    },
    {
      title: "테스트와 주의사항",
      steps: [
        "다른 기기나 가족 폰으로 테스트 메시지를 보내 답장이 오는지 확인하세요.",
        "처음 며칠은 <code>실행 시 보기</code>를 켜서 발송 전에 내용을 확인하는 것을 권장합니다.",
        "상대가 연속으로 보내면 답장도 연속으로 나갑니다. 대화가 길어지면 직접 답장으로 전환하세요.",
      ],
    },
  ];
}

function renderGuide() {
  const out = $("#guide-output");
  out.innerHTML = "";
  if (people.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "위에서 대상을 추가하면 맞춤 가이드가 표시됩니다.";
    out.appendChild(p);
    return;
  }
  for (const person of people) {
    const wrap = document.createElement("article");
    wrap.className = "guide-step";

    const h = document.createElement("h3");
    h.textContent = person.relationship
      ? `${person.name} (${person.relationship})`
      : person.name;
    wrap.appendChild(h);

    wrap.appendChild(copyBlock("시스템 프롬프트 (참고용 · 요청 본문에 이미 포함됨)", buildSystemPrompt(person)));
    wrap.appendChild(copyBlock("요청 본문 — 단축어의 '텍스트' 동작에 붙여넣기", buildRequestBody(person)));

    for (const section of guideSteps(person)) {
      const h4 = document.createElement("h4");
      h4.textContent = section.title;
      wrap.appendChild(h4);
      const ol = document.createElement("ol");
      for (const step of section.steps) {
        const li = document.createElement("li");
        li.innerHTML = step;
        ol.appendChild(li);
      }
      wrap.appendChild(ol);
    }
    out.appendChild(wrap);
  }
}

function render() {
  renderList();
  renderGuide();
}

function addPerson(entry) {
  people.push({ id: crypto.randomUUID(), ...entry });
  save();
  render();
}

function removePerson(id) {
  people = people.filter((p) => p.id !== id);
  save();
  render();
}

function clearAll() {
  if (!people.length) return;
  if (!confirm("모든 대상을 삭제할까요?")) return;
  people = [];
  save();
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(people, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "imessage-auto-reply.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("배열 형식이 아닙니다.");
      people = data.filter(
        (p) => p && typeof p.name === "string" && typeof p.tone === "string"
      );
      save();
      render();
    } catch (err) {
      alert(`가져오기 실패: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

$("#person-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#name").value.trim();
  if (!name) {
    alert("이름을 입력해 주세요.");
    return;
  }
  addPerson({
    name,
    relationship: $("#relationship").value.trim(),
    tone: $("#tone").value,
    length: $("#length").value,
    emoji: $("#emoji").value,
    style: $("#style").value.trim(),
    examples: $("#examples").value.trim(),
    model: $("#model").value,
  });
  e.target.reset();
});

$("#export-btn").addEventListener("click", exportJson);
$("#clear-btn").addEventListener("click", clearAll);
$("#import-input").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) importJson(file);
  e.target.value = "";
});

render();
