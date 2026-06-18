"""K-IFRS 텔레그램 봇 — 로컬 LLM(RAG) 기반.

환경변수:
    TELEGRAM_BOT_TOKEN  (필수)  BotFather에서 발급
    LLM_BASE_URL        로컬 LLM OpenAI 호환 엔드포인트 (기본: Ollama)
    LLM_MODEL           모델 이름 (기본: qwen2.5:7b-instruct)

실행:
    python bot.py
"""

from __future__ import annotations

import asyncio
import logging
import os

from telegram import Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from answer import answer_question
from rag import search_kifrs

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("kifrs-bot")

WELCOME = (
    "📚 *K-IFRS 어시스턴트* (로컬 AI)\n\n"
    "한국채택국제회계기준에 대해 자연어로 질문하세요.\n"
    "근거 문단을 함께 인용해 답변합니다.\n\n"
    "예) `재고자산 중 비정상적으로 낭비된 부분은 어떻게 회계처리하나요?`\n\n"
    "명령어\n"
    "• `/search <검색어>` — 근거 문단만 검색\n"
    "• `/help` — 도움말"
)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME, parse_mode=ParseMode.MARKDOWN)


async def search_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = " ".join(context.args).strip()
    if not query:
        await update.message.reply_text("사용법: `/search 재고자산 감모손실`", parse_mode=ParseMode.MARKDOWN)
        return
    results = search_kifrs(query, k=5, section="본문")
    if not results:
        await update.message.reply_text("관련 문단을 찾지 못했습니다.")
        return
    lines = [f"🔎 *'{query}'* 검색 결과\n"]
    for r in results:
        lines.append(f"*{r['citation']}* — {r['title']}\n{r['text']}\n")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)


async def on_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = (update.message.text or "").strip()
    if not query:
        return
    await context.bot.send_chat_action(update.effective_chat.id, ChatAction.TYPING)
    logger.info("Q: %s", query)
    # 동기 함수(검색+LLM)는 스레드풀에서 실행해 이벤트 루프를 막지 않음
    result = await asyncio.to_thread(answer_question, query)

    text = result["answer"]
    if result["sources"]:
        cites = ", ".join(sorted({s["citation"] for s in result["sources"]}))
        text += f"\n\n— 참고 문단: {cites}"
    # 텔레그램 메시지 길이 제한(4096) 대응
    for chunk in _split(text, 4000):
        await update.message.reply_text(chunk)


def _split(text: str, size: int):
    for i in range(0, len(text), size):
        yield text[i : i + size]


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME, parse_mode=ParseMode.MARKDOWN)


def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit(
            "TELEGRAM_BOT_TOKEN 환경변수가 필요합니다. BotFather에서 토큰을 발급받아 설정하세요."
        )
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("search", search_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_message))
    logger.info("K-IFRS 봇 시작 (polling). LLM=%s", os.environ.get("LLM_MODEL", "qwen2.5:7b-instruct"))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
