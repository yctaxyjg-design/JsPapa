"""로컬 LLM 클라이언트 (OpenAI 호환 Chat Completions).

Ollama / LM Studio / llama.cpp(server) / vLLM 등 OpenAI 호환 /v1 엔드포인트면 동작한다.
API 키가 필요 없는 로컬 서버를 기본 대상으로 한다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen2.5:7b-instruct")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "ollama")  # 로컬 서버는 보통 무시함
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "120"))


class LLMError(RuntimeError):
    pass


def chat(messages: list[dict], temperature: float = 0.2) -> str:
    """OpenAI 호환 chat completions 호출 후 응답 텍스트를 반환한다."""
    url = LLM_BASE_URL.rstrip("/") + "/chat/completions"
    payload = json.dumps(
        {
            "model": LLM_MODEL,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LLM_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise LLMError(
            f"로컬 LLM 호출 실패 ({url}): {e}. 서버가 떠 있는지, "
            f"LLM_BASE_URL/LLM_MODEL 환경변수가 맞는지 확인하세요."
        ) from e

    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as e:
        raise LLMError(f"예상치 못한 LLM 응답 형식: {data}") from e
