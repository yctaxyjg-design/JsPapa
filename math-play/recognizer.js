/*
 * 손글씨 숫자 인식기 (0~9)
 * $P Point-Cloud Recognizer (Vatavu, Anthony & Wobbrock, ICMI 2012) 기반.
 * 점 구름(point cloud) 매칭이라 획 순서·방향에 둔감해서
 * 아이가 자유롭게 쓴 숫자도 잘 알아본다.
 */
(function (root) {
  'use strict';

  var N = 32; // 리샘플링 점 개수

  /* ---------- 기하 유틸 ---------- */

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pathLength(points) {
    var d = 0;
    for (var i = 1; i < points.length; i++) {
      if (points[i].id === points[i - 1].id) d += dist(points[i - 1], points[i]);
    }
    return d;
  }

  /* strokes: [[{x,y},...], ...] → 평탄화된 {x,y,id} 배열 */
  function flatten(strokes) {
    var pts = [];
    for (var s = 0; s < strokes.length; s++) {
      for (var i = 0; i < strokes[s].length; i++) {
        pts.push({ x: strokes[s][i].x, y: strokes[s][i].y, id: s });
      }
    }
    return pts;
  }

  function resample(points, n) {
    points = points.map(function (p) { return { x: p.x, y: p.y, id: p.id }; });
    var I = pathLength(points) / (n - 1);
    if (I <= 0) return null;
    var D = 0;
    var out = [points[0]];
    for (var i = 1; i < points.length; i++) {
      if (points[i].id === points[i - 1].id) {
        var d = dist(points[i - 1], points[i]);
        if (D + d >= I) {
          var t = (I - D) / d;
          var q = {
            x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
            y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
            id: points[i].id
          };
          out.push(q);
          points.splice(i, 0, q);
          D = 0;
        } else {
          D += d;
        }
      }
    }
    while (out.length < n) out.push(out[out.length - 1]);
    return out.slice(0, n);
  }

  function scaleToUnit(points) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(function (p) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    var size = Math.max(maxX - minX, maxY - minY);
    if (size === 0) size = 1;
    return points.map(function (p) {
      return { x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id };
    });
  }

  function translateToCentroid(points) {
    var cx = 0, cy = 0;
    points.forEach(function (p) { cx += p.x; cy += p.y; });
    cx /= points.length; cy /= points.length;
    return points.map(function (p) {
      return { x: p.x - cx, y: p.y - cy, id: p.id };
    });
  }

  function normalize(strokes) {
    var pts = flatten(strokes);
    if (pts.length < 2) return null;
    var r = resample(pts, N);
    if (!r) return null;
    return translateToCentroid(scaleToUnit(r));
  }

  /* ---------- $P 클라우드 매칭 ---------- */

  function cloudDistance(a, b, start) {
    var n = a.length;
    var matched = new Array(n);
    var sum = 0;
    var i = start;
    do {
      var min = Infinity, index = -1;
      for (var j = 0; j < n; j++) {
        if (!matched[j]) {
          var d = dist(a[i], b[j]);
          if (d < min) { min = d; index = j; }
        }
      }
      matched[index] = true;
      var weight = 1 - ((i - start + n) % n) / n;
      sum += weight * min;
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }

  function greedyCloudMatch(a, b) {
    var n = a.length;
    var step = Math.floor(Math.pow(n, 0.5));
    var min = Infinity;
    for (var i = 0; i < n; i += step) {
      var d1 = cloudDistance(a, b, i);
      var d2 = cloudDistance(b, a, i);
      min = Math.min(min, d1, d2);
    }
    return min;
  }

  /* ---------- 숫자 템플릿 (0~100 좌표계, y는 아래 방향) ---------- */

  function line(x1, y1, x2, y2, n) {
    n = n || 14;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
    }
    return pts;
  }

  function arc(cx, cy, rx, ry, a1, a2, n) {
    n = n || 24;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (a1 + (a2 - a1) * (i / (n - 1))) * Math.PI / 180;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return pts;
  }

  function join() {
    var pts = [];
    for (var i = 0; i < arguments.length; i++) pts = pts.concat(arguments[i]);
    return pts;
  }

  /* 각 항목: { digit, strokes } — 아이 필체 변형을 위해 숫자마다 여러 벌 */
  var RAW = [
    { digit: 0, strokes: [arc(50, 50, 30, 42, -90, 270, 32)] },
    { digit: 0, strokes: [arc(50, 50, 22, 40, -90, 270, 32)] },

    { digit: 1, strokes: [line(50, 8, 50, 92)] },
    { digit: 1, strokes: [join(line(36, 24, 52, 8), line(52, 8, 52, 92))] },

    { digit: 2, strokes: [join(arc(50, 27, 24, 19, -165, 15), line(72, 33, 28, 90), line(28, 90, 76, 90))] },
    { digit: 2, strokes: [join(arc(50, 25, 26, 20, -180, 0), line(76, 25, 30, 92, 18), line(30, 92, 78, 92))] },

    { digit: 3, strokes: [join(arc(48, 29, 22, 21, -140, 80), arc(50, 71, 24, 23, -80, 130))] },
    { digit: 3, strokes: [join(arc(48, 28, 24, 20, -160, 90), arc(48, 70, 26, 22, -90, 150))] },

    { digit: 4, strokes: [join(line(58, 10, 28, 60), line(28, 60, 80, 60)), line(64, 32, 64, 94)] },
    { digit: 4, strokes: [join(line(34, 10, 32, 52), line(32, 52, 76, 52)), line(64, 10, 64, 94)] },

    { digit: 5, strokes: [join(line(70, 10, 34, 10), line(34, 10, 31, 44), arc(51, 64, 25, 25, -115, 125))] },
    { digit: 5, strokes: [join(line(34, 10, 31, 44), arc(51, 64, 25, 25, -115, 125)), line(34, 10, 72, 10)] },

    {
      digit: 6, strokes: [[
        { x: 72, y: 10 }, { x: 58, y: 15 }, { x: 44, y: 26 }, { x: 34, y: 42 },
        { x: 28, y: 58 }, { x: 29, y: 74 }, { x: 38, y: 87 }, { x: 52, y: 91 },
        { x: 64, y: 85 }, { x: 69, y: 73 }, { x: 65, y: 61 }, { x: 53, y: 55 },
        { x: 40, y: 58 }, { x: 31, y: 67 }
      ]]
    },
    { digit: 6, strokes: [join(arc(58, 46, 34, 40, -100, -190, 16), arc(50, 70, 22, 21, 170, 500, 24))] },

    { digit: 7, strokes: [join(line(26, 12, 76, 12), line(76, 12, 42, 92))] },
    { digit: 7, strokes: [join(line(24, 16, 74, 10), line(74, 10, 48, 92))] },

    {
      digit: 8, strokes: [[
        { x: 50, y: 10 }, { x: 34, y: 15 }, { x: 29, y: 28 }, { x: 37, y: 40 },
        { x: 50, y: 47 }, { x: 63, y: 55 }, { x: 69, y: 68 }, { x: 63, y: 83 },
        { x: 50, y: 89 }, { x: 37, y: 83 }, { x: 31, y: 68 }, { x: 37, y: 55 },
        { x: 50, y: 47 }, { x: 63, y: 40 }, { x: 71, y: 28 }, { x: 66, y: 15 },
        { x: 50, y: 10 }
      ]]
    },
    { digit: 8, strokes: [join(arc(50, 29, 20, 20, -90, 270, 22), arc(50, 70, 23, 22, -90, 270, 22))] },

    { digit: 9, strokes: [join(arc(50, 30, 21, 22, -20, 340, 24), line(70, 38, 62, 92))] },
    { digit: 9, strokes: [join(arc(48, 28, 22, 20, 0, 360, 24), line(70, 30, 66, 90))] }
  ];

  var TEMPLATES = RAW.map(function (t) {
    return { digit: t.digit, points: normalize(t.strokes) };
  });

  /* ---------- 공개 API ---------- */

  /**
   * strokes: [[{x,y},...], ...]
   * @returns {digit, distance, ranking} 또는 null (잉크가 없거나 너무 짧을 때)
   */
  function recognize(strokes) {
    if (!strokes || !strokes.length) return null;
    var candidate = normalize(strokes);
    if (!candidate) return null;

    var scores = {};
    for (var i = 0; i < TEMPLATES.length; i++) {
      var t = TEMPLATES[i];
      var d = greedyCloudMatch(candidate, t.points);
      if (scores[t.digit] === undefined || d < scores[t.digit]) scores[t.digit] = d;
    }
    var ranking = Object.keys(scores)
      .map(function (k) { return { digit: +k, distance: scores[k] }; })
      .sort(function (a, b) { return a.distance - b.distance; });

    return { digit: ranking[0].digit, distance: ranking[0].distance, ranking: ranking };
  }

  var api = { recognize: recognize, _raw: RAW, _normalize: normalize };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DigitRecognizer = api;
})(typeof window !== 'undefined' ? window : globalThis);
