/* 엑셀 화면 위장 시세판 — 화면 조립 · 이벤트 · 새로 고침 루프 */
(() => {
  'use strict';

  const KEY = 'excelkospi.v1';
  const { COLS, ROWS, TABS } = Sheets;

  const $ = (id) => document.getElementById(id);
  const el = {
    body: $('sheet-body'),
    wrap: $('sheet-wrap'),
    tabs: $('sheet-tabs'),
    nameBox: $('name-box'),
    formula: $('formula-input'),
    status: $('st-status'),
    source: $('st-source'),
    agg: $('st-agg'),
    zoomVal: $('st-zoom-val'),
    ribbon: $('ribbon'),
    ribbonTabs: $('ribbon-tabs'),
    modal: $('modal-back'),
    dlgTitle: $('dlg-title'),
    dlgBody: $('dlg-body'),
    dlgFoot: $('dlg-foot')
  };

  const DEFAULTS = {
    watch: ['IDX:코스피', 'IDX:코스닥', '005930', '000660', '373220', '005380', '035420', '035720', '000270', '105560'],
    coins: ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL', 'KRW-DOGE']
  };

  const state = {
    watch: [],
    coins: [],
    holdings: [],
    quotes: new Map(),
    updatedAt: new Date(),
    sheet: 'stock',
    decoy: false,
    sel: { r: 4, c: 3 },
    anchor: null,
    settings: {
      refreshSec: 15,
      autoRefresh: true,
      serviceKey: '',
      proxy: '',
      blurDecoy: false,
      gridlines: true,
      headings: true,
      zoom: 1
    }
  };

  /* ── 저장 ──────────────────────────────────── */
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    state.watch = (saved && saved.watch) || DEFAULTS.watch.map((c) => ({ code: c, name: Quotes.known(c) }));
    state.coins = (saved && saved.coins) || DEFAULTS.coins.map((c) => ({ code: c, name: Quotes.known(c) }));
    state.holdings = (saved && saved.holdings) || [];
    if (saved && saved.settings) Object.assign(state.settings, saved.settings);
    if (typeof state.watch[0] === 'string') state.watch = state.watch.map((c) => ({ code: c, name: Quotes.known(c) }));
    if (typeof state.coins[0] === 'string') state.coins = state.coins.map((c) => ({ code: c, name: Quotes.known(c) }));
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        watch: state.watch, coins: state.coins, holdings: state.holdings, settings: state.settings
      }));
    } catch (e) { /* 저장 실패는 무시 — 화면은 계속 돈다 */ }
  }

  function allCodes() {
    const s = new Set();
    state.watch.forEach((i) => s.add(i.code));
    state.coins.forEach((i) => s.add(i.code));
    state.holdings.forEach((i) => s.add(i.code));
    return [...s];
  }

  /* ── 렌더 ──────────────────────────────────── */
  const FILL_W = 70;      /* 빈 열 기본 너비 */
  const HEAD_W = 30;      /* 행 머리글 너비 */
  let colCount = 14;      /* 현재 그려진 열 개수 */

  /* 화면 오른쪽 끝까지 빈 열로 채운다 — 엑셀처럼 격자가 끊기지 않게 */
  function layoutCols(widths) {
    const z = state.settings.zoom;
    const avail = el.wrap.clientWidth || 1024;
    const out = widths.slice();
    let total = (HEAD_W + out.reduce((a, b) => a + b, 0)) * z;
    while (total < avail + FILL_W * z && out.length < COLS.length) {
      out.push(FILL_W);
      total += FILL_W * z;
    }
    return { widths: out, total };
  }

  function render() {
    const sheet = state.decoy ? Sheets.decoySheet() : Sheets.build(state.sheet, state);
    const top = el.wrap.scrollTop, left = el.wrap.scrollLeft;
    const z = state.settings.zoom;
    const layout = layoutCols(sheet.widths);
    colCount = layout.widths.length;
    if (state.sel.c > colCount) state.sel.c = colCount;

    const frag = document.createDocumentFragment();

    const colgroup = document.createElement('colgroup');
    const c0 = document.createElement('col');
    c0.style.width = HEAD_W * z + 'px';
    colgroup.appendChild(c0);
    layout.widths.forEach((w) => {
      const c = document.createElement('col');
      c.style.width = w * z + 'px';
      colgroup.appendChild(c);
    });

    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner colhead';
    headRow.appendChild(corner);
    for (let i = 0; i < colCount; i++) {
      const th = document.createElement('th');
      th.className = 'colhead' + (i + 1 === state.sel.c ? ' is-on' : '');
      th.textContent = COLS[i];
      headRow.appendChild(th);
    }
    frag.appendChild(headRow);

    const rng = range();
    for (let r = 1; r <= ROWS; r++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'rowhead' + (r === state.sel.r ? ' is-on' : '');
      th.textContent = r;
      tr.appendChild(th);
      for (let ci = 0; ci < colCount; ci++) {
        const ref = COLS[ci] + r;
        const cell = sheet.cells[ref];
        const td = document.createElement('td');
        td.dataset.r = r;
        td.dataset.c = ci + 1;
        let cls = cell ? (cell.c || '') : '';
        const c = ci + 1;
        if (r === state.sel.r && c === state.sel.c) cls += ' sel';
        else if (rng && r >= rng.r1 && r <= rng.r2 && c >= rng.c1 && c <= rng.c2) cls += ' inrange';
        if (cls) td.className = cls.trim();
        if (cell && cell.v) td.textContent = cell.v;
        if (cell && cell.f) td.dataset.f = cell.f;
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }

    el.body.replaceChildren(frag);
    const table = el.body.parentNode;
    const oldCg = table.querySelector('colgroup');
    if (oldCg) oldCg.remove();
    table.insertBefore(colgroup, el.body);
    table.style.width = layout.total + 'px';

    el.wrap.scrollTop = top;
    el.wrap.scrollLeft = left;
    syncBars(sheet);
  }

  function range() {
    if (!state.anchor) return null;
    const a = state.anchor, s = state.sel;
    return {
      r1: Math.min(a.r, s.r), r2: Math.max(a.r, s.r),
      c1: Math.min(a.c, s.c), c2: Math.max(a.c, s.c)
    };
  }

  function cellRef(r, c) { return COLS[c - 1] + r; }

  function syncBars(sheet) {
    const rng = range();
    el.nameBox.textContent = rng && (rng.r1 !== rng.r2 || rng.c1 !== rng.c2)
      ? (rng.r2 - rng.r1 + 1) + 'R x ' + (rng.c2 - rng.c1 + 1) + 'C'
      : cellRef(state.sel.r, state.sel.c);

    const cur = sheet.cells[cellRef(state.sel.r, state.sel.c)];
    el.formula.textContent = cur ? (cur.f || cur.v || '') : '';

    // 선택 범위 숫자 집계
    const nums = [];
    if (rng) {
      for (let r = rng.r1; r <= rng.r2; r++) {
        for (let c = rng.c1; c <= rng.c2; c++) {
          const v = toNumber(sheet.cells[cellRef(r, c)]);
          if (v !== null) nums.push(v);
        }
      }
    } else {
      const v = toNumber(cur);
      if (v !== null) nums.push(v);
    }
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      el.agg.textContent = '평균: ' + Sheets.nf.format(Math.round(sum / nums.length))
        + '   개수: ' + nums.length + '   합계: ' + Sheets.nf.format(Math.round(sum));
    } else {
      el.agg.textContent = '';
    }
  }

  function toNumber(cell) {
    if (!cell || !cell.v) return null;
    const t = String(cell.v).replace(/[▲▼–+,\s%원]/g, '');
    if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    if (!isFinite(n)) return null;
    return String(cell.c || '').includes('down') ? -Math.abs(n) : n;
  }

  /* ── 시트 탭 ───────────────────────────────── */
  function renderTabs() {
    const frag = document.createDocumentFragment();
    TABS.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stab' + (t.id === state.sheet ? ' is-active' : '');
      b.dataset.sheet = t.id;
      b.textContent = t.label;
      frag.appendChild(b);
    });
    el.tabs.replaceChildren(frag);
  }

  /* ── 시세 새로 고침 ────────────────────────── */
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    el.status.textContent = '계산 중…';
    try {
      const res = await Quotes.fetchAll(allCodes(), {
        serviceKey: state.settings.serviceKey,
        proxy: state.settings.proxy
      });
      state.quotes = res.map;
      state.updatedAt = new Date();
      el.source.textContent = res.live === res.total ? '연결됨'
        : res.live > 0 ? '연결됨 ' + res.live + '/' + res.total
        : '데모 데이터';
    } catch (e) {
      el.source.textContent = '데모 데이터';
    } finally {
      busy = false;
      el.status.textContent = '준비';
      render();
    }
  }

  let timer = null;
  function reschedule() {
    if (timer) clearInterval(timer);
    timer = null;
    if (state.settings.autoRefresh) {
      const sec = Math.max(5, Number(state.settings.refreshSec) || 15);
      timer = setInterval(refresh, sec * 1000);
    }
  }

  /* ── 위장 ──────────────────────────────────── */
  function setDecoy(on) {
    state.decoy = on;
    document.body.classList.toggle('decoy', on);
    state.anchor = null;
    if (on) selectRibbon('home');   // "항목 추가" 같은 리본 버튼이 그대로 남지 않게
    render();
  }

  /* 리본 탭 전환 */
  function selectRibbon(tab) {
    el.ribbonTabs.querySelectorAll('.rtab').forEach((t) => {
      const on = t.dataset.tab === tab && tab !== 'file';
      t.classList.toggle('is-active', on);
      if (t.getAttribute('role') === 'tab') t.setAttribute('aria-selected', String(on));
    });
    const panelName = ['home', 'data', 'view'].includes(tab) ? tab : 'decor';
    el.ribbon.querySelectorAll('.ribbon-panel').forEach((p) => {
      p.hidden = p.dataset.panel !== panelName;
    });
  }

  /* ── 대화상자 ──────────────────────────────── */
  let onClose = null;
  function openDialog(title, bodyNode, buttons) {
    el.dlgTitle.textContent = title;
    el.dlgBody.replaceChildren(bodyNode);
    const frag = document.createDocumentFragment();
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      frag.appendChild(btn);
    });
    el.dlgFoot.replaceChildren(frag);
    el.modal.hidden = false;
    const first = el.dlgBody.querySelector('input, select');
    if (first) first.focus();
  }
  function closeDialog() {
    el.modal.hidden = true;
    el.dlgBody.replaceChildren();
    if (onClose) { const f = onClose; onClose = null; f(); }
  }

  function fieldset(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d;
  }

  /* 항목 추가 */
  function dlgAddItem() {
    const list = state.sheet === 'coin' ? 'coins' : 'stock';
    const opts = Quotes.suggestions()
      .map((s) => '<option value="' + s.code + '">' + s.name + '</option>')
      .join('');
    const node = fieldset(
      '<p class="hint">6자리 국내 종목코드(예: 005930) 또는 업비트 코인 코드(예: KRW-BTC)를 넣으세요.</p>'
      + '<div class="field"><span>코드</span><input id="f-code" placeholder="005930" autocomplete="off" list="f-list" />'
      + '<datalist id="f-list">' + opts + '</datalist></div>'
      + '<div class="field"><span>표시 이름 (비우면 자동)</span><input id="f-name" placeholder="삼성전자" autocomplete="off" /></div>'
      + '<div class="field"><span>넣을 시트</span><select id="f-sheet">'
      + '<option value="stock"' + (list === 'stock' ? ' selected' : '') + '>실적_국내 (주식·지수)</option>'
      + '<option value="coins"' + (list === 'coins' ? ' selected' : '') + '>실적_해외 (코인)</option>'
      + '</select></div>'
    );
    openDialog('항목 추가', node, [
      { label: '취소', onClick: closeDialog },
      {
        label: '추가', primary: true, onClick: () => {
          let code = ($('f-code').value || '').trim().toUpperCase();
          if (!code) return;
          if (/^\d{6}$/.test(code) === false && !code.startsWith('KRW-') && !code.startsWith('IDX:')) {
            if (/^[가-힣]+$/.test(code)) code = 'IDX:' + code;
          }
          const bucket = $('f-sheet').value === 'coins' ? state.coins : state.watch;
          if (!bucket.some((i) => i.code === code)) {
            bucket.push({ code, name: ($('f-name').value || '').trim() || Quotes.known(code) || code });
            save();
          }
          closeDialog();
          refresh();
        }
      }
    ]);
  }

  /* 관심 항목 / 보유 수량 편집 */
  function dlgHoldings() {
    const node = document.createElement('div');
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '수량과 취득단가를 넣으면 [원가집계] 시트에서 평가금액·손익이 계산됩니다. 수량 0은 저장할 때 지워집니다.';
    node.appendChild(hint);

    const list = document.createElement('div');
    list.className = 'dlg-list';
    node.appendChild(list);

    const codes = [...new Set([...allCodes(), ...state.holdings.map((h) => h.code)])];
    if (!codes.length) {
      list.innerHTML = '<div class="dlg-empty">먼저 항목을 추가하세요.</div>';
    }
    codes.forEach((code) => {
      const h = state.holdings.find((x) => x.code === code) || { qty: 0, avg: 0 };
      const q = state.quotes.get(code);
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        '<span class="nm">' + ((q && q.name) || Quotes.known(code) || code) + '</span>'
        + '<span class="cd">' + code.replace('IDX:', '') + '</span>'
        + '<input type="number" inputmode="decimal" step="any" min="0" data-k="qty" placeholder="수량" value="' + (h.qty || '') + '" />'
        + '<input type="number" inputmode="decimal" step="any" min="0" data-k="avg" placeholder="단가" value="' + (h.avg || '') + '" />';
      row.dataset.code = code;
      list.appendChild(row);
    });

    openDialog('보유 수량 편집', node, [
      { label: '취소', onClick: closeDialog },
      {
        label: '확인', primary: true, onClick: () => {
          const next = [];
          list.querySelectorAll('.row').forEach((row) => {
            const qty = Number(row.querySelector('[data-k="qty"]').value) || 0;
            const avg = Number(row.querySelector('[data-k="avg"]').value) || 0;
            if (qty > 0) next.push({ code: row.dataset.code, name: row.querySelector('.nm').textContent, qty, avg });
          });
          state.holdings = next;
          save();
          closeDialog();
          refresh();
        }
      }
    ]);
  }

  /* 항목 목록 관리(삭제) */
  function dlgManage() {
    const node = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'dlg-list';
    node.appendChild(list);

    const rows = [
      ...state.watch.map((i) => ({ i, bucket: 'watch' })),
      ...state.coins.map((i) => ({ i, bucket: 'coins' }))
    ];
    if (!rows.length) list.innerHTML = '<div class="dlg-empty">항목이 없습니다.</div>';
    rows.forEach(({ i, bucket }) => {
      const row = document.createElement('div');
      row.className = 'row';
      const q = state.quotes.get(i.code);
      row.innerHTML =
        '<span class="nm">' + ((q && q.name) || i.name || i.code) + '</span>'
        + '<span class="cd">' + i.code.replace('IDX:', '') + '</span>'
        + '<button type="button" class="rm" aria-label="삭제">✕</button>';
      row.querySelector('.rm').addEventListener('click', () => {
        const arr = bucket === 'coins' ? state.coins : state.watch;
        const idx = arr.findIndex((x) => x.code === i.code);
        if (idx >= 0) arr.splice(idx, 1);
        save();
        row.remove();
        render();
      });
      list.appendChild(row);
    });

    openDialog('항목 관리', node, [{ label: '닫기', primary: true, onClick: closeDialog }]);
  }

  /* 연결 속성(설정) */
  function dlgSettings() {
    const s = state.settings;
    const node = fieldset(
      '<div class="field-row">'
      + '<div class="field"><span>새로 고침 주기 (초)</span><input id="s-sec" type="number" min="5" max="600" value="' + s.refreshSec + '" /></div>'
      + '<div class="field"><span>확대 배율 (%)</span><input id="s-zoom" type="number" min="70" max="200" step="10" value="' + Math.round(s.zoom * 100) + '" /></div>'
      + '</div>'
      + '<div class="field"><span>공공데이터포털 인증키 (국내 주식·지수)</span>'
      + '<input id="s-key" type="text" autocomplete="off" spellcheck="false" placeholder="Decoding 키를 붙여넣기" value="' + escapeAttr(s.serviceKey) + '" /></div>'
      + '<p class="hint">data.go.kr에서 「금융위원회_주식시세정보」와 「금융위원회_지수시세정보」를 신청하면 무료로 받습니다. '
      + '키는 이 브라우저(localStorage)에만 저장되고 어디로도 전송되지 않습니다. 이 API는 <b>전 영업일 종가</b> 기준입니다.</p>'
      + '<div class="field"><span>API 프록시 주소 (선택)</span>'
      + '<input id="s-proxy" type="text" autocomplete="off" spellcheck="false" placeholder="https://내프록시주소" value="' + escapeAttr(s.proxy) + '" /></div>'
      + '<p class="hint">브라우저가 공공데이터 API를 직접 호출하지 못할 때만 채우세요. 뒤에 <code>/1160100/service…</code> 경로를 붙여 호출합니다. '
      + '코인 시세(업비트)는 키·프록시 없이 바로 붙습니다.</p>'
    );
    openDialog('연결 속성', node, [
      { label: '항목 관리', onClick: () => { onClose = dlgManage; closeDialog(); } },
      { label: '취소', onClick: closeDialog },
      {
        label: '확인', primary: true, onClick: () => {
          s.refreshSec = Math.min(600, Math.max(5, Number($('s-sec').value) || 15));
          s.zoom = Math.min(2, Math.max(0.7, (Number($('s-zoom').value) || 100) / 100));
          s.serviceKey = ($('s-key').value || '').trim();
          s.proxy = ($('s-proxy').value || '').trim();
          save();
          applyView();
          reschedule();
          closeDialog();
          refresh();
        }
      }
    ]);
  }

  function escapeAttr(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ── 보기 설정 반영 ────────────────────────── */
  function applyView() {
    document.body.classList.toggle('no-gridlines', !state.settings.gridlines);
    document.body.classList.toggle('no-headings', !state.settings.headings);
    document.documentElement.style.setProperty('--zoom', state.settings.zoom);
    el.zoomVal.textContent = Math.round(state.settings.zoom * 100) + '%';
    $('opt-gridlines').checked = state.settings.gridlines;
    $('opt-headings').checked = state.settings.headings;
    $('opt-blur-decoy').checked = state.settings.blurDecoy;
    $('auto-refresh').checked = state.settings.autoRefresh;
  }

  function zoom(delta) {
    state.settings.zoom = Math.min(2, Math.max(0.7, Math.round((state.settings.zoom + delta) * 100) / 100));
    save();
    applyView();
    render();
  }

  /* ── 명령 ──────────────────────────────────── */
  function command(cmd) {
    if (cmd === 'refresh') refresh();
    else if (cmd === 'decoy') setDecoy(!state.decoy);
    else if (cmd === 'add-item') dlgAddItem();
    else if (cmd === 'edit-holdings') dlgHoldings();
    else if (cmd === 'settings') dlgSettings();
    else if (cmd === 'zoom-in') zoom(0.1);
    else if (cmd === 'zoom-out') zoom(-0.1);
  }

  /* ── 이벤트 ────────────────────────────────── */
  function bind() {
    document.addEventListener('click', (e) => {
      const cmdEl = e.target.closest('[data-cmd]');
      if (cmdEl) { command(cmdEl.dataset.cmd); return; }

      const rtab = e.target.closest('.rtab');
      if (rtab) {
        const want = rtab.dataset.tab;
        if (want === 'file') {
          selectRibbon('home');
          dlgSettings();
        } else {
          selectRibbon(want);
        }
        return;
      }

      const stab = e.target.closest('.stab');
      if (stab) {
        state.sheet = stab.dataset.sheet;
        state.decoy = false;
        document.body.classList.remove('decoy');
        state.anchor = null;
        renderTabs();
        render();
        return;
      }

      const td = e.target.closest('.sheet td');
      if (td) {
        const r = Number(td.dataset.r), c = Number(td.dataset.c);
        if (e.shiftKey) {
          if (!state.anchor) state.anchor = { r: state.sel.r, c: state.sel.c };
        } else {
          state.anchor = null;
        }
        state.sel = { r, c };
        render();
      }
    });

    el.status.addEventListener('click', () => setDecoy(!state.decoy));
    $('dlg-close').addEventListener('click', closeDialog);
    el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeDialog(); });

    $('opt-gridlines').addEventListener('change', (e) => { state.settings.gridlines = e.target.checked; save(); applyView(); });
    $('opt-headings').addEventListener('change', (e) => { state.settings.headings = e.target.checked; save(); applyView(); });
    $('opt-blur-decoy').addEventListener('change', (e) => { state.settings.blurDecoy = e.target.checked; save(); });
    $('auto-refresh').addEventListener('change', (e) => { state.settings.autoRefresh = e.target.checked; save(); reschedule(); });

    document.addEventListener('keydown', (e) => {
      if (!el.modal.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
        return;
      }
      if (e.key === 'Escape' || e.key === '`') {
        e.preventDefault();
        setDecoy(!state.decoy);
        return;
      }
      if (e.key === 'F5' && !e.ctrlKey) { e.preventDefault(); refresh(); return; }

      const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (moves[e.key]) {
        e.preventDefault();
        if (e.shiftKey && !state.anchor) state.anchor = { r: state.sel.r, c: state.sel.c };
        if (!e.shiftKey) state.anchor = null;
        state.sel.r = Math.min(ROWS, Math.max(1, state.sel.r + moves[e.key][0]));
        state.sel.c = Math.min(colCount, Math.max(1, state.sel.c + moves[e.key][1]));
        render();
        const cur = el.body.querySelector('td.sel');
        if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 120);
    });

    window.addEventListener('blur', () => {
      if (state.settings.blurDecoy && !state.decoy && el.modal.hidden) setDecoy(true);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (state.settings.blurDecoy && !state.decoy) setDecoy(true);
      } else if (state.settings.autoRefresh) {
        refresh();
      }
    });
  }

  /* ── 시작 ──────────────────────────────────── */
  load();
  state.quotes = Quotes.demo(allCodes());   // 네트워크 응답 전에도 표가 채워져 있게
  applyView();
  renderTabs();
  render();
  bind();
  refresh();
  reschedule();
})();
