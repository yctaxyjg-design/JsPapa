#!/usr/bin/env bash
# OpenClaw 이미지 분석(비전) 능력 추가 스크립트 — 맥미니 M4 Pro 48GB용
#
# 대화용 모델(Qwen3.6-35B-A3B 등)은 그대로 두고, 이미지가 첨부될 때만
# 비전 모델(imageModel)이 처리하도록 설정한다.
#
# 사용법:
#   ./add-vision.sh              # Qwen3-VL 30B-A3B (기본 — 한글 OCR/스크린샷 분석 강함)
#   ./add-vision.sh small        # Qwen3-VL 8B (가벼움 — 메모리 여유 확보용)
set -euo pipefail

PRESET="${1:-default}"
CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"

case "$PRESET" in
  default)
    LMS_QUERY="mlx-community/Qwen3-VL-30B-A3B-Instruct-4bit"
    OLLAMA_TAG="qwen3-vl:30b"
    MODEL_ID_LMS="qwen3-vl-30b-a3b" MODEL_NAME="Qwen3-VL 30B A3B (비전)" CTX=65536 ;;
  small)
    LMS_QUERY="mlx-community/Qwen3-VL-8B-Instruct-4bit"
    OLLAMA_TAG="qwen3-vl:8b"
    MODEL_ID_LMS="qwen3-vl-8b" MODEL_NAME="Qwen3-VL 8B (비전, 경량)" CTX=65536 ;;
  *)
    echo "알 수 없는 프리셋: $PRESET  (default|small)" >&2; exit 1 ;;
esac

# ── 1. 비전 모델 다운로드 ────────────────────────────────────────
if command -v lms >/dev/null 2>&1; then
  BACKEND="lmstudio"
  echo "▶ LM Studio(MLX)로 비전 모델 다운로드: $LMS_QUERY"
  lms get "$LMS_QUERY" --yes || {
    echo "!! 정확한 이름 매칭 실패 — LM Studio 앱에서 'Qwen3-VL' MLX 버전을 검색해 받으세요." >&2
    exit 1
  }
  MODEL_ID="$MODEL_ID_LMS"
elif command -v ollama >/dev/null 2>&1; then
  BACKEND="ollama"
  echo "▶ Ollama로 비전 모델 다운로드: $OLLAMA_TAG"
  ollama pull "$OLLAMA_TAG" || {
    echo "!! 태그가 없을 수 있습니다. 'ollama search qwen3-vl' 로 정확한 태그를 확인하세요." >&2
    exit 1
  }
  MODEL_ID="$OLLAMA_TAG"
else
  echo "!! lms(LM Studio CLI)도 ollama도 없습니다. switch-brain.sh 를 먼저 실행하세요." >&2
  exit 1
fi

# ── 2. openclaw.json 갱신: 모델 등록(input에 image 포함) + imageModel 지정 ──
mkdir -p "$(dirname "$CONFIG")"
[ -f "$CONFIG" ] && cp "$CONFIG" "$CONFIG.bak-$(date +%Y%m%d%H%M%S)"

BACKEND="$BACKEND" MODEL_ID="$MODEL_ID" MODEL_NAME="$MODEL_NAME" CTX="$CTX" CONFIG="$CONFIG" \
node <<'EOF'
const fs = require('fs');
const { BACKEND, MODEL_ID, MODEL_NAME, CTX, CONFIG } = process.env;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}

cfg.models ??= {};
cfg.models.providers ??= {};
const provider = cfg.models.providers[BACKEND] ??= {};
provider.baseUrl ??= BACKEND === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1';
provider.apiKey ??= BACKEND === 'ollama' ? 'ollama-local' : 'lm-studio';
if (BACKEND === 'lmstudio') provider.api ??= 'openai-completions';

const entry = {
  id: MODEL_ID,
  name: MODEL_NAME,
  contextWindow: Number(CTX),
  maxTokens: 8192,
  reasoning: false,
  input: ['text', 'image'],   // 이미지 첨부를 이 모델로 주입
};
provider.models = (provider.models ?? []).filter(m => m.id !== MODEL_ID).concat(entry);

cfg.agents ??= {};
cfg.agents.defaults ??= {};
cfg.agents.defaults.imageModel ??= {};
cfg.agents.defaults.imageModel.primary = `${BACKEND}/${MODEL_ID}`;

fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
console.log(`✔ ${CONFIG} 갱신 완료 → 이미지 분석 모델: ${BACKEND}/${MODEL_ID}`);
console.log(`  (대화용 기본 모델은 그대로: ${cfg.agents?.defaults?.model?.primary ?? '(미설정)'})`);
EOF

# ── 3. 마무리 안내 ───────────────────────────────────────────────
echo
echo "✔ 비전 능력 추가 완료. 게이트웨이를 재시작하세요:  openclaw gateway restart"
echo "  이제 아이폰 스크린샷 등을 보내면 오픈클로가 이미지를 직접 읽습니다."
echo "  메모리 팁: 대화모델(~20GB) + 비전모델 동시 로드가 부담되면 './add-vision.sh small' 로 교체"
