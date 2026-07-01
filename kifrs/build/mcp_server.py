#!/usr/bin/env python3
"""
KIFRS MCP 서버 — 로컬 AI가 KIFRS RAG를 '도구(tool)'로 호출하게 해주는 래퍼

Model Context Protocol(MCP) 의 stdio 전송을 표준 라이브러리만으로 구현한다.
(JSON-RPC 2.0, 줄단위 메시지) → pip 설치 불필요. rag_ollama.py 를 재사용해
Ollama(bge-m3 + qwen3)로 검색/답변한다.

노출 도구
  - kifrs_search : 질의로 관련 기준서 근거(청크)를 검색해 돌려준다(LLM 미사용).
  - kifrs_answer : 검색 + qwen3 LLM 답변까지 생성한다.

클라이언트(예: 로컬 AI/에이전트) 등록 예 (mcp.json 형태):
  {
    "mcpServers": {
      "kifrs": { "command": "python", "args": ["build/mcp_server.py"] }
    }
  }
환경변수로 모델/호스트 조정: OLLAMA_HOST, KIFRS_EMBED_MODEL, KIFRS_LLM_MODEL

수동 점검(터미널에서 JSON-RPC 한 줄씩 입력):
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
  {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
  {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"kifrs_search","arguments":{"query":"리스","top_k":3}}}
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rag_ollama as rag  # noqa: E402

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "kifrs-rag", "version": "1.0.0"}


class Args:
    """rag_ollama 함수들이 기대하는 설정 객체(런타임 인자 대체)."""
    def __init__(self):
        self.corpus = os.path.abspath(os.environ.get("KIFRS_CORPUS", rag.DEFAULT_CORPUS))
        self.index = rag.DEFAULT_INDEX
        self.cache = rag.DEFAULT_CACHE
        self.host = rag.DEFAULT_HOST
        self.embed_model = rag.DEFAULT_EMBED_MODEL
        self.llm_model = rag.DEFAULT_LLM_MODEL
        self.top_k = 5
        self.build = False
        self.retrieve_only = False


_INDEX = None
_ARGS = Args()


def get_index():
    global _INDEX
    if _INDEX is None:
        _INDEX = rag.load_or_build_index(_ARGS)
    return _INDEX


TOOLS = [
    {
        "name": "kifrs_search",
        "description": "한국채택국제회계기준(K-IFRS) 기준서에서 질의와 관련된 근거(기준서 발췌)를 벡터검색으로 찾아 반환한다. LLM은 쓰지 않으며, 호출자가 직접 답변을 생성할 때 근거로 사용한다.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "검색 질의(한국어)"},
                "top_k": {"type": "integer", "description": "반환할 근거 수(기본 5)", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "kifrs_answer",
        "description": "K-IFRS 기준서를 벡터검색한 뒤 로컬 qwen3 LLM으로 한국어 답변을 생성한다. 실무(세무조정)·수험(회계학) 관점으로 정리하고 출처 기준서 번호를 표기한다.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "질문(한국어)"},
                "top_k": {"type": "integer", "description": "검색 근거 수(기본 5)", "default": 5},
            },
            "required": ["query"],
        },
    },
]


def call_tool(name, arguments):
    query = (arguments or {}).get("query", "").strip()
    if not query:
        raise ValueError("query 가 비어 있습니다.")
    _ARGS.top_k = int((arguments or {}).get("top_k", 5))
    index = get_index()
    if name == "kifrs_search":
        _ARGS.retrieve_only = True
        _, hits = rag.answer(index, query, _ARGS)
        return rag.format_result(query, None, hits, True)
    if name == "kifrs_answer":
        _ARGS.retrieve_only = False
        reply, hits = rag.answer(index, query, _ARGS)
        return rag.format_result(query, reply, hits, False)
    raise ValueError(f"알 수 없는 도구: {name}")


# --- JSON-RPC over stdio ----------------------------------------------------
def _send(msg):
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _result(req_id, result):
    _send({"jsonrpc": "2.0", "id": req_id, "result": result})


def _error(req_id, code, message):
    _send({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


def handle(req):
    method = req.get("method")
    req_id = req.get("id")
    params = req.get("params") or {}

    # 알림(notification): id 없음 → 응답하지 않음
    if method == "notifications/initialized":
        return
    if method == "initialize":
        _result(req_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": SERVER_INFO,
        })
        return
    if method == "ping":
        _result(req_id, {})
        return
    if method == "tools/list":
        _result(req_id, {"tools": TOOLS})
        return
    if method == "tools/call":
        name = params.get("name")
        try:
            data = call_tool(name, params.get("arguments"))
            _result(req_id, {
                "content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False, indent=2)}],
                "isError": False,
            })
        except Exception as e:  # noqa: BLE001 — 도구 오류는 결과로 전달
            _result(req_id, {
                "content": [{"type": "text", "text": f"오류: {e}"}],
                "isError": True,
            })
        return
    if req_id is not None:
        _error(req_id, -32601, f"Method not found: {method}")


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            handle(req)
        except Exception as e:  # noqa: BLE001
            if isinstance(req, dict) and req.get("id") is not None:
                _error(req["id"], -32603, f"Internal error: {e}")


if __name__ == "__main__":
    main()
