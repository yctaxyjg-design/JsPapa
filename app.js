const STORAGE_KEY = "ipad-power-scheduler.v1";

const ACTION_LABELS = {
  wake: "화면 켜기 (오토메이션 시작)",
  lock: "화면 잠그기",
  "focus-on": "집중 모드 켜기",
  "focus-off": "집중 모드 끄기",
  "lowpower-on": "저전력 모드 켜기",
  "lowpower-off": "저전력 모드 끄기",
  mute: "무음 모드",
};

const ACTION_STEPS = {
  wake: [
    "단축어 앱 → 오토메이션 → 새 오토메이션 → 시간",
    "지정된 시각에 알림이 울리면서 다음 동작이 자동 실행됩니다.",
    "동작으로 <code>밝기 설정</code>(예: 80%) 또는 <code>알림 표시</code>를 추가해 화면을 깨워주세요.",
    "iPadOS 17 이상에선 오토메이션 마지막 단계에서 <code>즉시 실행</code>을 선택해 무음 실행 가능합니다.",
  ],
  lock: [
    "단축어 앱 → 오토메이션 → 새 오토메이션 → 시간",
    "동작 추가 → <code>화면 잠금</code> 검색 후 선택",
    "<code>즉시 실행</code>을 켜야 알림 없이 자동 잠금됩니다.",
  ],
  "focus-on": [
    "단축어 앱 → 오토메이션 → 새 오토메이션 → 시간",
    "동작 추가 → <code>집중 모드 설정</code> → 켜기 / 원하는 모드(예: 수면, 업무) 선택",
    "<code>즉시 실행</code> 옵션을 켜세요.",
  ],
  "focus-off": [
    "단축어 앱 → 오토메이션 → 새 오토메이션 → 시간",
    "동작 추가 → <code>집중 모드 설정</code> → 끄기",
    "<code>즉시 실행</code> 옵션을 켜세요.",
  ],
  "lowpower-on": [
    "단축어 앱 → 오토메이션 → 새 오토메이션 → 시간",
    "동작 추가 → <code>저전력 모드 설정</code> → 켜기",
    "<code>즉시 실행</code> 옵션을 켜세요.",
  ],
  "lowpower-off": [
    "단축어 앱 → 오토메이션 → 새 오토메이션 → 시간",
    "동작 추가 → <code>저전력 모드 설정</code> → 끄기",
    "<code>즉시 실행</code> 옵션을 켜세요.",
  ],
  mute: [
    "단축어 앱 → 오토메이션 → 새 오토메이션 → 시간",
    "동작 추가 → <code>볼륨 설정</code> → 0%, 그리고 <code>벨소리/무음 설정</code>도 추가",
    "<code>즉시 실행</code> 옵션을 켜세요.",
  ],
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let schedules = load();

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

function formatDays(days) {
  if (!days.length) return "요일 없음";
  if (days.length === 7) return "매일";
  const weekdays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];
  const sorted = [...days].sort();
  if (sorted.length === 5 && weekdays.every((d) => sorted.includes(d))) return "평일";
  if (sorted.length === 2 && weekend.every((d) => sorted.includes(d))) return "주말";
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

function renderList() {
  const list = $("#schedule-list");
  list.innerHTML = "";
  if (schedules.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "아직 등록된 일정이 없습니다.";
    list.appendChild(li);
    return;
  }
  const sorted = [...schedules].sort((a, b) => a.time.localeCompare(b.time));
  for (const s of sorted) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("strong");
    title.textContent = `${s.time} · ${s.label}`;
    const sub = document.createElement("span");
    sub.textContent = `${ACTION_LABELS[s.action] ?? s.action} · ${formatDays(s.days)}`;
    meta.append(title, sub);

    const del = document.createElement("button");
    del.className = "delete";
    del.type = "button";
    del.textContent = "삭제";
    del.addEventListener("click", () => removeSchedule(s.id));

    li.append(meta, del);
    list.appendChild(li);
  }
}

function renderGuide() {
  const out = $("#guide-output");
  out.innerHTML = "";
  if (schedules.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "위에서 일정을 추가하면 맞춤 가이드가 표시됩니다.";
    out.appendChild(p);
    return;
  }
  const sorted = [...schedules].sort((a, b) => a.time.localeCompare(b.time));
  for (const s of sorted) {
    const wrap = document.createElement("article");
    wrap.className = "guide-step";

    const h = document.createElement("h3");
    h.textContent = `${s.label} — ${s.time} (${formatDays(s.days)})`;
    wrap.appendChild(h);

    const ol = document.createElement("ol");
    const baseSteps = ACTION_STEPS[s.action] ?? [];
    const customized = baseSteps.map((step, idx) =>
      idx === 0
        ? step.replace(
            "시간",
            `시간 → ${s.time} 선택 → 반복: ${formatDays(s.days)}`
          )
        : step
    );
    for (const step of customized) {
      const li = document.createElement("li");
      li.innerHTML = step;
      ol.appendChild(li);
    }
    wrap.appendChild(ol);
    out.appendChild(wrap);
  }
}

function render() {
  renderList();
  renderGuide();
}

function addSchedule(entry) {
  schedules.push({ id: crypto.randomUUID(), ...entry });
  save();
  render();
}

function removeSchedule(id) {
  schedules = schedules.filter((s) => s.id !== id);
  save();
  render();
}

function clearAll() {
  if (!schedules.length) return;
  if (!confirm("모든 일정을 삭제할까요?")) return;
  schedules = [];
  save();
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(schedules, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ipad-power-schedule.json";
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
      schedules = data.filter(
        (s) => s && typeof s.time === "string" && typeof s.action === "string"
      );
      save();
      render();
    } catch (err) {
      alert(`가져오기 실패: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

$("#schedule-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const label = $("#label").value.trim();
  const action = $("#action").value;
  const time = $("#time").value;
  const days = [...$$("input[name='day']:checked")].map((el) => Number(el.value));
  if (!label || !time || !days.length) {
    alert("이름, 시간, 요일을 모두 입력해 주세요.");
    return;
  }
  addSchedule({ label, action, time, days });
  e.target.reset();
  $$("input[name='day']").forEach((el) => {
    el.checked = ["1", "2", "3", "4", "5"].includes(el.value);
  });
});

$("#export-btn").addEventListener("click", exportJson);
$("#clear-btn").addEventListener("click", clearAll);
$("#import-input").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) importJson(file);
  e.target.value = "";
});

render();
