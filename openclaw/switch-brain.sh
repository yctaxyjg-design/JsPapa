#!/usr/bin/env bash
# OpenClaw 로컬 두뇌 교체 스크립트 — 맥미니 M4 Pro 48GB 최적화 프리셋
#
# 사용법:  ./switch-brain.sh <preset>
#   qwen-moe    Qwen3.6-35B-A3B  (MoE, 속도·품질 균형 — 기본 추천)
#   qwen-dense  Qwen3.6-27B      (dense, 품질 최우선)
#   gpt-oss     GPT-OSS-20B      (경량, 리즈닝/에이전트 강점)
#   gemma       Gemma 4 27B      (한국어·다국어 강점)
#   devstral    Devstral-Small-2-24B (툴콜링 프로덕션 검증)
#
# 동작: LM Studio CLI(lms)가 있으면 MLX 모델을, 없으면 Ollama로 모델을 받은 뒤
#       ~/.openclaw/openclaw.json 의 provider/기본 모델을 교체한다.
set -euo pipefail

PRESET="${1:-qwen-moe}"
CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"

case "$PRESET" in
  qwen-moe)
    LMS_QUERY="mlx-community/Qwen3.6-35B-A3B-4bit"
    OLLAMA_TAG="qwen3.6:35b-a3b"
    MODEL_ID_LMS="qwen3.6-35b-a3b" MODEL_NAME="Qwen3.6 35B A3B" CTX=131072 REASONING=false ;;
  qwen-dense)
    LMS_QUERY="mlx-community/Qwen3.6-27B-4bit"
    OLLAMA_TAG="qwen3.6:27b"
    MODEL_ID_LMS="qwen3.6-27b" MODEL_NAME="Qwen3.6 27B dense" CTX=131072 REASONING=false ;;
  gpt-oss)
    LMS_QUERY="openai/gpt-oss-20b"
    OLLAMA_TAG="gpt-oss:20b"
    MODEL_ID_LMS="openai/gpt-oss-20b" MODEL_NAME="GPT-OSS 20B" CTX=131072 REASONING=true ;;
  gemma)
    LMS_QUERY="mlx-community/gemma-4-27b-it-4bit"
    OLLAMA_TAG="gemma4:27b"
    MODEL_ID_LMS="gemma-4-27b-it" MODEL_NAME="Gemma 4 27B" CTX=131072 REASONING=false ;;
  devstral)
    LMS_QUERY="mistralai/devstral-small-2"
    OLLAMA_TAG="devstral:24b"
    MODEL_ID_LMS="devstral-small-2" MODEL_NAME="Devstral Small 2 24B" CTX=98304 REASONING=false ;;
  *)
    echo "알 수 없는 프리셋: $PRESET  (qwen-moe|qwen-dense|gpt-oss|gemma|devstral)" >&2
    exit 1 ;;
esac

# ── 1. 백엔드 선택 및 모델 다운로드 ──────────────────────────────
if command -v lms >/dev/null 2>&1; then
  BACKEND="lmstudio"
  echo "▶ LM Studio(MLX)로 모델 다운로드: $LMS_QUERY"
  lms get "$LMS_QUERY" --yes || {
    echo "!! 정확한 이름 매칭 실패 — LM Studio 앱에서 '$MODEL_NAME' MLX 버전을 검색해 받으세요." >&2
    exit 1
  }
  MODEL_ID="$MODEL_ID_LMS"
  BASE_URL="http://127.0.0.1:1234/v1"
  echo "▶ LM Studio 서버 시작(이미 켜져 있으면 무시): lms server start"
  lms server start >/dev/null 2>&1 || true
elif command -v ollama >/dev/null 2>&1; then
  BACKEND="ollama"
  echo "▶ Ollama로 모델 다운로드: $OLLAMA_TAG"
  ollama pull "$OLLAMA_TAG" || {
    echo "!! 태그가 없을 수 있습니다. 'ollama search ${OLLAMA_TAG%%:*}' 로 정확한 태그를 확인하세요." >&2
    exit 1
  }
  MODEL_ID="$OLLAMA_TAG"
  # 주의: OpenClaw + Ollama 조합은 /v1(OpenAI 호환)이 아닌 네이티브 URL을 써야 툴콜링이 동작
  BASE_URL="http://127.0.0.1:11434"
  echo "▶ 컨텍스트 확장을 위해 다음을 셸 프로필에 추가하세요: export OLLAMA_CONTEXT_LENGTH=$CTX"
else
  echo "!! lms(LM Studio CLI)도 ollama도 없습니다. 둘 중 하나를 먼저 설치하세요." >&2
  echo "   LM Studio: https://lmstudio.ai  /  Ollama: https://ollama.com" >&2
  exit 1
fi

# ── 2. openclaw.json 갱신 (백업 후 병합) ─────────────────────────
mkdir -p "$(dirname "$CONFIG")"
[ -f "$CONFIG" ] && cp "$CONFIG" "$CONFIG.bak-$(date +%Y%m%d%H%M%S)"

BACKEND="$BACKEND" MODEL_ID="$MODEL_ID" MODEL_NAME="$MODEL_NAME" \
BASE_URL="$BASE_URL" CTX="$CTX" REASONING="$REASONING" CONFIG="$CONFIG" \
node <<'EOF'
const fs = require('fs');
const { BACKEND, MODEL_ID, MODEL_NAME, BASE_URL, CTX, REASONING, CONFIG } = process.env;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}

cfg.models ??= {};
cfg.models.providers ??= {};
const provider = cfg.models.providers[BACKEND] ??= {};
provider.baseUrl = BASE_URL;
provider.apiKey ??= BACKEND === 'ollama' ? 'ollama-local' : 'lm-studio';
if (BACKEND === 'lmstudio') provider.api = 'openai-completions';

const entry = {
  id: MODEL_ID,
  name: MODEL_NAME,
  contextWindow: Number(CTX),
  maxTokens: 8192,
  reasoning: REASONING === 'true',
};
provider.models = (provider.models ?? []).filter(m => m.id !== MODEL_ID).concat(entry);

cfg.agents ??= {};
cfg.agents.defaults ??= {};
cfg.agents.defaults.model ??= {};
cfg.agents.defaults.model.primary = `${BACKEND}/${MODEL_ID}`;

fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
console.log(`✔ ${CONFIG} 갱신 완료 → 기본 모델: ${BACKEND}/${MODEL_ID} (context ${CTX})`);
EOF

# ── 3. 마무리 안내 ───────────────────────────────────────────────
echo
echo "✔ 교체 완료. 게이트웨이를 재시작하세요:  openclaw gateway restart"
echo "  (속도가 답답하면 GPU 메모리 한도 상향: sudo sysctl iogpu.wired_limit_mb=40960)"
