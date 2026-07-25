// 색칠 국기 데이터 — 6세용
// 팔레트는 7색만 사용하고, 국기 색도 이 7색으로 단순화해 "정답 색"과 정확히 맞도록 했다.
// 좌표계: 모든 국기 viewBox "0 0 300 200" (3:2)로 통일.
// regions: 배경을 먼저, 그 위에 올라가는 도형(동그라미·십자)을 뒤에 둔다(그리는 순서 = 위아래).

const PALETTE = [
  { key: "red",    color: "#e23b3b", label: "빨강" },
  { key: "orange", color: "#f0912a", label: "주황" },
  { key: "yellow", color: "#ffd23f", label: "노랑" },
  { key: "green",  color: "#35b56a", label: "초록" },
  { key: "blue",   color: "#2f6fd6", label: "파랑" },
  { key: "white",  color: "#ffffff", label: "하양" },
  { key: "black",  color: "#33373d", label: "검정" },
];

// 세로 삼색기 한 줄 폭 = 100, 가로 삼색기 한 줄 높이 ≈ 66.67
function vstripes(a, b, c) {
  return [
    { t: "rect", x: 0,   y: 0, w: 100, h: 200, answer: a },
    { t: "rect", x: 100, y: 0, w: 100, h: 200, answer: b },
    { t: "rect", x: 200, y: 0, w: 100, h: 200, answer: c },
  ];
}
function hstripes(a, b, c) {
  return [
    { t: "rect", x: 0, y: 0,      w: 300, h: 66.67, answer: a },
    { t: "rect", x: 0, y: 66.67,  w: 300, h: 66.66, answer: b },
    { t: "rect", x: 0, y: 133.33, w: 300, h: 66.67, answer: c },
  ];
}

const FLAGS = [
  {
    id: "france", name: "프랑스", emoji: "🇫🇷",
    regions: vstripes("blue", "white", "red"),
    fact: "파랑·하양·빨강을 나란히! 뾰족한 에펠탑이 있는 나라예요.",
  },
  {
    id: "italy", name: "이탈리아", emoji: "🇮🇹",
    regions: vstripes("green", "white", "red"),
    fact: "초록·하양·빨강! 피자와 파스타가 태어난 나라예요.",
  },
  {
    id: "ireland", name: "아일랜드", emoji: "🇮🇪",
    regions: vstripes("green", "white", "orange"),
    fact: "초록·하양·주황! 초록 들판이 아주 넓은 나라예요.",
  },
  {
    id: "belgium", name: "벨기에", emoji: "🇧🇪",
    regions: vstripes("black", "yellow", "red"),
    fact: "검정·노랑·빨강! 맛있는 초콜릿과 감자튀김의 나라예요.",
  },
  {
    id: "nigeria", name: "나이지리아", emoji: "🇳🇬",
    regions: vstripes("green", "white", "green"),
    fact: "초록·하양·초록! 아프리카에서 사람이 가장 많은 나라예요.",
  },
  {
    id: "germany", name: "독일", emoji: "🇩🇪",
    regions: hstripes("black", "red", "yellow"),
    fact: "검정·빨강·노랑을 위아래로! 자동차를 아주 잘 만들어요.",
  },
  {
    id: "netherlands", name: "네덜란드", emoji: "🇳🇱",
    regions: hstripes("red", "white", "blue"),
    fact: "빨강·하양·파랑을 위아래로! 풍차와 튤립의 나라예요.",
  },
  {
    id: "japan", name: "일본", emoji: "🇯🇵",
    regions: [
      { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "white" },
      { t: "circle", cx: 150, cy: 100, r: 58, answer: "red" },
    ],
    fact: "하얀 바탕에 빨간 동그라미! 우리나라 옆 섬나라예요.",
  },
  {
    id: "sweden", name: "스웨덴", emoji: "🇸🇪",
    regions: [
      { t: "rect", x: 0, y: 0, w: 300, h: 200, answer: "blue" },
      { t: "path", d: "M88 0 H123 V82 H300 V118 H123 V200 H88 V118 H0 V82 H88 Z", answer: "yellow" },
    ],
    fact: "파란 바탕에 노란 십자! 북쪽의 눈이 많이 오는 나라예요.",
  },
];
