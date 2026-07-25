// 색칠 국기 데이터 — 6세용. 팔레트 8색만 사용하고, 국기 색도 이 8색으로 단순화한다.
// 좌표계: 모든 국기 viewBox "0 0 300 200" (3:2)로 통일.
// regions: 배경을 먼저, 그 위에 올라가는 도형(원·별·십자·삼각형)을 뒤에 둔다(그리는 순서 = 위아래).
// 국기는 70개 풀. app.js가 한 판에 그중 일부만 랜덤으로 뽑아 낸다.

const PALETTE = [
  { key: "red",     color: "#e23b3b", label: "빨강" },
  { key: "orange",  color: "#f0912a", label: "주황" },
  { key: "yellow",  color: "#ffd23f", label: "노랑" },
  { key: "green",   color: "#35b56a", label: "초록" },
  { key: "skyblue", color: "#4bb3e6", label: "하늘색" },
  { key: "blue",    color: "#2f6fd6", label: "파랑" },
  { key: "white",   color: "#ffffff", label: "하양" },
  { key: "black",   color: "#33373d", label: "검정" },
];

// ---------- 도형 헬퍼 ----------
// 세로 3색기 (한 줄 폭 100)
const vstripes = (a, b, c) => [
  { t: "rect", x: 0,   y: 0, w: 100, h: 200, answer: a },
  { t: "rect", x: 100, y: 0, w: 100, h: 200, answer: b },
  { t: "rect", x: 200, y: 0, w: 100, h: 200, answer: c },
];
// 가로 3색기 (한 줄 높이 ≈ 66.67)
const hstripes = (a, b, c) => [
  { t: "rect", x: 0, y: 0,      w: 300, h: 66.67, answer: a },
  { t: "rect", x: 0, y: 66.67,  w: 300, h: 66.66, answer: b },
  { t: "rect", x: 0, y: 133.33, w: 300, h: 66.67, answer: c },
];
// 가로 2색기 (높이 100)
const hstripes2 = (a, b) => [
  { t: "rect", x: 0, y: 0,   w: 300, h: 100, answer: a },
  { t: "rect", x: 0, y: 100, w: 300, h: 100, answer: b },
];
// 두께가 다른 가로 띠. bands = [[색, 무게], ...]
function hbands(bands) {
  const total = bands.reduce((s, b) => s + b[1], 0);
  let y = 0;
  const out = [];
  for (const [color, wt] of bands) {
    const h = (200 * wt) / total;
    out.push({ t: "rect", x: 0, y: +y.toFixed(2), w: 300, h: +(h + 0.5).toFixed(2), answer: color });
    y += h;
  }
  return out;
}
// 북유럽(스칸디나비아) 십자 — 왼쪽으로 치우친 +
const NORDIC = "M88 0 H123 V82 H300 V118 H123 V200 H88 V118 H0 V82 H88 Z";
const nordic = (bg, cross) => [
  { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: bg },
  { t: "path", d: NORDIC, answer: cross },
];
// 이중 북유럽 십자(노르웨이·아이슬란드)
const NORDIC_OUT = "M80 0 H131 V74 H300 V126 H131 V200 H80 V126 H0 V74 H80 Z";
const NORDIC_IN  = "M92 0 H119 V86 H300 V114 H119 V200 H92 V114 H0 V86 H92 Z";
const nordic2 = (bg, outer, inner) => [
  { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: bg },
  { t: "path", d: NORDIC_OUT, answer: outer },
  { t: "path", d: NORDIC_IN,  answer: inner },
];
// 가운데 십자(잉글랜드) — 가장자리까지 닿는 +
const MID_CROSS = "M130 0 H170 V80 H300 V120 H170 V200 H130 V120 H0 V80 H130 Z";
// 배경 + 원
const disc = (bg, c, r, cx, cy) => [
  { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: bg },
  { t: "circle", cx: cx || 150, cy: cy || 100, r: r || 58, answer: c },
];
// 깃대쪽 삼각형 (x까지 뾰족하게)
const triHoist = (x) => `M0 0 L0 200 L${x} 100 Z`;

// 별(5각) 경로. 여러 개면 이어 붙여 한 영역으로.
function starPath(cx, cy, r, rotDeg) {
  const rot = ((rotDeg || 0) * Math.PI) / 180;
  const inner = r * 0.382;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : inner;
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    d += (i === 0 ? "M" : "L") +
      (cx + rad * Math.cos(a)).toFixed(1) + " " +
      (cy + rad * Math.sin(a)).toFixed(1) + " ";
  }
  return d + "Z ";
}

const FLAGS = [
  // ---------- 세로 삼색기 ----------
  { id: "france", name: "프랑스", emoji: "🇫🇷", regions: vstripes("blue", "white", "red"), fact: "파랑·하양·빨강! 뾰족한 에펠탑이 있는 나라예요." },
  { id: "italy", name: "이탈리아", emoji: "🇮🇹", regions: vstripes("green", "white", "red"), fact: "초록·하양·빨강! 피자와 파스타가 태어난 나라예요." },
  { id: "ireland", name: "아일랜드", emoji: "🇮🇪", regions: vstripes("green", "white", "orange"), fact: "초록·하양·주황! 초록 들판이 아주 넓어요." },
  { id: "belgium", name: "벨기에", emoji: "🇧🇪", regions: vstripes("black", "yellow", "red"), fact: "검정·노랑·빨강! 초콜릿과 감자튀김의 나라예요." },
  { id: "romania", name: "루마니아", emoji: "🇷🇴", regions: vstripes("blue", "yellow", "red"), fact: "파랑·노랑·빨강! 오래된 성이 많은 나라예요." },
  { id: "nigeria", name: "나이지리아", emoji: "🇳🇬", regions: vstripes("green", "white", "green"), fact: "초록·하양·초록! 아프리카에서 사람이 가장 많아요." },
  { id: "ivory-coast", name: "코트디부아르", emoji: "🇨🇮", regions: vstripes("orange", "white", "green"), fact: "주황·하양·초록! 코코아를 많이 키우는 나라예요." },
  { id: "guinea", name: "기니", emoji: "🇬🇳", regions: vstripes("red", "yellow", "green"), fact: "빨강·노랑·초록! 아프리카 서쪽 나라예요." },
  { id: "mali", name: "말리", emoji: "🇲🇱", regions: vstripes("green", "yellow", "red"), fact: "초록·노랑·빨강! 사막과 큰 강이 있어요." },
  { id: "peru", name: "페루", emoji: "🇵🇪", regions: vstripes("red", "white", "red"), fact: "빨강·하양·빨강! 옛날 잉카 사람들의 마추픽추가 있어요." },

  // ---------- 가로 삼색기 ----------
  { id: "germany", name: "독일", emoji: "🇩🇪", regions: hstripes("black", "red", "yellow"), fact: "검정·빨강·노랑! 자동차를 아주 잘 만들어요." },
  { id: "netherlands", name: "네덜란드", emoji: "🇳🇱", regions: hstripes("red", "white", "blue"), fact: "빨강·하양·파랑! 풍차와 튤립의 나라예요." },
  { id: "russia", name: "러시아", emoji: "🇷🇺", regions: hstripes("white", "blue", "red"), fact: "하양·파랑·빨강! 세계에서 가장 넓은 나라예요." },
  { id: "hungary", name: "헝가리", emoji: "🇭🇺", regions: hstripes("red", "white", "green"), fact: "빨강·하양·초록! 따뜻한 온천이 많아요." },
  { id: "bulgaria", name: "불가리아", emoji: "🇧🇬", regions: hstripes("white", "green", "red"), fact: "하양·초록·빨강! 요구르트로 유명해요." },
  { id: "lithuania", name: "리투아니아", emoji: "🇱🇹", regions: hstripes("yellow", "green", "red"), fact: "노랑·초록·빨강! 북쪽 바닷가 나라예요." },
  { id: "armenia", name: "아르메니아", emoji: "🇦🇲", regions: hstripes("red", "blue", "orange"), fact: "빨강·파랑·주황! 아주 오래된 나라예요." },
  { id: "austria", name: "오스트리아", emoji: "🇦🇹", regions: hstripes("red", "white", "red"), fact: "빨강·하양·빨강! 모차르트 음악의 나라예요." },
  { id: "estonia", name: "에스토니아", emoji: "🇪🇪", regions: hstripes("blue", "black", "white"), fact: "파랑·검정·하양! 노래를 아주 좋아하는 나라예요." },
  { id: "luxembourg", name: "룩셈부르크", emoji: "🇱🇺", regions: hstripes("red", "white", "skyblue"), fact: "빨강·하양·하늘색! 아주 작고 부유한 나라예요." },
  { id: "yemen", name: "예멘", emoji: "🇾🇪", regions: hstripes("red", "white", "black"), fact: "빨강·하양·검정! 뜨거운 사막 나라예요." },
  { id: "sierra-leone", name: "시에라리온", emoji: "🇸🇱", regions: hstripes("green", "white", "blue"), fact: "초록·하양·파랑! 아프리카 바닷가 나라예요." },
  { id: "gabon", name: "가봉", emoji: "🇬🇦", regions: hstripes("green", "yellow", "blue"), fact: "초록·노랑·파랑! 밀림과 바다가 있어요." },
  { id: "bolivia", name: "볼리비아", emoji: "🇧🇴", regions: hstripes("red", "yellow", "green"), fact: "빨강·노랑·초록! 아주 높은 산 위의 나라예요." },
  { id: "venezuela", name: "베네수엘라", emoji: "🇻🇪", regions: hstripes("yellow", "blue", "red"), fact: "노랑·파랑·빨강! 세계에서 가장 높은 폭포가 있어요." },
  { id: "ethiopia", name: "에티오피아", emoji: "🇪🇹", regions: hstripes("green", "yellow", "red"), fact: "초록·노랑·빨강! 커피가 태어난 나라예요." },

  // ---------- 가로 2색기 ----------
  { id: "indonesia", name: "인도네시아", emoji: "🇮🇩", regions: hstripes2("red", "white"), fact: "빨강·하양! 섬이 아주아주 많은 나라예요." },
  { id: "poland", name: "폴란드", emoji: "🇵🇱", regions: hstripes2("white", "red"), fact: "하양·빨강! 쇼팽 음악의 나라예요." },
  { id: "ukraine", name: "우크라이나", emoji: "🇺🇦", regions: hstripes2("blue", "yellow"), fact: "파랑·노랑! 파란 하늘과 노란 밀밭이에요." },

  // ---------- 두께 다른 가로 띠 ----------
  { id: "spain", name: "스페인", emoji: "🇪🇸", regions: hbands([["red", 1], ["yellow", 2], ["red", 1]]), fact: "빨강·노랑·빨강! 축구와 플라멩코 춤의 나라예요." },
  { id: "colombia", name: "콜롬비아", emoji: "🇨🇴", regions: hbands([["yellow", 2], ["blue", 1], ["red", 1]]), fact: "노랑·파랑·빨강! 맛있는 커피의 나라예요." },
  { id: "thailand", name: "태국", emoji: "🇹🇭", regions: hbands([["red", 1], ["white", 1], ["blue", 2], ["white", 1], ["red", 1]]), fact: "코끼리와 똠얌꿍의 나라예요." },
  { id: "costa-rica", name: "코스타리카", emoji: "🇨🇷", regions: hbands([["blue", 1], ["white", 1], ["red", 2], ["white", 1], ["blue", 1]]), fact: "숲과 동물이 아름다운 나라예요." },
  { id: "argentina", name: "아르헨티나", emoji: "🇦🇷", regions: hstripes("skyblue", "white", "skyblue"), fact: "하늘색·하양·하늘색! 축구를 아주 잘해요." },
  {
    id: "laos", name: "라오스", emoji: "🇱🇦",
    regions: hbands([["red", 1], ["blue", 2], ["red", 1]]).concat([{ t: "circle", cx: 150, cy: 100, r: 36, answer: "white" }]),
    fact: "큰 메콩강이 흐르는 나라예요.",
  },
  { id: "mauritius", name: "모리셔스", emoji: "🇲🇺", regions: hbands([["red", 1], ["blue", 1], ["yellow", 1], ["green", 1]]), fact: "빨강·파랑·노랑·초록! 인도양의 예쁜 섬나라예요." },
  { id: "gambia", name: "감비아", emoji: "🇬🇲", regions: hbands([["red", 6], ["white", 1], ["blue", 4], ["white", 1], ["green", 6]]), fact: "가운데로 강이 길게 흐르는 나라예요." },
  { id: "botswana", name: "보츠와나", emoji: "🇧🇼", regions: hbands([["skyblue", 9], ["white", 1], ["black", 4], ["white", 1], ["skyblue", 9]]), fact: "코끼리가 아주 많이 사는 나라예요." },

  // ---------- 북유럽 십자 ----------
  { id: "sweden", name: "스웨덴", emoji: "🇸🇪", regions: nordic("blue", "yellow"), fact: "파란 바탕에 노란 십자! 눈이 많이 와요." },
  { id: "denmark", name: "덴마크", emoji: "🇩🇰", regions: nordic("red", "white"), fact: "빨간 바탕에 하얀 십자! 레고가 태어난 나라예요." },
  { id: "finland", name: "핀란드", emoji: "🇫🇮", regions: nordic("white", "blue"), fact: "하얀 바탕에 파란 십자! 산타 할아버지의 나라예요." },
  { id: "norway", name: "노르웨이", emoji: "🇳🇴", regions: nordic2("red", "white", "blue"), fact: "멋진 절벽 바다 피오르드가 있는 나라예요." },
  { id: "iceland", name: "아이슬란드", emoji: "🇮🇸", regions: nordic2("blue", "white", "red"), fact: "얼음과 화산이 함께 있는 나라예요." },

  // ---------- 가운데 십자 ----------
  {
    id: "england", name: "잉글랜드", emoji: "🏴",
    regions: [{ t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "white" }, { t: "path", d: MID_CROSS, answer: "red" }],
    fact: "하얀 바탕에 빨간 십자! 빨간 이층버스의 나라예요.",
  },
  {
    id: "switzerland", name: "스위스", emoji: "🇨🇭",
    regions: [{ t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "red" }, { t: "path", d: "M133 58 H167 V83 H192 V117 H167 V142 H133 V117 H108 V83 H133 Z", answer: "white" }],
    fact: "빨간 바탕에 하얀 십자! 시계와 초콜릿, 알프스의 나라예요.",
  },

  // ---------- 배경 + 원 ----------
  { id: "japan", name: "일본", emoji: "🇯🇵", regions: disc("white", "red", 58), fact: "하얀 바탕에 빨간 동그라미! 우리나라 옆 섬나라예요." },
  { id: "bangladesh", name: "방글라데시", emoji: "🇧🇩", regions: disc("green", "red", 52), fact: "초록 바탕에 빨간 동그라미! 강이 아주 많은 나라예요." },
  { id: "palau", name: "팔라우", emoji: "🇵🇼", regions: disc("skyblue", "yellow", 52), fact: "하늘색 바탕에 노란 동그라미! 바다가 예쁜 섬나라예요." },
  {
    id: "niger", name: "니제르", emoji: "🇳🇪",
    regions: hstripes("orange", "white", "green").concat([{ t: "circle", cx: 150, cy: 100, r: 26, answer: "orange" }]),
    fact: "주황·하양·초록에 주황 동그라미! 사막의 나라예요.",
  },

  // ---------- 깃대쪽 삼각형 ----------
  {
    id: "czechia", name: "체코", emoji: "🇨🇿",
    regions: [{ t: "rect", x: 0, y: 0, w: 300, h: 100, answer: "white" }, { t: "rect", x: 0, y: 100, w: 300, h: 100, answer: "red" }, { t: "path", d: triHoist(130), answer: "blue" }],
    fact: "예쁜 도시 프라하가 있는 나라예요.",
  },
  {
    id: "sudan", name: "수단", emoji: "🇸🇩",
    regions: hstripes("red", "white", "black").concat([{ t: "path", d: triHoist(130), answer: "green" }]),
    fact: "큰 나일강이 흐르는 사막 나라예요.",
  },
  {
    id: "palestine", name: "팔레스타인", emoji: "🇵🇸",
    regions: hstripes("black", "white", "green").concat([{ t: "path", d: triHoist(130), answer: "red" }]),
    fact: "검정·하양·초록에 빨간 삼각형이 있어요.",
  },
  {
    id: "kuwait", name: "쿠웨이트", emoji: "🇰🇼",
    regions: hstripes("green", "white", "red").concat([{ t: "path", d: "M0 0 L60 66.67 L60 133.33 L0 200 Z", answer: "black" }]),
    fact: "바닷가에 반짝이는 도시가 있는 나라예요.",
  },

  // ---------- 깃대쪽 색 띠 ----------
  {
    id: "uae", name: "아랍에미리트", emoji: "🇦🇪",
    regions: [
      { t: "rect", x: 0, y: 0, w: 75, h: 200, answer: "red" },
      { t: "rect", x: 75, y: 0, w: 225, h: 66.67, answer: "green" },
      { t: "rect", x: 75, y: 66.67, w: 225, h: 66.66, answer: "white" },
      { t: "rect", x: 75, y: 133.33, w: 225, h: 66.67, answer: "black" },
    ],
    fact: "사막 위에 아주 높은 빌딩이 있는 나라예요.",
  },
  {
    id: "madagascar", name: "마다가스카르", emoji: "🇲🇬",
    regions: [
      { t: "rect", x: 0, y: 0, w: 100, h: 200, answer: "white" },
      { t: "rect", x: 100, y: 0, w: 200, h: 100, answer: "red" },
      { t: "rect", x: 100, y: 100, w: 200, h: 100, answer: "green" },
    ],
    fact: "귀여운 여우원숭이가 사는 섬나라예요.",
  },
  {
    id: "benin", name: "베냉", emoji: "🇧🇯",
    regions: [
      { t: "rect", x: 0, y: 0, w: 100, h: 200, answer: "green" },
      { t: "rect", x: 100, y: 0, w: 200, h: 100, answer: "yellow" },
      { t: "rect", x: 100, y: 100, w: 200, h: 100, answer: "red" },
    ],
    fact: "아프리카 서쪽의 작은 나라예요.",
  },

  // ---------- 대각선 ----------
  {
    id: "congo", name: "콩고공화국", emoji: "🇨🇬",
    regions: [
      { t: "path", d: "M180 0 L300 0 L300 80 L120 200 L0 200 L0 120 Z", answer: "yellow" },
      { t: "path", d: "M0 0 L180 0 L0 120 Z", answer: "green" },
      { t: "path", d: "M300 80 L300 200 L120 200 Z", answer: "red" },
    ],
    fact: "초록·노랑·빨강이 비스듬하게! 밀림의 나라예요.",
  },
  {
    id: "tanzania", name: "탄자니아", emoji: "🇹🇿",
    regions: [
      { t: "path", d: "M180 0 L300 0 L300 80 L120 200 L0 200 L0 120 Z", answer: "black" },
      { t: "path", d: "M0 0 L180 0 L0 120 Z", answer: "green" },
      { t: "path", d: "M300 80 L300 200 L120 200 Z", answer: "blue" },
    ],
    fact: "아주 높은 킬리만자로 산이 있는 나라예요.",
  },

  // ---------- 사각 십자 / 칸 ----------
  {
    id: "tonga", name: "통가", emoji: "🇹🇴",
    regions: [
      { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "red" },
      { t: "rect", x: 0, y: 0, w: 120, h: 100, answer: "white" },
      { t: "path", d: "M50 15 H70 V40 H95 V60 H70 V85 H50 V60 H25 V40 H50 Z", answer: "red" },
    ],
    fact: "남태평양 바다 위의 섬나라예요.",
  },
  {
    id: "dominican", name: "도미니카공화국", emoji: "🇩🇴",
    regions: [
      { t: "rect", x: 0, y: 0, w: 130, h: 80, answer: "blue" },
      { t: "rect", x: 170, y: 0, w: 130, h: 80, answer: "red" },
      { t: "rect", x: 0, y: 120, w: 130, h: 80, answer: "red" },
      { t: "rect", x: 170, y: 120, w: 130, h: 80, answer: "blue" },
      { t: "path", d: MID_CROSS, answer: "white" },
    ],
    fact: "하얀 십자로 네 칸이 나뉜 섬나라예요.",
  },

  // ---------- 별 국기 ----------
  {
    id: "vietnam", name: "베트남", emoji: "🇻🇳",
    regions: [{ t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "red" }, { t: "path", d: starPath(150, 100, 58), answer: "yellow" }],
    fact: "빨간 바탕에 노란 별! 쌀국수의 나라예요.",
  },
  {
    id: "somalia", name: "소말리아", emoji: "🇸🇴",
    regions: [{ t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "skyblue" }, { t: "path", d: starPath(150, 100, 55), answer: "white" }],
    fact: "하늘색 바탕에 하얀 별! 아프리카 동쪽 나라예요.",
  },
  {
    id: "senegal", name: "세네갈", emoji: "🇸🇳",
    regions: vstripes("green", "yellow", "red").concat([{ t: "path", d: starPath(150, 100, 30), answer: "green" }]),
    fact: "가운데 초록 별이 있는 아프리카 나라예요.",
  },
  {
    id: "cameroon", name: "카메룬", emoji: "🇨🇲",
    regions: vstripes("green", "red", "yellow").concat([{ t: "path", d: starPath(150, 100, 30), answer: "yellow" }]),
    fact: "가운데 노란 별! 축구를 잘하는 나라예요.",
  },
  {
    id: "ghana", name: "가나", emoji: "🇬🇭",
    regions: hstripes("red", "yellow", "green").concat([{ t: "path", d: starPath(150, 100, 28), answer: "black" }]),
    fact: "가운데 검은 별이 있는 아프리카 나라예요.",
  },
  {
    id: "myanmar", name: "미얀마", emoji: "🇲🇲",
    regions: hstripes("yellow", "green", "red").concat([{ t: "path", d: starPath(150, 100, 72), answer: "white" }]),
    fact: "커다란 하얀 별이 있는 아시아 나라예요.",
  },
  {
    id: "chile", name: "칠레", emoji: "🇨🇱",
    regions: [
      { t: "rect", x: 0, y: 0, w: 300, h: 100, answer: "white" },
      { t: "rect", x: 0, y: 100, w: 300, h: 100, answer: "red" },
      { t: "rect", x: 0, y: 0, w: 100, h: 100, answer: "blue" },
      { t: "path", d: starPath(50, 50, 30), answer: "white" },
    ],
    fact: "길고 좁게 생긴 남아메리카 나라예요.",
  },
  {
    id: "cuba", name: "쿠바", emoji: "🇨🇺",
    regions: hbands([["blue", 1], ["white", 1], ["blue", 1], ["white", 1], ["blue", 1]]).concat([
      { t: "path", d: triHoist(150), answer: "red" },
      { t: "path", d: starPath(52, 100, 26), answer: "white" },
    ]),
    fact: "빨간 삼각형에 하얀 별! 카리브해의 섬나라예요.",
  },
  {
    id: "china", name: "중국", emoji: "🇨🇳",
    regions: [
      { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "red" },
      {
        t: "path",
        d: starPath(52, 50, 30) + starPath(105, 24, 11, 20) + starPath(122, 52, 11, 45) + starPath(122, 84, 11, 70) + starPath(105, 108, 11, 20),
        answer: "yellow",
      },
    ],
    fact: "빨간 바탕에 노란 별! 판다가 사는 아주 큰 나라예요.",
  },
  {
    id: "turkey", name: "튀르키예", emoji: "🇹🇷",
    regions: [
      { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "red" },
      { t: "circle", cx: 128, cy: 100, r: 48, answer: "white" },
      { t: "circle", cx: 146, cy: 100, r: 38, answer: "red" },
      { t: "path", d: starPath(205, 100, 24, 10), answer: "white" },
    ],
    fact: "빨간 바탕에 하얀 달과 별! 아시아와 유럽 사이의 나라예요.",
  },
];
