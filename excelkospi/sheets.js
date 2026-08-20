/* 시트 정의 — 상태(state)를 받아 셀 맵을 만든다.
 * 셀은 { v: 표시값, c: 클래스, f: 수식 입력줄에 보여줄 문자열 } 형태.
 * 화면은 항상 A~N 14열 × 44행을 그리고, 여기서 만든 셀만 채운다.
 */
const Sheets = (() => {
  'use strict';

  /* 열 이름: A…Z, AA… (엑셀과 동일 규칙) */
  function colLetter(i) {
    let s = '';
    i += 1;
    while (i > 0) {
      const m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }
  const COLS = Array.from({ length: 40 }, (_, i) => colLetter(i));
  const ROWS = 44;

  const nf = new Intl.NumberFormat('ko-KR');
  const nf2 = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function money(v, code) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    if (code && code.startsWith('KRW-') && Math.abs(v) < 100) return nf2.format(v);
    if (code && code.startsWith('IDX:')) return nf2.format(v);
    return nf.format(Math.round(v));
  }
  function pct(v) {
    if (!isFinite(v)) return '';
    return (v > 0 ? '+' : '') + nf2.format(v) + '%';
  }
  function signed(v, code) {
    if (!isFinite(v)) return '';
    const s = money(Math.abs(v), code);
    return v > 0 ? '▲ ' + s : v < 0 ? '▼ ' + s : '– ' + s;
  }
  function dir(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }

  function clock(d) {
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* 공통 머리글 */
  function head(cells, row, labels) {
    labels.forEach((t, i) => {
      cells[COLS[i] + row] = { v: t, c: 'hd' };
    });
  }

  /* ── 시세 시트 (주식 / 코인 공용) ──────────────── */
  function quoteSheet(title, items, state) {
    const cells = {};
    const widths = [40, 80, 140, 92, 88, 76, 104, 124, 88, 88, 92, 70, 70, 70];
    cells.A1 = { v: title, c: 'title spill' };
    cells.A2 = {
      v: '작성: 경영기획팀     최종 갱신: ' + clock(state.updatedAt || new Date())
         + '     단위: 원',
      c: 'note spill'
    };
    head(cells, 3, ['번호', '코드', '항목명', '단가', '증감', '증감율', '수량', '금액', '최고', '최저', '비고']);

    let r = 4;
    let sumAmt = 0;
    items.forEach((it, i) => {
      const q = state.quotes.get(it.code);
      if (!q) return;
      const amount = q.price * (q.volume || 0);
      sumAmt += amount;
      const d = dir(q.diff);
      const stale = q.live ? '' : ' stale';
      cells['A' + r] = { v: String(i + 1), c: 'ctr' };
      cells['B' + r] = { v: it.code.replace('IDX:', ''), c: 'ctr' };
      cells['C' + r] = { v: q.name, c: '' };
      cells['D' + r] = {
        v: money(q.price, it.code), c: 'num b ' + d + stale,
        f: '=RTD("quote";;"' + it.code + '";"현재가")'
      };
      cells['E' + r] = { v: signed(q.diff, it.code), c: 'num ' + d + stale, f: '=D' + r + '-K' + r };
      cells['F' + r] = { v: pct(q.rate), c: 'num ' + d + stale, f: '=(D' + r + '-K' + r + ')/K' + r };
      cells['G' + r] = { v: q.volume ? nf.format(q.volume) : '', c: 'num' + stale };
      cells['H' + r] = { v: amount ? nf.format(Math.round(amount)) : '', c: 'num' + stale, f: '=D' + r + '*G' + r };
      cells['I' + r] = { v: money(q.high, it.code), c: 'num note' + stale };
      cells['J' + r] = { v: money(q.low, it.code), c: 'num note' + stale };
      cells['K' + r] = { v: q.live ? (q.asOf || '연결됨') : '데모', c: 'ctr note' + stale };
      r++;
    });

    if (!items.length) {
      cells.C4 = { v: '항목이 없습니다. [데이터] → [항목 추가]', c: 'note spill' };
      r = 5;
    } else {
      cells['C' + r] = { v: '합계', c: 'tot' };
      cells['A' + r] = { v: '', c: 'tot' };
      cells['B' + r] = { v: '', c: 'tot' };
      cells['D' + r] = { v: '', c: 'tot' };
      cells['E' + r] = { v: '', c: 'tot' };
      cells['F' + r] = { v: '', c: 'tot' };
      cells['G' + r] = { v: '', c: 'tot' };
      cells['H' + r] = { v: nf.format(Math.round(sumAmt)), c: 'tot num', f: '=SUM(H4:H' + (r - 1) + ')' };
      cells['I' + r] = { v: '', c: 'tot' };
      cells['J' + r] = { v: '', c: 'tot' };
      cells['K' + r] = { v: '', c: 'tot' };
    }
    return { cells, widths };
  }

  /* ── 보유 현황 시트 ───────────────────────────── */
  function holdingSheet(state) {
    const cells = {};
    const widths = [40, 80, 140, 84, 100, 120, 100, 124, 112, 84, 70, 70, 70, 70];
    cells.A1 = { v: '원가 · 평가 집계표', c: 'title spill' };
    cells.A2 = {
      v: '기준: ' + clock(state.updatedAt || new Date()) + '     단위: 원',
      c: 'note spill'
    };
    head(cells, 3, ['번호', '코드', '항목명', '수량', '취득단가', '취득금액', '현재단가', '평가금액', '차액', '증감율']);

    let r = 4;
    let cost = 0, val = 0;
    state.holdings.forEach((h, i) => {
      const q = state.quotes.get(h.code);
      const price = q ? q.price : 0;
      const c = h.qty * h.avg;
      const v = h.qty * price;
      cost += c; val += v;
      const d = dir(v - c);
      const stale = q && q.live ? '' : ' stale';
      cells['A' + r] = { v: String(i + 1), c: 'ctr' };
      cells['B' + r] = { v: h.code.replace('IDX:', ''), c: 'ctr' };
      cells['C' + r] = { v: (q && q.name) || h.name || h.code, c: '' };
      cells['D' + r] = { v: nf.format(h.qty), c: 'num' };
      cells['E' + r] = { v: money(h.avg, h.code), c: 'num' };
      cells['F' + r] = { v: nf.format(Math.round(c)), c: 'num', f: '=D' + r + '*E' + r };
      cells['G' + r] = { v: money(price, h.code), c: 'num b' + stale, f: '=RTD("quote";;"' + h.code + '";"현재가")' };
      cells['H' + r] = { v: nf.format(Math.round(v)), c: 'num' + stale, f: '=D' + r + '*G' + r };
      cells['I' + r] = { v: signed(v - c, ''), c: 'num ' + d + stale, f: '=H' + r + '-F' + r };
      cells['J' + r] = { v: c ? pct(((v - c) / c) * 100) : '', c: 'num ' + d + stale, f: '=(H' + r + '-F' + r + ')/F' + r };
      r++;
    });

    if (!state.holdings.length) {
      cells.C4 = { v: '보유 항목이 없습니다. [데이터] → [보유 수량 편집]', c: 'note spill' };
      return { cells, widths };
    }

    const d = dir(val - cost);
    for (let i = 0; i < 10; i++) cells[COLS[i] + r] = { v: '', c: 'tot' };
    cells['C' + r] = { v: '합계', c: 'tot' };
    cells['F' + r] = { v: nf.format(Math.round(cost)), c: 'tot num', f: '=SUM(F4:F' + (r - 1) + ')' };
    cells['H' + r] = { v: nf.format(Math.round(val)), c: 'tot num', f: '=SUM(H4:H' + (r - 1) + ')' };
    cells['I' + r] = { v: signed(val - cost, ''), c: 'tot num ' + d, f: '=H' + r + '-F' + r };
    cells['J' + r] = { v: cost ? pct(((val - cost) / cost) * 100) : '', c: 'tot num ' + d };
    return { cells, widths };
  }

  /* ── 메모(사용법) 시트 ────────────────────────── */
  function memoSheet() {
    const cells = {};
    const widths = [40, 150, 460, 90, 90, 90, 90, 90, 70, 70, 70, 70, 70, 70];
    const lines = [
      ['업무 메모', ''],
      ['', ''],
      ['화면 보호', 'Esc 또는 ` 키를 누르면 예산 집행표로 즉시 전환됩니다. 같은 키로 되돌아옵니다.'],
      ['', '상태 표시줄 왼쪽의 "준비"를 눌러도 전환됩니다.'],
      ['자동 전환', '[보기] → "창 벗어나면 화면 보호"를 켜면 다른 창을 클릭할 때 자동 전환됩니다.'],
      ['', ''],
      ['항목 추가', '[데이터] → [항목 추가]. 6자리 종목코드(예: 005930) 또는 코인 코드(KRW-BTC).'],
      ['보유 편집', '[데이터] → [보유 수량 편집]에서 수량·취득단가를 넣으면 평가손익이 계산됩니다.'],
      ['새로 고침', '[데이터] → [모두 새로 고침]. 자동 새로 고침 주기는 [연결 속성]에서 바꿉니다.'],
      ['', ''],
      ['데이터 연결', '코인 시세는 업비트 공개 API로 별도 설정 없이 바로 붙습니다.'],
      ['', '국내 주식·지수는 공공데이터포털 인증키가 있어야 하며, 전 영업일 종가 기준입니다.'],
      ['', '[데이터] → [연결 속성]에 인증키를 넣으세요. 키는 이 브라우저에만 저장됩니다.'],
      ['', '연결이 막히면 비고 열이 "데모"로 표시되고 모의 시세로 화면만 유지합니다.'],
      ['', ''],
      ['보관', '관심 항목·보유 수량·설정은 localStorage에만 저장되며 서버로 보내지 않습니다.'],
      ['', ''],
      ['유의', '이 화면은 투자 판단에 쓰라고 만든 것이 아닙니다. 근무 중 사용은 각자 책임입니다.']
    ];
    cells.A1 = { v: '', c: '' };
    let r = 2;
    lines.forEach(([b, c]) => {
      if (b) cells['B' + r] = { v: b, c: r === 2 ? 'title spill' : 'b' };
      if (c) cells['C' + r] = { v: c, c: 'spill' };
      r++;
    });
    return { cells, widths };
  }

  /* ── 위장 시트 ───────────────────────────────── */
  function decoySheet() {
    const cells = {};
    const widths = [40, 130, 150, 110, 110, 110, 96, 90, 90, 80, 70, 70, 70, 70];
    cells.A1 = { v: '2026년 부서별 예산 집행 현황 (3분기 누계)', c: 'title spill' };
    cells.A2 = { v: '작성: 경영기획팀     단위: 천원', c: 'note spill' };
    head(cells, 3, ['번호', '부서', '계정과목', '예산액', '집행액', '잔액', '집행률', '비고']);

    const rows = [
      ['경영기획팀', '일반관리비', 148000, 121450],
      ['경영기획팀', '지급수수료', 62000, 44980],
      ['영업1팀', '판매촉진비', 210000, 187300],
      ['영업1팀', '여비교통비', 48000, 39120],
      ['영업2팀', '판매촉진비', 176000, 132640],
      ['생산관리팀', '소모품비', 94000, 88710],
      ['생산관리팀', '수선비', 132000, 76540],
      ['품질보증팀', '검사수수료', 58000, 51230],
      ['연구개발팀', '연구비', 320000, 268900],
      ['연구개발팀', '지급수수료', 74000, 40510],
      ['인사팀', '교육훈련비', 66000, 42180],
      ['인사팀', '복리후생비', 118000, 103470],
      ['전산팀', '소프트웨어', 152000, 149800],
      ['전산팀', '통신비', 39000, 28640],
      ['총무팀', '임차료', 264000, 198000],
      ['총무팀', '차량유지비', 41000, 33920]
    ];
    let r = 4, sb = 0, se = 0;
    rows.forEach((row, i) => {
      const [dept, acct, budget, spent] = row;
      sb += budget; se += spent;
      const rate = (spent / budget) * 100;
      cells['A' + r] = { v: String(i + 1), c: 'ctr' };
      cells['B' + r] = { v: dept, c: '' };
      cells['C' + r] = { v: acct, c: '' };
      cells['D' + r] = { v: nf.format(budget), c: 'num' };
      cells['E' + r] = { v: nf.format(spent), c: 'num' };
      cells['F' + r] = { v: nf.format(budget - spent), c: 'num', f: '=D' + r + '-E' + r };
      cells['G' + r] = { v: nf2.format(rate) + '%', c: 'num', f: '=E' + r + '/D' + r };
      cells['H' + r] = { v: rate > 90 ? '점검' : '', c: 'ctr note' };
      r++;
    });
    for (let i = 0; i < 8; i++) cells[COLS[i] + r] = { v: '', c: 'tot' };
    cells['B' + r] = { v: '합계', c: 'tot' };
    cells['D' + r] = { v: nf.format(sb), c: 'tot num', f: '=SUM(D4:D' + (r - 1) + ')' };
    cells['E' + r] = { v: nf.format(se), c: 'tot num', f: '=SUM(E4:E' + (r - 1) + ')' };
    cells['F' + r] = { v: nf.format(sb - se), c: 'tot num', f: '=D' + r + '-E' + r };
    cells['G' + r] = { v: nf2.format((se / sb) * 100) + '%', c: 'tot num' };
    return { cells, widths };
  }

  const TABS = [
    { id: 'stock', label: '실적_국내' },
    { id: 'coin', label: '실적_해외' },
    { id: 'holding', label: '원가집계' },
    { id: 'memo', label: 'Sheet1' }
  ];

  function build(id, state) {
    if (id === 'stock') return quoteSheet('2026년 3분기 부문별 실적 집계', state.watch, state);
    if (id === 'coin') return quoteSheet('해외법인 품목별 단가 현황', state.coins, state);
    if (id === 'holding') return holdingSheet(state);
    return memoSheet();
  }

  return { COLS, ROWS, TABS, build, decoySheet, colLetter, money, pct, nf };
})();
