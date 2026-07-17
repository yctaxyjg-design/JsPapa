/* 육아 공평분담 스프레드시트 — 순수 바닐라 JS, 외부 의존성 없음 */
(function () {
  "use strict";

  var KEY = "parenting-spreadsheet-v1";

  // 항목 (요청 순서) — cat: 육아 / 가사
  var SLOTS = [
    { id: "bedtime-story", emo: "📖", label: "취침 전 동화", cat: "육아" },
    { id: "bedtime",       emo: "😴", label: "취침",         cat: "육아" },
    { id: "breakfast",     emo: "🥣", label: "아침식사",     cat: "육아" },
    { id: "dinner",        emo: "🍽️", label: "저녁식사",     cat: "육아" },
    { id: "dropoff",       emo: "🏫", label: "아이 등원",     cat: "육아" },
    { id: "pickup",        emo: "🎒", label: "아이 하원",     cat: "육아" },
    { id: "weekday-play",  emo: "🏠", label: "평일 저녁 놀이", cat: "육아" },
    { id: "holiday-am",    emo: "🖍️", label: "휴일 오전 놀이", cat: "육아" },
    { id: "holiday-pm",    emo: "🧩", label: "휴일 오후 놀이", cat: "육아" },
    { id: "holiday-eve",   emo: "🚂", label: "휴일 저녁 놀이", cat: "육아" },
    { id: "cleaning",      emo: "🧹", label: "청소",          cat: "가사" },
    { id: "bathroom",      emo: "🚽", label: "화장실 청소",    cat: "가사" },
    { id: "laundry",       emo: "🧺", label: "빨래",          cat: "가사" },
    { id: "dishes",        emo: "🧽", label: "설거지",        cat: "가사" }
  ];

  // 카테고리 표시 순서
  var CATEGORIES = ["육아", "가사"];
  // 육아일 환산 기준: 육아 항목 수 (하루 육아 한 바퀴)
  var CHILDCARE_PER_DAY = SLOTS.filter(function (s) { return s.cat === "육아"; }).length;
  // 항목 id → 카테고리 조회
  var CAT_BY_ID = {};
  SLOTS.forEach(function (s) { CAT_BY_ID[s.id] = s.cat; });

  var DEFAULT = { people: { a: "엄마", b: "아빠" }, records: {} };

  var state = load();
  var current = todayKey();

  // ---------- 저장/로드 ----------
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULT);
      var d = JSON.parse(raw);
      if (!d || typeof d !== "object") return clone(DEFAULT);
      if (!d.people) d.people = clone(DEFAULT.people);
      if (!d.records) d.records = {};
      return d;
    } catch (e) {
      return clone(DEFAULT);
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- 날짜 유틸 (로컬 기준) ----------
  function todayKey() { return dateKey(new Date()); }
  function dateKey(dt) {
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, "0");
    var d = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  function parseKey(k) {
    var p = k.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function shiftDay(k, delta) {
    var dt = parseKey(k);
    dt.setDate(dt.getDate() + delta);
    return dateKey(dt);
  }
  function humanDate(k) {
    var dt = parseKey(k);
    var days = ["일", "월", "화", "수", "목", "금", "토"];
    var label = (dt.getMonth() + 1) + "월 " + dt.getDate() + "일 (" + days[dt.getDay()] + ")";
    if (k === todayKey()) label += " · 오늘";
    return label;
  }

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var slotsEl = $("slots");
  var dateInput = $("date");
  var dateLabel = $("date-label");

  // ---------- 렌더 ----------
  function render() {
    renderDate();
    renderSlots();
    renderStats();
    renderNames();
  }

  function renderDate() {
    dateInput.value = current;
    dateLabel.textContent = humanDate(current);
  }

  function renderNames() {
    $("s-count-a").textContent = state.people.a;
    $("s-count-b").textContent = state.people.b;
    $("l-a").textContent = state.people.a;
    $("l-b").textContent = state.people.b;
  }

  function renderSlots() {
    var rec = state.records[current] || {};
    slotsEl.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var head = document.createElement("div");
      head.className = "cat-head";
      head.textContent = cat === "육아" ? "👶 육아" : "🏡 가사";
      slotsEl.appendChild(head);

      SLOTS.filter(function (s) { return s.cat === cat; }).forEach(function (s) {
        var who = rec[s.id] ? rec[s.id].who : null;
        var row = document.createElement("div");
        row.className = "slot";
        row.innerHTML =
          '<div class="slot-label"><span class="emo">' + s.emo +
          '</span><span class="txt">' + s.label + '</span></div>' +
          '<div class="pick">' +
            btn(s.id, "a",    state.people.a, who) +
            btn(s.id, "both", "함께",          who) +
            btn(s.id, "b",    state.people.b, who) +
          '</div>';
        slotsEl.appendChild(row);
      });
    });
    // 이벤트 위임
    slotsEl.querySelectorAll(".pick button").forEach(function (b) {
      b.addEventListener("click", function () {
        toggle(b.getAttribute("data-slot"), b.getAttribute("data-who"));
      });
    });
  }

  function btn(slotId, who, text, current) {
    var sel = current === who ? " sel " + who : "";
    return '<button type="button" class="' + who + sel +
      '" data-slot="' + slotId + '" data-who="' + who + '">' + esc(text) + "</button>";
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- 기록 토글 ----------
  function toggle(slotId, who) {
    if (!state.records[current]) state.records[current] = {};
    var rec = state.records[current];
    if (rec[slotId] && rec[slotId].who === who) {
      delete rec[slotId]; // 같은 버튼 다시 탭 → 해제
    } else {
      rec[slotId] = { who: who, ts: Date.now() };
    }
    if (Object.keys(rec).length === 0) delete state.records[current];
    save();
    renderSlots();
    renderStats();
  }

  // ---------- 통계 ----------
  function tally(filter) {
    var a = 0, b = 0;
    Object.keys(state.records).forEach(function (dk) {
      var rec = state.records[dk];
      Object.keys(rec).forEach(function (sid) {
        if (filter && !filter(dk, sid)) return;
        var who = rec[sid].who;
        if (who === "a") a += 1;
        else if (who === "b") b += 1;
        else if (who === "both") { a += 0.5; b += 0.5; }
      });
    });
    return { a: a, b: b };
  }

  function fmt(n) {
    return (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
  }

  function renderStats() {
    var all = tally(null);
    $("count-a").textContent = fmt(all.a);
    $("count-b").textContent = fmt(all.b);

    // 육아일 환산 격차 (육아 항목만)
    var care = tally(function (dk, sid) { return CAT_BY_ID[sid] === "육아"; });
    var dayGap = Math.abs(care.a - care.b) / CHILDCARE_PER_DAY;
    $("days-gap").textContent = "+" + fmt(dayGap) + "일";
    $("days-who").textContent = leadName(care.a, care.b);

    // 취침 담당 격차
    var bed = tally(function (dk, sid) { return sid === "bedtime"; });
    $("bed-gap").textContent = "+" + fmt(Math.abs(bed.a - bed.b)) + "회";
    $("bed-who").textContent = leadName(bed.a, bed.b);

    // 이번 달 분담률 (현재 보는 날짜의 달 기준)
    var month = current.slice(0, 7);
    var m = tally(function (dk) { return dk.slice(0, 7) === month; });
    var total = m.a + m.b;
    var pa = total > 0 ? Math.round((m.a / total) * 100) : 50;
    var pb = 100 - pa;
    $("pie-a").textContent = pa + "%";
    $("pie-b").textContent = pb + "%";
    $("pie").style.background =
      "conic-gradient(var(--mom) 0 " + pa + "%, var(--dad) " + pa + "% 100%)";
    $("pie-cap").textContent = monthLabel(month) + " 분담률" +
      (total === 0 ? " (아직 기록 없음)" : "");
  }

  function leadName(a, b) {
    if (Math.abs(a - b) < 0.001) return "균형 ⚖️";
    return (a > b ? state.people.a : state.people.b) + " 더 많음";
  }
  function monthLabel(m) {
    var p = m.split("-");
    return Number(p[1]) + "월";
  }

  // ---------- iCloud 백업 / 불러오기 ----------
  function backup() {
    var data = JSON.stringify(state, null, 2);
    var fname = "육아분담_" + todayKey() + ".json";
    var blob = new Blob([data], { type: "application/json" });

    // iOS/모던 브라우저: 공유 시트 → "파일에 저장" → iCloud Drive
    try {
      var file = new File([blob], fname, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "육아분담 백업" })
          .then(function () { note("iCloud Drive 등 원하는 위치에 저장하세요."); })
          .catch(function () {/* 사용자가 취소 */});
        return;
      }
    } catch (e) {}

    // 폴백: 파일 다운로드
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    note("백업 파일을 내려받았습니다. 공유 iCloud Drive 폴더에 옮겨두세요.");
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var incoming = JSON.parse(reader.result);
        var merged = mergeRecords(state.records, incoming.records || {});
        state.records = merged.records;
        save();
        render();
        note("병합 완료 · " + merged.added + "칸 반영, " + merged.updated + "칸 갱신.");
      } catch (e) {
        note("불러오기 실패: 올바른 백업 파일이 아닙니다.", true);
      }
    };
    reader.readAsText(file);
  }

  // 셀 단위 병합: 같은 (날짜, 항목)은 더 최신 ts를 채택
  function mergeRecords(local, incoming) {
    var out = clone(local);
    var added = 0, updated = 0;
    Object.keys(incoming).forEach(function (dk) {
      var inRec = incoming[dk];
      if (!inRec || typeof inRec !== "object") return;
      if (!out[dk]) out[dk] = {};
      Object.keys(inRec).forEach(function (sid) {
        var cell = inRec[sid];
        if (!cell || typeof cell.who === "undefined") return;
        var mine = out[dk][sid];
        if (!mine) { out[dk][sid] = { who: cell.who, ts: cell.ts || 0 }; added++; }
        else if ((cell.ts || 0) > (mine.ts || 0)) {
          out[dk][sid] = { who: cell.who, ts: cell.ts }; updated++;
        }
      });
      if (Object.keys(out[dk]).length === 0) delete out[dk];
    });
    return { records: out, added: added, updated: updated };
  }

  var noteTimer = null;
  function note(msg, isErr) {
    var el = $("saved-note");
    el.textContent = msg;
    el.style.color = isErr ? "var(--dad)" : "var(--mom)";
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.textContent = ""; }, 5000);
  }

  // ---------- 이름 / 삭제 ----------
  function renamepeople() {
    var a = prompt("첫 번째 사람 이름", state.people.a);
    if (a === null) return;
    var b = prompt("두 번째 사람 이름", state.people.b);
    if (b === null) return;
    state.people.a = (a.trim() || "엄마").slice(0, 8);
    state.people.b = (b.trim() || "아빠").slice(0, 8);
    save();
    render();
  }
  function clearDay() {
    if (!state.records[current]) return note("오늘은 지울 기록이 없습니다.");
    if (!confirm(humanDate(current) + " 기록을 지울까요?")) return;
    delete state.records[current];
    save(); renderSlots(); renderStats();
    note("오늘 기록을 지웠습니다.");
  }
  function clearAll() {
    if (!confirm("모든 기록을 삭제할까요? 되돌릴 수 없습니다.\n(먼저 iCloud 백업을 권장합니다.)")) return;
    state.records = {};
    save(); render();
    note("전체 삭제됨.");
  }

  // ---------- 이벤트 ----------
  $("prev-day").addEventListener("click", function () { current = shiftDay(current, -1); render(); });
  $("next-day").addEventListener("click", function () { current = shiftDay(current, 1); render(); });
  dateInput.addEventListener("change", function () {
    if (dateInput.value) { current = dateInput.value; render(); }
  });
  $("backup-btn").addEventListener("click", backup);
  $("import-input").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = "";
  });
  $("names-btn").addEventListener("click", renamepeople);
  $("clear-day-btn").addEventListener("click", clearDay);
  $("clear-all-btn").addEventListener("click", clearAll);

  render();
})();
