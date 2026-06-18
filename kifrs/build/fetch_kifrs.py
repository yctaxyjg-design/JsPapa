#!/usr/bin/env python3
"""
KIFRS 전문(全文) corpus 보강 스크립트 (로컬 실행용)

이 저장소가 배포되는 Claude Code on the web 환경은 아웃바운드 네트워크가
정책으로 차단되어 있어, 세션 안에서는 공개 출처를 직접 수집할 수 없다.
따라서 전문 수집은 네트워크가 열린 로컬에서 이 스크립트로 수행한다.

동작:
  1) 사용자가 적법하게 확보한 KIFRS 기준서 원문(.txt/.md)을 input_dir 에서 읽는다.
     파일명 규칙: "<기준서번호>.txt"  (예: 1116.txt, 1115.txt)
  2) 각 문서를 청크(기본 800자, 120자 overlap)로 분할한다.
  3) corpus.json 의 해당 기준서에 chunks 를 붙여 corpus.full.json 으로 저장한다.

주의(저작권):
  KIFRS 기준서 전문의 저작권은 한국회계기준원(KASB)에 있다. 배포·재공개 전
  이용 약관을 반드시 확인하고, 권리가 없는 텍스트를 공개 저장소에 커밋하지 말 것.
  search.js 는 chunks 가 있으면 자동으로 전문까지 검색 대상에 포함하도록
  설계할 수 있다(현재는 색인 필드만 검색).

사용법:
  python3 build/fetch_kifrs.py --input ./raw --catalog ./corpus.json --out ./corpus.full.json
"""

import argparse
import json
import re
from pathlib import Path


def chunk_text(text: str, size: int = 800, overlap: int = 120):
    text = re.sub(r"\r\n?", "\n", text).strip()
    chunks = []
    i = 0
    n = len(text)
    while i < n:
        end = min(i + size, n)
        chunk = text[i:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= n:
            break
        i = end - overlap
    return chunks


def main():
    ap = argparse.ArgumentParser(description="KIFRS 전문 corpus 보강")
    ap.add_argument("--input", default="./raw", help="원문 텍스트 디렉터리 (<번호>.txt)")
    ap.add_argument("--catalog", default="./corpus.json", help="색인 카탈로그 corpus.json")
    ap.add_argument("--out", default="./corpus.full.json", help="출력 파일")
    ap.add_argument("--size", type=int, default=800, help="청크 크기(문자)")
    ap.add_argument("--overlap", type=int, default=120, help="청크 overlap(문자)")
    args = ap.parse_args()

    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    by_no = {s["no"]: s for s in catalog.get("standards", [])}

    input_dir = Path(args.input)
    added = 0
    if input_dir.is_dir():
        for txt in sorted(input_dir.glob("*.txt")):
            no = txt.stem
            if no not in by_no:
                print(f"  - {txt.name}: 카탈로그에 없는 기준서 번호, 건너뜀")
                continue
            chunks = chunk_text(txt.read_text(encoding="utf-8"), args.size, args.overlap)
            by_no[no]["chunks"] = chunks
            added += len(chunks)
            print(f"  + 제{no}호: {len(chunks)} chunks")
    else:
        print(f"입력 디렉터리가 없습니다: {input_dir} (원문 .txt 를 넣고 다시 실행하세요)")

    catalog["full_text_chunks"] = added
    Path(args.out).write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"완료: {args.out} (총 {added} chunks 추가)")


if __name__ == "__main__":
    main()
