#!/usr/bin/env python3
"""
# === 자동 생성 파일 (build/bundle_py.py) — 직접 수정하지 마세요. ===
# corpus 가 내장된 단일 실행본입니다. 파일 하나만 있으면 동작합니다.
# 재생성: kifrs/ 에서  python build/bundle_py.py
KIFRS RAG 브리지 — 로컬 Ollama(bge-m3 임베딩 + qwen3 LLM) 연동

목적
  corpus.json(기준서 색인) 또는 corpus.full.json(전문 청크)을 bge-m3로 임베딩해
  로컬 벡터 검색을 수행하고, 검색된 근거를 qwen3 LLM에 주입해 한국어로 답한다.
  실무(세무조정)·수험(회계학) 맥락에 맞춘 시스템 프롬프트를 사용한다.

설계 원칙
  - 외부 의존성 없음: 표준 라이브러리(urllib)만 사용 → pip 설치 불필요.
    잠긴 회사 PC에서도 `python rag_ollama.py` 만으로 동작.
  - 전부 로컬·오프라인: Ollama( http://localhost:11434 )에만 접속, 외부 전송 없음.
  - 임베딩 캐시: 같은 텍스트는 재임베딩하지 않도록 사이드카 파일에 저장.
  - 경로 하드코딩 금지: --corpus 인자(기본값은 스크립트 옆 ../corpus.json).

사용 예
  # 색인 빌드(최초 1회 또는 corpus 변경 시)
  python rag_ollama.py --build

  # 단발 질의
  python rag_ollama.py --ask "리스 사용권자산 최초측정은 어떻게 하나?"

  # 대화형
  python rag_ollama.py

  # 검색만(LLM 없이 근거만 보기)
  python rag_ollama.py --retrieve-only --ask "이연법인세 일시적차이"

Ollama API 참고
  - 임베딩: POST /api/embed   {"model","input"}    → {"embeddings":[[...]]}
            (구버전 폴백) /api/embeddings {"model","prompt"} → {"embedding":[...]}
  - 채팅:   POST /api/chat    {"model","messages","stream":false}
"""

import argparse
import hashlib
import json
import math
import os
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CORPUS = os.path.join(HERE, "..", "corpus.json")
DEFAULT_INDEX = os.path.join(HERE, ".kifrs_index.json")        # 임베딩 색인
DEFAULT_CACHE = os.path.join(HERE, ".kifrs_embed_cache.json")  # 텍스트→벡터 캐시

DEFAULT_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_EMBED_MODEL = os.environ.get("KIFRS_EMBED_MODEL", "bge-m3:latest")
DEFAULT_LLM_MODEL = os.environ.get("KIFRS_LLM_MODEL", "qwen3.6:35b-a3b")

# 단일 파일(standalone) 빌드 시 corpus.json 내용이 여기에 주입된다.
# 값이 있으면 corpus 파일이 없어도 이 데이터로 동작한다(파일 하나만 옮기면 됨).
EMBEDDED_CORPUS = {
  "version": "2026-06-18",
  "license": "카탈로그(기준서 번호·국문 제목·대응 IFRS·요약·키워드)는 공개 사실 정보를 바탕으로 작성한 색인입니다. 기준서 전문(全文)은 저작권이 한국회계기준원에 있으므로 본 저장소에 포함하지 않습니다. 전문 검색이 필요하면 build/fetch_kifrs.py 안내에 따라 적법하게 확보한 원문을 더하세요.",
  "source": "한국채택국제회계기준(K-IFRS) 기업회계기준서 — 한국회계기준원(KASB) 공표 기준서 체계",
  "standards": [
    { "no": "1001", "ifrs": "IAS 1", "title": "재무제표 표시", "category": "재무제표 표시·공시", "summary": "재무제표의 작성과 표시에 대한 전반적 요구사항, 구조, 최소 내용을 규정한다. 계속기업, 발생기준, 중요성과 통합표시, 상계금지, 비교정보, 표시의 계속성 등 일반사항과 재무상태표·포괄손익계산서·자본변동표·주석의 표시방법을 다룬다.", "keywords": ["재무제표", "재무상태표", "포괄손익계산서", "자본변동표", "주석", "계속기업", "비교정보", "유동·비유동 구분", "중요성"] },
    { "no": "1002", "ifrs": "IAS 2", "title": "재고자산", "category": "자산", "summary": "재고자산의 취득원가 결정, 비용으로 인식하는 방법, 순실현가능가치로의 감액을 규정한다. 매입원가·전환원가·기타원가의 범위, 선입선출법과 가중평균법 등 단위원가 결정방법, 저가법 평가를 다룬다.", "keywords": ["재고자산", "취득원가", "순실현가능가치", "저가법", "선입선출법", "가중평균법", "전환원가", "평가손실"] },
    { "no": "1007", "ifrs": "IAS 7", "title": "현금흐름표", "category": "재무제표 표시·공시", "summary": "현금및현금성자산의 변동을 영업·투자·재무활동으로 구분하여 보고하는 현금흐름표의 작성을 규정한다. 직접법과 간접법, 이자·배당금·법인세 현금흐름의 분류를 다룬다.", "keywords": ["현금흐름표", "영업활동", "투자활동", "재무활동", "직접법", "간접법", "현금성자산"] },
    { "no": "1008", "ifrs": "IAS 8", "title": "회계정책, 회계추정치 변경과 오류", "category": "재무제표 표시·공시", "summary": "회계정책의 선택과 적용, 회계정책 변경·회계추정치 변경·오류수정의 회계처리와 공시를 규정한다. 회계정책 변경과 오류수정은 소급적용·소급재작성, 추정치 변경은 전진적용한다.", "keywords": ["회계정책", "회계추정치 변경", "오류수정", "소급적용", "소급재작성", "전진적용"] },
    { "no": "1010", "ifrs": "IAS 10", "title": "보고기간후사건", "category": "재무제표 표시·공시", "summary": "보고기간말과 재무제표 발행승인일 사이에 발생한 사건의 회계처리를 규정한다. 수정을 요하는 사건과 수정을 요하지 않는 사건을 구분하고 배당·계속기업 관련 처리를 다룬다.", "keywords": ["보고기간후사건", "수정을 요하는 사건", "발행승인일", "배당", "계속기업"] },
    { "no": "1012", "ifrs": "IAS 12", "title": "법인세", "category": "부채·비용", "summary": "당기법인세와 이연법인세의 회계처리를 규정한다. 자산·부채의 세무기준액과 장부금액 차이인 일시적차이(가산할·차감할)에 따라 이연법인세부채·자산을 인식하고, 이연법인세자산은 실현가능성(미래 과세소득) 범위에서 인식한다. 최초인식 예외, 제정·실질제정 세율 측정, 할인 금지, 당기손익·기타포괄손익·자본 대응 인식, 상계와 표시를 다룬다.", "keywords": ["법인세", "이연법인세", "일시적차이", "가산할 일시적차이", "차감할 일시적차이", "세무기준액", "이연법인세자산", "이연법인세부채", "실현가능성", "이월결손금", "최초인식 예외", "당기법인세", "유보"], "chunks": [
      "목적과 범위: 거래·사건의 당기 및 미래 법인세효과를 회계처리한다. 보고기간의 당기법인세와, 자산·부채의 장부금액 회수·결제에서 생길 미래 법인세효과(이연법인세)를 모두 다룬다.",
      "당기법인세: 당기 및 과거기간의 당기법인세 중 미납액은 부채로, 과납액은 자산으로 인식한다. 아직 사용하지 않은 세무상 결손금을 소급공제해 환급받을 수 있는 효익은 자산으로 인식한다.",
      "세무기준액: 자산의 세무기준액은 미래에 과세대상 효익에서 세무상 공제될 금액이고, 부채의 세무기준액은 장부금액에서 미래에 세무상 공제될 금액을 뺀 값이다. 장부금액과 세무기준액의 차이가 일시적차이다.",
      "일시적차이: 가산할 일시적차이(미래 과세소득을 늘림 → 이연법인세부채)와 차감할 일시적차이(미래 과세소득을 줄임 → 이연법인세자산)로 구분한다. 한국 세무조정의 '유보'가 이 일시적차이에 대응한다.",
      "이연법인세부채 인식: 원칙적으로 모든 가산할 일시적차이에 대해 인식한다. 다만 영업권의 최초인식, 그리고 사업결합이 아니면서 거래 당시 회계이익과 과세소득에 영향을 주지 않는 자산·부채의 최초인식에서 생기는 차이는 제외한다.",
      "이연법인세자산 인식: 차감할 일시적차이·미사용 세무상결손금·미사용 세액공제는, 이를 활용할 수 있는 미래 과세소득의 발생 가능성이 높은(probable) 범위에서 이연법인세자산으로 인식한다. 매 보고기간말 회수가능성을 재검토한다.",
      "최초인식 예외: 사업결합이 아니고 거래 시점에 회계이익과 과세소득(세무상결손금) 어느 쪽에도 영향을 미치지 않는 거래에서 자산·부채를 최초인식할 때 생기는 일시적차이에는 이연법인세를 인식하지 않는다.",
      "측정: 이연법인세 자산·부채는 보고기간말까지 제정되었거나 실질적으로 제정된 세율로, 자산의 회수·부채의 결제가 예상되는 방식을 반영해 측정한다. 이연법인세 자산·부채는 할인하지 않는다.",
      "대응 인식: 법인세효과는 관련 거래·사건이 인식된 곳을 따라간다. 당기손익에 인식된 항목은 당기손익으로, 기타포괄손익이나 자본에 직접 인식된 항목(예: 재평가잉여금, 확정급여 재측정요소)은 같은 곳에 법인세효과를 인식한다.",
      "표시·상계: 당기법인세 자산·부채는 법적 상계권리와 순액결제 의도가 있을 때 상계한다. 이연법인세 자산·부채는 동일 과세당국 요건 충족 시 상계하며, 재무상태표에서 비유동으로 분류한다.",
      "투자 관련 일시적차이: 종속기업·지점·관계기업·공동약정 투자와 관련된 일시적차이는, 소멸시기를 통제할 수 있고 예측가능한 미래에 소멸하지 않을 것으로 예상되면 이연법인세부채를 인식하지 않는 등 별도 요건을 둔다."
    ] },
    { "no": "1016", "ifrs": "IAS 16", "title": "유형자산", "category": "자산", "summary": "유형자산의 인식, 취득원가 측정, 후속측정(원가모형·재평가모형), 감가상각, 제거를 규정한다. 감가상각방법, 내용연수, 잔존가치, 재평가잉여금을 다룬다.", "keywords": ["유형자산", "감가상각", "원가모형", "재평가모형", "내용연수", "잔존가치", "재평가잉여금", "취득원가"] },
    { "no": "1019", "ifrs": "IAS 19", "title": "종업원급여", "category": "부채·비용", "summary": "단기종업원급여, 퇴직급여(확정기여제도·확정급여제도), 기타장기종업원급여, 해고급여의 회계처리를 규정한다. 예측단위적립방식에 따른 확정급여채무 측정, 순확정급여부채(자산), 근무원가·순이자·재측정요소(보험수리적손익) 구분, 자산인식상한, 과거근무원가, 정산을 다룬다.", "keywords": ["종업원급여", "퇴직급여", "확정급여제도", "확정기여제도", "보험수리적손익", "순확정급여부채", "예측단위적립방식", "근무원가", "과거근무원가", "순이자", "재측정요소", "기타포괄손익", "자산인식상한", "해고급여", "단기종업원급여"], "chunks": [
      "범위와 분류: 종업원급여를 ① 단기종업원급여, ② 퇴직급여, ③ 기타장기종업원급여, ④ 해고급여로 구분해 각각의 인식·측정을 규정한다.",
      "단기종업원급여: 종업원이 근무용역을 제공한 연차보고기간 말 이후 12개월 이내에 전부 결제될 것으로 예상되는 급여(임금·사회보장분담금·유급휴가·이익분배·상여 등). 할인하지 않은 금액으로 비용과 부채로 인식한다. 유급휴가는 누적·비누적으로 구분한다.",
      "퇴직급여제도의 구분: 확정기여제도(DC)는 기업이 고정 기여금만 납부하고 추가의무가 없으며, 확정급여제도(DB)는 약정한 급여를 지급할 의무를 기업이 부담한다. 위험 부담 주체에 따라 분류가 갈린다.",
      "확정기여제도: 해당 기간에 납부할 기여금을 비용(또는 자산)으로 인식한다. 보험수리적위험·투자위험을 종업원이 부담하므로 추가 측정이 단순하다.",
      "확정급여채무 측정: 예측단위적립방식(projected unit credit method)으로 종업원이 당기와 과거에 제공한 근무용역에 귀속되는 급여를 추정하고, 인구통계적·재무적 보험수리적 가정을 사용해 현재가치로 할인한다. 할인율은 우량회사채(또는 국공채) 시장수익률을 사용한다.",
      "순확정급여부채(자산): 확정급여채무의 현재가치에서 사외적립자산의 공정가치를 차감해 산정하며, 초과적립이면 자산인식상한을 적용한다.",
      "당기손익 인식 구성요소: 근무원가(당기근무원가, 과거근무원가, 정산손익)와 순확정급여부채(자산)에 대한 순이자를 당기손익으로 인식한다. 순이자는 기초 순확정급여부채에 할인율을 적용해 계산한다.",
      "재측정요소(기타포괄손익): 보험수리적손익, 사외적립자산의 수익 중 순이자에 포함된 금액을 제외한 부분, 자산인식상한 효과의 변동은 기타포괄손익(OCI)으로 인식하며, 후속기간에 당기손익으로 재분류하지 않는다(이익잉여금 내 대체는 가능).",
      "과거근무원가와 정산: 제도의 개정이나 축소로 생기는 과거근무원가는 발생 시점에 즉시 당기손익으로 인식한다. 정산이 일어나면 정산손익을 당기손익으로 인식한다.",
      "자산인식상한(asset ceiling): 초과적립으로 생긴 확정급여자산은 제도에서 환급받거나 미래 기여금을 절감하여 얻을 수 있는 경제적효익의 현재가치를 한도로 인식한다.",
      "기타장기종업원급여: 장기근속휴가·안식년 등 12개월 이후 결제되는 급여로, 측정은 확정급여와 유사하나 재측정요소를 기타포괄손익이 아닌 당기손익으로 인식한다.",
      "해고급여: 기업이 해고 제안을 더 이상 철회할 수 없게 된 때와 관련 구조조정원가를 인식하는 때 중 이른 날에 비용과 부채로 인식한다."
    ] },
    { "no": "1020", "ifrs": "IAS 20", "title": "정부보조금의 회계처리와 정부지원의 공시", "category": "자산", "summary": "정부보조금의 인식과 표시, 정부지원의 공시를 규정한다. 수익관련보조금과 자산관련보조금의 처리, 이연수익법과 자산차감법을 다룬다.", "keywords": ["정부보조금", "정부지원", "수익관련보조금", "자산관련보조금", "이연수익", "자산차감법"] },
    { "no": "1021", "ifrs": "IAS 21", "title": "환율변동효과", "category": "기타", "summary": "외화거래와 해외사업장의 재무제표 환산을 규정한다. 기능통화와 표시통화, 화폐성·비화폐성항목의 환산, 외환차이의 인식, 해외사업장순투자를 다룬다.", "keywords": ["환율변동", "기능통화", "표시통화", "외화환산", "외환차이", "해외사업장", "화폐성항목"] },
    { "no": "1023", "ifrs": "IAS 23", "title": "차입원가", "category": "부채·비용", "summary": "적격자산의 취득·건설·생산과 직접 관련된 차입원가의 자본화를 규정한다. 자본화 대상·기간, 자본화이자율, 자본화 중단을 다룬다.", "keywords": ["차입원가", "자본화", "적격자산", "자본화이자율", "이자비용"] },
    { "no": "1024", "ifrs": "IAS 24", "title": "특수관계자 공시", "category": "재무제표 표시·공시", "summary": "특수관계자와의 거래, 약정, 채권·채무 잔액에 관한 공시를 규정한다. 특수관계자의 범위, 주요 경영진에 대한 보상 공시를 다룬다.", "keywords": ["특수관계자", "특수관계자거래", "주요 경영진 보상", "지배기업", "공시"] },
    { "no": "1027", "ifrs": "IAS 27", "title": "별도재무제표", "category": "연결·관계기업", "summary": "지배기업·공동기업 참여자·관계기업 투자자가 별도재무제표를 작성할 때 종속기업·공동기업·관계기업 투자의 회계처리와 공시를 규정한다.", "keywords": ["별도재무제표", "종속기업 투자", "원가법", "지분법", "공정가치"] },
    { "no": "1028", "ifrs": "IAS 28", "title": "관계기업과 공동기업에 대한 투자", "category": "연결·관계기업", "summary": "관계기업과 공동기업에 대한 투자의 회계처리로 지분법 적용을 규정한다. 유의적 영향력, 지분법 적용·중단, 손상을 다룬다.", "keywords": ["관계기업", "공동기업", "지분법", "유의적 영향력", "투자손상"] },
    { "no": "1029", "ifrs": "IAS 29", "title": "초인플레이션 경제에서의 재무보고", "category": "기타", "summary": "초인플레이션 경제의 기능통화로 작성하는 재무제표를 보고기간말 현재 측정단위로 재작성하는 방법을 규정한다.", "keywords": ["초인플레이션", "측정단위", "재작성", "일반물가지수"] },
    { "no": "1032", "ifrs": "IAS 32", "title": "금융상품: 표시", "category": "금융상품", "summary": "금융상품의 금융부채·지분상품 분류, 관련 이자·배당·손익의 표시, 금융자산과 금융부채의 상계를 규정한다.", "keywords": ["금융상품", "금융부채", "지분상품", "상계", "복합금융상품", "자기주식"] },
    { "no": "1033", "ifrs": "IAS 33", "title": "주당이익", "category": "재무제표 표시·공시", "summary": "주당이익의 산정과 표시를 규정한다. 기본주당이익과 희석주당이익, 가중평균유통보통주식수, 잠재적보통주를 다룬다.", "keywords": ["주당이익", "기본주당이익", "희석주당이익", "가중평균유통보통주식수", "잠재적보통주"] },
    { "no": "1034", "ifrs": "IAS 34", "title": "중간재무보고", "category": "재무제표 표시·공시", "summary": "중간재무보고서의 최소 내용과 인식·측정 원칙을 규정한다. 중간기간 회계처리, 계절성, 비교표시 대상기간을 다룬다.", "keywords": ["중간재무보고", "중간재무제표", "계절성", "비교표시"] },
    { "no": "1036", "ifrs": "IAS 36", "title": "자산손상", "category": "자산", "summary": "자산의 장부금액이 회수가능액을 초과하지 않도록 손상차손을 인식하는 방법을 규정한다. 회수가능액(순공정가치와 사용가치), 현금창출단위, 영업권 손상검사, 손상차손환입을 다룬다.", "keywords": ["자산손상", "손상차손", "회수가능액", "사용가치", "현금창출단위", "영업권 손상", "손상차손환입"] },
    { "no": "1037", "ifrs": "IAS 37", "title": "충당부채, 우발부채, 우발자산", "category": "부채·비용", "summary": "충당부채의 인식·측정과 우발부채·우발자산의 공시를 규정한다. 현재의무, 자원유출 가능성, 최선의 추정치, 손실부담계약, 구조조정충당부채를 다룬다.", "keywords": ["충당부채", "우발부채", "우발자산", "현재의무", "손실부담계약", "구조조정충당부채", "최선의 추정치"] },
    { "no": "1038", "ifrs": "IAS 38", "title": "무형자산", "category": "자산", "summary": "무형자산의 인식, 취득원가 측정, 후속측정, 상각을 규정한다. 식별가능성, 내부창출 무형자산(연구·개발), 내용연수가 비한정인 무형자산을 다룬다.", "keywords": ["무형자산", "식별가능성", "연구개발", "개발비", "상각", "비한정 내용연수", "영업권 제외"] },
    { "no": "1040", "ifrs": "IAS 40", "title": "투자부동산", "category": "자산", "summary": "임대수익이나 시세차익을 위해 보유하는 투자부동산의 인식·측정·공시를 규정한다. 원가모형과 공정가치모형, 계정대체를 다룬다.", "keywords": ["투자부동산", "공정가치모형", "원가모형", "임대수익", "계정대체"] },
    { "no": "1041", "ifrs": "IAS 41", "title": "농림어업", "category": "자산", "summary": "농림어업활동과 관련된 생물자산과 수확물의 회계처리를 규정한다. 공정가치에서 처분부대원가를 차감한 금액으로 측정한다.", "keywords": ["농림어업", "생물자산", "수확물", "공정가치", "처분부대원가"] },
    { "no": "1101", "ifrs": "IFRS 1", "title": "한국채택국제회계기준의 최초채택", "category": "기타", "summary": "K-IFRS를 최초로 채택하는 기업의 최초 재무제표 작성을 규정한다. 개시 재무상태표, 소급적용 원칙과 면제·예외규정을 다룬다.", "keywords": ["최초채택", "개시 재무상태표", "전환일", "소급적용 면제", "최초 재무제표"] },
    { "no": "1102", "ifrs": "IFRS 2", "title": "주식기준보상", "category": "부채·비용", "summary": "주식결제형·현금결제형 주식기준보상거래의 회계처리를 규정한다. 부여일 공정가치, 가득조건, 보상원가 인식을 다룬다.", "keywords": ["주식기준보상", "주식결제형", "현금결제형", "주식선택권", "가득조건", "부여일 공정가치"] },
    { "no": "1103", "ifrs": "IFRS 3", "title": "사업결합", "category": "연결·관계기업", "summary": "취득법에 따른 사업결합의 회계처리를 규정한다. 취득자 식별, 취득일, 식별가능한 자산·부채의 공정가치 측정, 영업권과 염가매수차익을 다룬다.", "keywords": ["사업결합", "취득법", "영업권", "염가매수차익", "취득일", "비지배지분", "공정가치"] },
    { "no": "1105", "ifrs": "IFRS 5", "title": "매각예정비유동자산과 중단영업", "category": "자산", "summary": "매각예정으로 분류되는 비유동자산(처분자산집단)의 측정·표시와 중단영업의 표시를 규정한다. 순공정가치, 감가상각 중단을 다룬다.", "keywords": ["매각예정", "비유동자산", "처분자산집단", "중단영업", "순공정가치"] },
    { "no": "1106", "ifrs": "IFRS 6", "title": "광물자원의 탐사와 평가", "category": "자산", "summary": "광물자원의 탐사·평가 지출의 인식과 측정, 탐사·평가자산의 손상을 규정한다.", "keywords": ["광물자원", "탐사평가자산", "탐사", "평가", "손상"] },
    { "no": "1107", "ifrs": "IFRS 7", "title": "금융상품: 공시", "category": "금융상품", "summary": "금융상품이 재무상태와 성과에 미치는 영향, 노출되는 위험과 위험관리에 관한 공시를 규정한다. 신용위험·유동성위험·시장위험을 다룬다.", "keywords": ["금융상품 공시", "신용위험", "유동성위험", "시장위험", "위험관리", "공정가치 서열체계"] },
    { "no": "1108", "ifrs": "IFRS 8", "title": "영업부문", "category": "재무제표 표시·공시", "summary": "영업부문 정보의 공시를 규정한다. 경영진접근법, 보고부문 식별, 부문 손익·자산 공시를 다룬다.", "keywords": ["영업부문", "보고부문", "경영진접근법", "부문 공시", "최고영업의사결정자"] },
    { "no": "1109", "ifrs": "IFRS 9", "title": "금융상품", "category": "금융상품", "summary": "금융자산·금융부채의 분류와 측정, 기대신용손실에 따른 손상, 위험회피회계를 규정한다. 사업모형과 계약상 현금흐름 특성(원리금만으로 구성, SPPI)에 따라 상각후원가·FVOCI·FVPL로 분류하고, 신용위험 변동에 따른 12개월·전체기간 기대신용손실(3단계)을 인식한다. 지분상품 FVOCI 선택, 금융부채 자기신용위험, 제거, 위험회피회계를 다룬다.", "keywords": ["금융상품", "금융자산 분류", "사업모형", "원리금 지급", "SPPI", "상각후원가", "FVOCI", "FVPL", "공정가치옵션", "기대신용손실", "신용위험 유의적 증가", "12개월·전체기간", "자기신용위험", "위험회피회계", "현금흐름위험회피"], "chunks": [
      "구성: 제1109호는 ① 금융자산·금융부채의 분류와 측정, ② 기대신용손실에 따른 손상, ③ 위험회피회계의 세 영역을 규정한다.",
      "금융자산 분류 기준: 금융자산은 ① 금융자산을 관리하는 사업모형과 ② 계약상 현금흐름의 특성(특정일에 원금과 원금잔액 이자만으로 구성되는지, SPPI 검정)에 따라 상각후원가(AC), 기타포괄손익-공정가치(FVOCI), 당기손익-공정가치(FVPL)로 분류한다.",
      "상각후원가(AC) 측정: 계약상 현금흐름 수취 목적의 사업모형이고 SPPI를 충족하는 채무상품은 상각후원가로 측정하며, 유효이자율법으로 이자수익을 인식한다.",
      "기타포괄손익-공정가치(FVOCI, 채무상품): 계약상 현금흐름 수취와 매도가 모두 목적인 사업모형이고 SPPI를 충족하면 FVOCI로 분류한다. 평가손익은 기타포괄손익으로 인식하되 처분 시 당기손익으로 재분류하고, 이자수익·손상차손·외환손익은 당기손익으로 인식한다.",
      "지분상품 FVOCI 선택: 단기매매목적이 아닌 지분상품은 최초인식 시 평가손익을 기타포괄손익으로 표시하도록 취소 불가능하게 선택할 수 있다. 이 경우 평가손익은 처분해도 당기손익으로 재분류하지 않으며(자본 내 대체 가능), 배당금은 당기손익으로 인식한다.",
      "당기손익-공정가치(FVPL): AC·FVOCI 요건을 충족하지 못하는 금융자산은 FVPL로 측정해 평가손익을 당기손익으로 인식한다. 회계불일치를 제거·유의적으로 줄이는 경우 최초인식 시 FVPL로 지정하는 공정가치옵션을 적용할 수 있다.",
      "금융부채 분류·측정: 금융부채는 원칙적으로 상각후원가로 측정한다. FVPL로 지정한 금융부채는 자기신용위험 변동에 따른 공정가치 변동분을 기타포괄손익으로, 나머지는 당기손익으로 인식한다.",
      "손상 — 기대신용손실(ECL): 발생손실이 아닌 기대신용손실 모형을 적용한다. 최초인식 후 신용위험이 유의적으로 증가하지 않았으면 12개월 기대신용손실을, 유의적으로 증가했으면 전체기간 기대신용손실을 손실충당금으로 인식한다(일반적 3단계 접근법).",
      "손상 간편법: 유의적 금융요소가 없는 매출채권·계약자산 등에는 항상 전체기간 기대신용손실을 인식하는 간편법을 적용한다.",
      "제거: 금융자산은 현금흐름에 대한 계약상 권리가 소멸하거나, 양도하면서 위험과 보상의 대부분을 이전(또는 통제 이전)한 때 제거한다.",
      "위험회피회계: 위험회피대상항목과 위험회피수단을 지정하고 문서화하며, 공정가치위험회피·현금흐름위험회피·해외사업장순투자 위험회피로 구분한다. 경제적 관계 등 위험회피효과 요건을 충족하면 손익 인식시점의 불일치를 줄이도록 회계처리한다."
    ] },
    { "no": "1110", "ifrs": "IFRS 10", "title": "연결재무제표", "category": "연결·관계기업", "summary": "지배력에 근거한 연결재무제표의 작성과 표시를 규정한다. 지배력의 정의(힘·변동이익·연관), 연결절차, 비지배지분을 다룬다.", "keywords": ["연결재무제표", "지배력", "종속기업", "비지배지분", "연결절차", "투자기업"] },
    { "no": "1111", "ifrs": "IFRS 11", "title": "공동약정", "category": "연결·관계기업", "summary": "공동약정의 분류(공동영업·공동기업)와 회계처리를 규정한다. 공동지배력, 공동영업자의 자산·부채 인식을 다룬다.", "keywords": ["공동약정", "공동영업", "공동기업", "공동지배력", "지분법"] },
    { "no": "1112", "ifrs": "IFRS 12", "title": "타 기업에 대한 지분의 공시", "category": "재무제표 표시·공시", "summary": "종속기업·공동약정·관계기업·구조화기업에 대한 지분 공시를 규정한다. 지분의 성격과 위험, 재무적 영향 공시를 다룬다.", "keywords": ["지분 공시", "구조화기업", "종속기업", "관계기업", "비지배지분 공시"] },
    { "no": "1113", "ifrs": "IFRS 13", "title": "공정가치 측정", "category": "기타", "summary": "공정가치의 정의와 측정 체계, 공시를 규정한다. 측정일의 질서있는 거래 가격, 평가기법, 공정가치 서열체계(수준1~3)를 다룬다.", "keywords": ["공정가치", "공정가치 서열체계", "수준1", "수준2", "수준3", "평가기법", "질서있는 거래"] },
    { "no": "1114", "ifrs": "IFRS 14", "title": "규제이연계정", "category": "기타", "summary": "최초채택기업이 요금규제활동에서 생긴 규제이연계정 잔액을 종전 회계처리에 따라 계속 인식할 수 있도록 규정한다.", "keywords": ["규제이연계정", "요금규제활동", "최초채택"] },
    { "no": "1115", "ifrs": "IFRS 15", "title": "고객과의 계약에서 생기는 수익", "category": "수익", "summary": "고객과의 계약에서 생기는 수익의 인식을 규정한다. 통제 이전을 기준으로 5단계 모형(계약 식별, 수행의무 식별, 거래가격 산정, 거래가격 배분, 수행의무 이행 시 수익인식)을 적용한다. 변동대가와 추정의 제약, 유의적 금융요소, 개별 판매가격 배분, 한 시점·기간에 걸친 이행, 계약변경, 본인 대 대리인, 라이선스, 보증, 계약자산·계약부채를 다룬다.", "keywords": ["수익인식", "5단계 모형", "수행의무", "거래가격", "통제 이전", "변동대가", "변동대가 제약", "유의적 금융요소", "개별 판매가격", "진행률", "한 시점·기간에 걸쳐 인식", "계약변경", "본인 대리인", "라이선스", "보증", "계약자산", "계약부채"], "chunks": [
      "1단계 계약의 식별: ① 당사자들이 계약을 승인하고 의무 수행을 확약, ② 이전할 재화·용역에 대한 각 당사자의 권리 식별 가능, ③ 지급조건 식별 가능, ④ 상업적 실질 존재, ⑤ 대가의 회수가능성이 높음 — 5개 기준을 모두 충족할 때 계약으로 본다. 둘 이상의 계약을 하나로 결합하거나, 계약변경을 별도로 처리하는 규정도 둔다.",
      "2단계 수행의무의 식별: 계약 개시시점에 고객에게 이전하기로 한 '구별되는(distinct)' 재화나 용역(또는 그 묶음)을 각각 수행의무로 식별한다. 구별 기준은 ① 그 자체로 또는 쉽게 구할 수 있는 자원과 함께 효익을 얻을 수 있고, ② 계약 내에서 별도로 식별 가능할 것이다.",
      "3단계 거래가격의 산정: 기업이 재화·용역 이전 대가로 받을 권리를 갖게 될 것으로 예상하는 금액(제3자를 대신해 회수하는 금액 제외). 변동대가, 변동대가 추정의 제약, 유의적 금융요소, 비현금대가, 고객에게 지급할 대가를 모두 고려한다.",
      "변동대가: 할인·리베이트·환불·공제·인센티브·성과보너스·반품권 등으로 대가가 변동될 수 있으면 '기댓값' 또는 '가장 가능성이 높은 금액' 중 더 잘 예측하는 방법으로 추정한다. 반품권이 있는 판매는 환불부채와 반환제품 회수권(자산)을 인식한다.",
      "변동대가 추정의 제약(constraint): 추정한 변동대가는, 관련 불확실성이 해소될 때 이미 인식한 누적 수익금액의 유의적인 부분이 환원되지 않을 가능성이 매우 높은(highly probable) 정도까지만 거래가격에 포함한다. 즉 변동분을 무조건 전액 인식하지 않는다.",
      "유의적 금융요소: 약속한 대가의 지급시기와 통제 이전시기 사이에 유의적 금융효익이 제공되면 화폐의 시간가치를 반영한다. 수익은 현금판매가격 상당액으로 인식하고, 차액은 이자수익(또는 이자비용)으로 구분 인식한다. 이전과 지급 간격이 1년 이내일 것으로 예상되면 조정하지 않는 실무적 간편법이 있다.",
      "4단계 거래가격의 배분: 각 수행의무의 개별 판매가격(stand-alone selling price) 비율로 거래가격을 배분한다. 개별 판매가격을 직접 관측할 수 없으면 시장평가 조정 접근법, 예상원가에 이윤을 가산하는 접근법, 잔여접근법으로 추정한다. 할인이나 변동대가가 특정 수행의무에만 관련되면 그 의무에 배분한다.",
      "5단계 수행의무의 이행 — 기간에 걸쳐 인식: 다음 중 하나를 충족하면 진행률에 따라 기간에 걸쳐 수익을 인식한다. ① 고객이 기업의 수행에서 생기는 효익을 동시에 얻고 소비, ② 기업이 만들거나 향상시키는 자산을 고객이 통제, ③ 기업이 만든 자산이 대체용도가 없고 이미 수행 완료한 부분에 대해 집행가능한 지급청구권이 있음. 진행률은 산출법 또는 투입법으로 측정한다.",
      "5단계 수행의무의 이행 — 한 시점에 인식: 기간 기준을 충족하지 못하면 통제가 이전되는 한 시점에 인식한다. 통제 이전 지표는 기업의 현재 지급청구권, 고객의 법적 소유권, 물리적 점유 이전, 소유에 따른 유의적 위험과 보상의 이전, 고객의 인수다.",
      "계약변경: 변경으로 추가된 재화·용역이 구별되고 그 가격이 개별 판매가격을 반영하면 '별도 계약'으로 처리한다. 그렇지 않으면 기존 계약을 종료하고 새 계약을 체결한 것처럼 전진적으로 처리하거나, 단일 수행의무의 일부인 경우 누적효과를 일괄 조정한다.",
      "본인 대 대리인: 재화·용역이 고객에게 이전되기 전에 기업이 이를 통제하면 본인으로서 총액(gross)으로 수익을 인식하고, 단지 제3자가 제공하도록 주선만 하면 대리인으로서 순액(수수료, net)으로 인식한다.",
      "보증: 고객이 별도로 구매할 수 있는 보증이나 합의된 규격 충족 이상의 용역을 제공하는 '용역유형 보증'은 별도의 수행의무로 보아 거래가격을 배분한다. 단순히 규격 충족을 확신시키는 '확신유형 보증'은 충당부채(제1037호)로 처리한다.",
      "라이선스: 기업의 지적재산에 '접근'할 권리(라이선스 기간에 걸쳐 변화하는 지적재산에 접근)는 기간에 걸쳐, 부여시점의 지적재산을 '사용'할 권리는 한 시점에 인식한다. 판매기준·사용기준 로열티는 후속 판매·사용이 일어날 때(또는 수행의무 이행 시) 인식한다.",
      "계약자산·계약부채·수취채권: 기업이 먼저 이행했으나 대가가 시간 경과 외 조건에 달려 있으면 계약자산, 고객이 먼저 지급(또는 지급기일 도래)했으면 계약부채(선수수익)로 표시한다. 대가에 대한 무조건적 권리는 수취채권으로 인식한다.",
      "표시·공시: 고객과의 계약에서 생긴 수익을 다른 원천과 구분 공시하고, 계약잔액·수행의무·유의적 판단(진행률 측정, 변동대가 추정 등)을 공시한다. 계약체결 증분원가와 계약이행원가는 요건 충족 시 자산으로 인식해 상각한다."
    ] },
    { "no": "1116", "ifrs": "IFRS 16", "title": "리스", "category": "자산", "summary": "리스의 인식·측정·표시·공시를 규정한다. 리스이용자는 단일모형으로 사용권자산과 리스부채를 인식하고, 리스제공자는 금융리스·운용리스로 분류한다. 리스의 식별, 리스부채·사용권자산 최초·후속측정, 할인율(내재이자율·증분차입이자율), 리스변경 재측정, 단기·소액 인식면제, 판매후리스를 다룬다.", "keywords": ["리스", "사용권자산", "리스부채", "리스이용자", "리스제공자", "금융리스", "운용리스", "단기리스", "소액 기초자산", "내재이자율", "증분차입이자율", "리스료", "리스변경", "판매후리스", "리스 식별"], "chunks": [
      "리스의 식별: 계약이 리스인지 여부는 ① 식별되는 자산이 있고, ② 그 자산의 사용을 통제할 권리(사용기간 전체에 걸쳐 사용을 지시할 권리 + 효익의 대부분을 얻을 권리)가 대가와 교환되어 이전되는지로 판단한다.",
      "리스이용자 인식(단일모형): 리스개시일에 사용권자산과 리스부채를 인식한다. 과거의 운용리스/금융리스 이원 분류를 없애고, 인식면제(단기·소액) 외에는 모든 리스를 재무상태표에 계상한다.",
      "리스부채 최초측정: 리스개시일에 지급되지 않은 리스료를 리스의 내재이자율(쉽게 산정할 수 없으면 리스이용자의 증분차입이자율)로 할인한 현재가치로 측정한다. 리스료에는 고정리스료, 지수·요율에 따른 변동리스료, 잔존가치보증 예상지급액, 매수선택권 행사가격(행사가 상당히 확실한 경우), 종료선택권 위약금이 포함된다.",
      "사용권자산 최초측정: 리스부채 최초측정액에 ① 리스개시일 이전에 지급한 리스료, ② 리스개설직접원가, ③ 자산 해체·복구원가 추정치를 더하고, 받은 리스인센티브를 차감한 원가로 측정한다.",
      "후속측정: 사용권자산은 원가모형(감가상각 + 손상, 제1036호)으로 측정한다(요건 충족 시 재평가·공정가치모형 가능). 리스부채는 유효이자율법으로 이자를 가산하고 지급 리스료를 차감하며, 리스료를 이자부분과 원금부분으로 나눈다.",
      "리스변경·재측정: 지수·요율 변동, 잔존가치보증 변동, 선택권 평가 변경 등이 생기면 수정 할인율 또는 기존 할인율로 리스부채를 재측정하고 사용권자산을 조정한다. 범위 확대 + 독립가격 상당 대가 증가인 변경은 별도 리스로 처리한다.",
      "인식면제: 단기리스(리스기간 12개월 이하, 매수선택권 없음)와 소액 기초자산 리스는 사용권자산·리스부채를 인식하지 않고, 리스료를 리스기간에 걸쳐 정액 등 체계적 기준으로 비용 인식할 수 있다.",
      "리스제공자: 기초자산 소유에 따른 위험과 보상의 대부분을 이전하면 금융리스, 그렇지 않으면 운용리스로 분류한다. 금융리스는 리스순투자를 인식하고 이자수익을 배분하며, 운용리스는 자산을 계속 인식하고 리스료를 정액 등으로 수익 인식한다.",
      "판매후리스(sale and leaseback): 자산 이전이 제1115호상 '판매'에 해당하는지 먼저 판단한다. 판매에 해당하면 판매자-리스이용자는 계속 보유하는 사용권에 해당하는 장부금액만 남기고, 이전된 권리에 대한 차손익만 인식한다.",
      "표시·공시: 사용권자산과 리스부채를 구분 표시(또는 주석 공시)하고, 손익에서는 감가상각비와 이자비용을 구분한다. 리스부채 만기분석, 변동리스료·단기·소액 리스 비용 등을 공시한다."
    ] },
    { "no": "1117", "ifrs": "IFRS 17", "title": "보험계약", "category": "기타", "summary": "보험계약의 인식·측정·표시·공시를 규정한다. 일반모형(BBA), 보험료배분접근법(PAA), 보험계약마진(CSM), 이행현금흐름을 다룬다.", "keywords": ["보험계약", "일반모형", "보험료배분접근법", "보험계약마진", "CSM", "이행현금흐름"] }
  ]
}

SYSTEM_PROMPT = (
    "당신은 한국채택국제회계기준(K-IFRS) 전문 보좌역이다. "
    "아래 [근거]로 제공된 기준서 발췌만을 사실 출처로 삼아 한국어로 답하라. "
    "실무(세무조정)와 수험(회계학) 양쪽 관점에서 유용하게 정리하되, "
    "근거에 없는 내용은 추측하지 말고 '근거 부족'이라고 밝혀라. "
    "답변 끝에 사용한 기준서 번호(예: 제1116호)를 출처로 표기하라."
)


# --- HTTP (stdlib) ----------------------------------------------------------
def _post_json(url, payload, timeout=120):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def embed_texts(texts, host, model):
    """텍스트 리스트 → 임베딩 리스트. /api/embed 우선, 실패 시 /api/embeddings 폴백."""
    # 1) 신형 일괄 엔드포인트
    try:
        out = _post_json(f"{host}/api/embed", {"model": model, "input": texts})
        if "embeddings" in out:
            return out["embeddings"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    except urllib.error.URLError:
        raise
    # 2) 구형 단건 엔드포인트
    vecs = []
    for t in texts:
        out = _post_json(f"{host}/api/embeddings", {"model": model, "prompt": t})
        vecs.append(out["embedding"])
    return vecs


def chat(messages, host, model, timeout=600):
    out = _post_json(
        f"{host}/api/chat",
        {"model": model, "messages": messages, "stream": False},
        timeout=timeout,
    )
    return out["message"]["content"]


# --- 벡터 연산 (pure python) -------------------------------------------------
def cosine(a, b):
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0 or nb == 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


# --- corpus → 문서(document) -------------------------------------------------
def load_documents(corpus_path):
    """corpus.json/corpus.full.json 을 검색 단위 문서 리스트로 변환.

    각 기준서에 chunks(전문 청크)가 있으면 청크마다 문서를 만들고,
    없으면 색인 요약(제목+요약+키워드)을 한 문서로 만든다.
    """
    if os.path.exists(corpus_path):
        with open(corpus_path, encoding="utf-8") as f:
            data = json.load(f)
    elif EMBEDDED_CORPUS is not None:
        data = EMBEDDED_CORPUS  # 단일 파일 모드: 내장 corpus 사용
    else:
        raise FileNotFoundError(
            f"corpus 를 찾을 수 없습니다: {corpus_path}\n"
            "  → --corpus 로 경로를 지정하거나, 내장형 단일 파일(kifrs_rag_standalone.py)을 쓰세요."
        )
    docs = []
    for s in data.get("standards", []):
        head = f"제{s['no']}호 {s['title']} ({s.get('ifrs','')})"
        chunks = s.get("chunks")
        if chunks:
            for i, ch in enumerate(chunks):
                docs.append({
                    "id": f"{s['no']}#chunk{i}",
                    "no": s["no"],
                    "title": s["title"],
                    "ifrs": s.get("ifrs", ""),
                    "text": f"{head}\n{ch}",
                })
        else:
            kws = " ".join(s.get("keywords", []))
            body = f"{head}\n분류: {s.get('category','')}\n{s.get('summary','')}\n핵심어: {kws}"
            docs.append({
                "id": s["no"],
                "no": s["no"],
                "title": s["title"],
                "ifrs": s.get("ifrs", ""),
                "text": body,
            })
    return data, docs


# --- 임베딩 캐시 -------------------------------------------------------------
def _load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def _save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


def _key(model, text):
    return hashlib.sha256(f"{model}\n{text}".encode("utf-8")).hexdigest()


def build_index(corpus_path, index_path, cache_path, host, embed_model, verbose=True):
    data, docs = load_documents(corpus_path)
    cache = _load_json(cache_path, {})
    to_embed, to_embed_idx = [], []
    for i, d in enumerate(docs):
        k = _key(embed_model, d["text"])
        if k in cache:
            d["vec"] = cache[k]
        else:
            to_embed.append(d["text"])
            to_embed_idx.append(i)

    if to_embed:
        if verbose:
            print(f"임베딩 {len(to_embed)}건 요청 (모델 {embed_model})…", file=sys.stderr)
        vecs = embed_texts(to_embed, host, embed_model)
        for i, v in zip(to_embed_idx, vecs):
            docs[i]["vec"] = v
            cache[_key(embed_model, docs[i]["text"])] = v
        _save_json(cache_path, cache)

    index = {
        "embed_model": embed_model,
        "corpus_version": data.get("version", ""),
        "docs": [{k: d[k] for k in ("id", "no", "title", "ifrs", "text", "vec")} for d in docs],
    }
    _save_json(index_path, index)
    if verbose:
        print(f"색인 완료: {len(docs)}개 문서 → {index_path}", file=sys.stderr)
    return index


def load_or_build_index(args):
    if os.path.exists(args.index) and not args.build:
        idx = _load_json(args.index, None)
        if idx and idx.get("embed_model") == args.embed_model:
            return idx
    return build_index(
        args.corpus, args.index, args.cache, args.host, args.embed_model
    )


# --- 검색 + 생성 -------------------------------------------------------------
def retrieve(index, query, host, embed_model, top_k):
    qvec = embed_texts([query], host, embed_model)[0]
    scored = [(cosine(qvec, d["vec"]), d) for d in index["docs"]]
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:top_k]


def build_context(hits):
    blocks = []
    for score, d in hits:
        blocks.append(f"[근거 | 제{d['no']}호 {d['title']} | 유사도 {score:.3f}]\n{d['text']}")
    return "\n\n".join(blocks)


def format_result(query, reply, hits, retrieve_only):
    """다른 프로그램/로컬 AI가 그대로 파싱할 수 있는 구조화 출력."""
    result = {
        "query": query,
        "retrieve_only": bool(retrieve_only),
        "sources": [f"제{d['no']}호" for _, d in hits],
        "hits": [
            {
                "id": d["id"],
                "no": d["no"],
                "title": d["title"],
                "ifrs": d["ifrs"],
                "score": round(score, 4),
                "text": d["text"],
            }
            for score, d in hits
        ],
    }
    # 검색 전용이면 reply 는 context 문자열이므로 answer 키를 비운다.
    result["answer"] = None if retrieve_only else reply
    return result


def answer(index, query, args):
    hits = retrieve(index, query, args.host, args.embed_model, args.top_k)
    context = build_context(hits)
    if args.retrieve_only:
        return context, hits
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"[근거]\n{context}\n\n[질문]\n{query}"},
    ]
    reply = chat(messages, args.host, args.llm_model)
    return reply, hits


# --- CLI --------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="KIFRS RAG 브리지 (Ollama bge-m3 + qwen3)")
    ap.add_argument("--corpus", default=DEFAULT_CORPUS, help="corpus.json 경로(기본: 스크립트 옆 ../corpus.json)")
    ap.add_argument("--index", default=DEFAULT_INDEX, help="임베딩 색인 파일 경로")
    ap.add_argument("--cache", default=DEFAULT_CACHE, help="임베딩 캐시 파일 경로")
    ap.add_argument("--host", default=DEFAULT_HOST, help="Ollama 호스트")
    ap.add_argument("--embed-model", default=DEFAULT_EMBED_MODEL)
    ap.add_argument("--llm-model", default=DEFAULT_LLM_MODEL)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--build", action="store_true", help="색인을 강제로 다시 빌드")
    ap.add_argument("--ask", help="단발 질의")
    ap.add_argument("--retrieve-only", action="store_true", help="LLM 없이 검색 근거만 출력")
    ap.add_argument("--json", action="store_true", help="결과를 JSON으로 출력(다른 프로그램/AI 연동용)")
    ap.add_argument("--batch", help="질문이 줄단위로 든 파일 경로('-'면 표준입력). JSON 배열로 일괄 출력")
    ap.add_argument("--selftest", action="store_true", help="Ollama 연결/모델 점검")
    args = ap.parse_args()
    args.corpus = os.path.abspath(args.corpus)

    if args.selftest:
        return selftest(args)

    try:
        index = load_or_build_index(args)
    except urllib.error.URLError as e:
        print(f"[오류] Ollama 접속 실패({args.host}): {e}\n  → 'ollama serve' 실행 여부와 --host 를 확인하세요.", file=sys.stderr)
        return 2

    if args.batch:
        src = sys.stdin if args.batch == "-" else open(args.batch, encoding="utf-8")
        questions = [ln.strip() for ln in src if ln.strip()]
        if src is not sys.stdin:
            src.close()
        results = []
        for q in questions:
            reply, hits = answer(index, q, args)
            results.append(format_result(q, reply, hits, args.retrieve_only))
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return 0

    if args.build and not args.ask:
        return 0

    if args.ask:
        reply, hits = answer(index, args.ask, args)
        if args.json:
            print(json.dumps(format_result(args.ask, reply, hits, args.retrieve_only), ensure_ascii=False, indent=2))
        else:
            print(reply)
            print("\n— 사용 근거:", ", ".join(f"제{d['no']}호" for _, d in hits), file=sys.stderr)
        return 0

    # 대화형
    print("KIFRS RAG (Ollama). 질문을 입력하세요. 종료: 빈 줄 또는 Ctrl-C", file=sys.stderr)
    while True:
        try:
            q = input("\n질문> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not q:
            break
        try:
            reply, hits = answer(index, q, args)
        except urllib.error.URLError as e:
            print(f"[오류] Ollama 접속 실패: {e}", file=sys.stderr)
            continue
        print("\n" + reply)
        print("— 근거:", ", ".join(f"제{d['no']}호" for _, d in hits), file=sys.stderr)
    return 0


def selftest(args):
    print(f"Ollama 호스트: {args.host}")
    try:
        v = embed_texts(["테스트"], args.host, args.embed_model)[0]
        print(f"  임베딩 OK — {args.embed_model}, 차원 {len(v)}")
    except Exception as e:  # noqa: BLE001
        print(f"  임베딩 실패 — {args.embed_model}: {e}")
        return 2
    try:
        r = chat([{"role": "user", "content": "한 단어로 답해: 안녕?"}], args.host, args.llm_model, timeout=120)
        print(f"  LLM OK — {args.llm_model}: {r[:40].strip()}…")
    except Exception as e:  # noqa: BLE001
        print(f"  LLM 실패 — {args.llm_model}: {e}")
        return 2
    print("자가점검 통과.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
