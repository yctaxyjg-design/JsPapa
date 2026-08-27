/*
 * 팜 리젝션 상태 머신 — 외부 의존성 없이 Node에서도 로드/테스트 가능.
 *
 * 애플펜슬로 쓰는 동안 손바닥이 화면에 닿는 것(원치 않는 터치)을 걸러 낸다.
 * 규칙: 펜으로 그리는 도중이거나, 펜을 막 뗀 직후(graceMs 이내)의 '터치'는
 *       손바닥으로 보고 무시한다. 펜을 한동안 안 쓰면 손가락 입력이 다시 먹힌다.
 *
 * 시각(now)은 호출자가 pointer 이벤트의 timeStamp를 넘긴다. 펜 시각(lastPenAt)은
 * pointerdown뿐 아니라 pointermove·pointerup에서도 갱신해야, 700ms를 넘는 긴
 * 필기 직후의 손바닥 터치까지 제대로 걸러진다. (이 갱신 배선이 회귀 지점)
 */
(function (root) {
  'use strict';

  function PalmGate(graceMs) {
    this.graceMs = graceMs || 700;
    this.lastPenAt = 0;
  }

  // 새 포인터 입력을 그리기로 받아들일지 판정. true면 시작, false면 무시(팜 리젝션).
  // penActive: 지금 펜으로 그리는 중인지(호출자가 현재 스트로크 종류로 판단)
  PalmGate.prototype.shouldStart = function (pointerType, now, penActive) {
    if (pointerType === 'pen') { this.lastPenAt = now; return true; }
    if (pointerType === 'touch') {
      var recentPen = !!this.lastPenAt && (now - this.lastPenAt) < this.graceMs;
      if (penActive || recentPen) return false;
    }
    return true;
  };

  // 펜 스트로크가 진행/종료될 때 시각을 갱신 (pointermove·pointerup·pointercancel)
  PalmGate.prototype.penSeen = function (now) { this.lastPenAt = now; };

  var api = { PalmGate: PalmGate, PEN_GRACE_MS: 700 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PalmRejection = api;
})(typeof window !== 'undefined' ? window : globalThis);
