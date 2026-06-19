#!/usr/bin/env python3
"""
단일 파일 빌드기 — kifrs_rag_standalone.py 생성

rag_ollama.py 에 corpus.json 내용을 주입해, 파일 하나만 회사 PC로 옮기면
(파이썬 + Ollama 만 있으면) 바로 RAG가 도는 self-contained 스크립트를 만든다.
표준 라이브러리만 쓰므로 pip 설치 불필요.

사용법:  python build/bundle_py.py   (kifrs/ 에서 실행)
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

src = open(os.path.join(HERE, "rag_ollama.py"), encoding="utf-8").read()
corpus = open(os.path.join(HERE, "..", "corpus.json"), encoding="utf-8").read()

# 'EMBEDDED_CORPUS = None' 한 줄을 corpus 데이터로 치환
needle = "EMBEDDED_CORPUS = None"
if needle not in src:
    raise SystemExit("rag_ollama.py 에서 EMBEDDED_CORPUS 자리표시자를 찾지 못했습니다.")
injected = f"EMBEDDED_CORPUS = {corpus.strip()}"
out_src = src.replace(needle, injected, 1)

banner = (
    "# === 자동 생성 파일 (build/bundle_py.py) — 직접 수정하지 마세요. ===\n"
    "# corpus 가 내장된 단일 실행본입니다. 파일 하나만 있으면 동작합니다.\n"
    "# 재생성: kifrs/ 에서  python build/bundle_py.py\n"
)
out_src = out_src.replace('"""\n', '"""\n' + banner, 1)

out_path = os.path.join(HERE, "..", "kifrs_rag_standalone.py")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(out_src)
print(f"생성됨: {out_path} ({len(out_src)/1024:.1f} KB)")
