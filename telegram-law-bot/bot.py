import asyncio
import json
import logging
import os

from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
import ollama
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
MCP_URL = "https://korean-law-mcp-yangjaegwon.fly.dev/mcp"

SYSTEM_PROMPT = (
    "당신은 한국 법령 검색을 도와주는 AI 어시스턴트입니다. "
    "사용자가 법령에 대해 질문하면 제공된 도구를 사용하여 법령을 검색하고 "
    "핵심 내용을 한국어로 간결하게 답변하세요."
)


async def query_with_law_tools(user_message: str) -> str:
    async with streamablehttp_client(MCP_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools_response = await session.list_tools()
            ollama_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description or "",
                        "parameters": t.inputSchema or {},
                    },
                }
                for t in tools_response.tools
            ]

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ]

            response = ollama.chat(
                model=OLLAMA_MODEL,
                messages=messages,
                tools=ollama_tools or None,
            )

            if not response.message.tool_calls:
                return response.message.content

            # 도구 호출 처리
            messages.append(
                {
                    "role": "assistant",
                    "content": response.message.content or "",
                    "tool_calls": [
                        {
                            "id": f"call_{i}",
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": json.dumps(tc.function.arguments),
                            },
                        }
                        for i, tc in enumerate(response.message.tool_calls)
                    ],
                }
            )

            for i, tc in enumerate(response.message.tool_calls):
                result = await session.call_tool(tc.function.name, tc.function.arguments)
                result_text = "\n".join(
                    c.text for c in result.content if hasattr(c, "text")
                )
                messages.append(
                    {"role": "tool", "tool_call_id": f"call_{i}", "content": result_text}
                )

            final = ollama.chat(model=OLLAMA_MODEL, messages=messages)
            return final.message.content


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "안녕하세요! 한국 법령 검색 봇입니다 📚\n\n"
        "법령 이름이나 궁금한 내용을 입력해주세요.\n"
        "예시:\n"
        "• 지방세특례제한법 검색해줘\n"
        "• 근로기준법 연차 관련 조항 알려줘\n"
        "• 개인정보 보호법 주요 내용은?"
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_message = update.message.text
    thinking = await update.message.reply_text("검색 중... ⏳")

    try:
        reply = await query_with_law_tools(user_message)
    except Exception as e:
        logger.error(f"오류: {e}")
        reply = f"오류가 발생했습니다: {e}"

    await thinking.delete()

    # 텔레그램 메시지 4096자 제한 처리
    for chunk in [reply[i : i + 4096] for i in range(0, len(reply), 4096)]:
        await update.message.reply_text(chunk)


def main() -> None:
    if not TELEGRAM_TOKEN:
        raise ValueError("TELEGRAM_TOKEN이 없습니다. .env 파일을 확인하세요.")

    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info(f"봇 시작 — 모델: {OLLAMA_MODEL}")
    app.run_polling()


if __name__ == "__main__":
    main()
