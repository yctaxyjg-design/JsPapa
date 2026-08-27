/*
 * 국기 놀이 정답 판정 — 외부 의존성 없이 Node에서도 로드/테스트 가능.
 *
 * 음성 인식 결과(transcript)를 나라의 별칭(aliases)과 비교한다.
 * 부분 문자열(includes) 비교는 "인도네시아"가 "인도"에 걸리는 등 오판을 내므로,
 * 공백·문장부호를 제거한 뒤 '정확 일치'로만 정답을 인정한다.
 */
(function (root) {
  "use strict";

  function normalize(text) {
    return String(text).toLowerCase().replace(/[\s.,!?~'"‘’“”·-]/g, "");
  }

  // transcript가 aliases 중 하나와 정규화 후 정확히 일치하면 true
  function matches(transcript, aliases) {
    var heard = normalize(transcript);
    if (!heard) return false;
    return aliases.some(function (alias) {
      return heard === normalize(alias);
    });
  }

  var api = { normalize: normalize, matches: matches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FlagMatcher = api;
})(typeof window !== "undefined" ? window : globalThis);
