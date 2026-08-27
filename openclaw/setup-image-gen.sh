#!/usr/bin/env bash
# OpenClaw 이미지 생성 셋업 스크립트 — ComfyUI + comfy 스킬 (맥 애플 실리콘용)
#
# 사용법:
#   ./setup-image-gen.sh                    # ComfyUI 설치 + SDXL 기본 모델 + OpenClaw 연동
#   ./setup-image-gen.sh --no-model        # 모델 다운로드 생략 (Civitai 모델만 쓸 때)
#   ./setup-image-gen.sh --civitai <버전ID> # Civitai 모델 추가 다운로드 (CIVITAI_TOKEN 필요할 수 있음)
#
# 완료 후:
#   ~/ComfyUI/start.sh          → ComfyUI 서버 실행 (http://127.0.0.1:8188)
#   openclaw gateway restart    → 오픈클로에 comfy 스킬 반영
set -euo pipefail

COMFY_DIR="${COMFY_DIR:-$HOME/ComfyUI}"
CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOW_SRC="$SCRIPT_DIR/comfyui-workflow-t2i.json"
WORKFLOW_DST="$HOME/.openclaw/comfyui/workflow-t2i.json"

DOWNLOAD_SDXL=1
CIVITAI_VERSION_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-model) DOWNLOAD_SDXL=0 ;;
    --civitai)  shift; CIVITAI_VERSION_ID="${1:?--civitai 뒤에 모델 버전 ID 필요}" ;;
    *) echo "알 수 없는 옵션: $1" >&2; exit 1 ;;
  esac
  shift
done

# ── 1. ComfyUI 설치 ──────────────────────────────────────────────
if [ ! -d "$COMFY_DIR/.git" ]; then
  echo "▶ ComfyUI 클론: $COMFY_DIR"
  git clone https://github.com/comfyanonymous/ComfyUI.git "$COMFY_DIR"
else
  echo "▶ ComfyUI 이미 설치됨 — 업데이트"
  git -C "$COMFY_DIR" pull --ff-only || true
fi

echo "▶ Python 가상환경 + 의존성 설치 (PyTorch MPS 포함)"
python3 -m venv "$COMFY_DIR/.venv"
"$COMFY_DIR/.venv/bin/pip" install --upgrade pip -q
"$COMFY_DIR/.venv/bin/pip" install torch torchvision torchaudio -q
"$COMFY_DIR/.venv/bin/pip" install -r "$COMFY_DIR/requirements.txt" -q

cat > "$COMFY_DIR/start.sh" <<EOF
#!/usr/bin/env bash
# ComfyUI 서버 시작 (애플 실리콘 MPS)
exec "$COMFY_DIR/.venv/bin/python" "$COMFY_DIR/main.py" --listen 127.0.0.1 --port 8188
EOF
chmod +x "$COMFY_DIR/start.sh"

# ── 2. 모델 다운로드 ─────────────────────────────────────────────
CKPT_DIR="$COMFY_DIR/models/checkpoints"
mkdir -p "$CKPT_DIR"

if [ "$DOWNLOAD_SDXL" = 1 ] && [ ! -f "$CKPT_DIR/sd_xl_base_1.0.safetensors" ]; then
  echo "▶ SDXL base 1.0 다운로드 (~6.9GB, 기본 워크플로용)"
  curl -fL --progress-bar \
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors" \
    -o "$CKPT_DIR/sd_xl_base_1.0.safetensors"
fi

if [ -n "$CIVITAI_VERSION_ID" ]; then
  echo "▶ Civitai 모델 다운로드 (버전 ID: $CIVITAI_VERSION_ID)"
  # 일부 모델은 로그인 필요 → https://civitai.com/user/account 에서 API 키 발급 후 export CIVITAI_TOKEN=...
  URL="https://civitai.com/api/download/models/$CIVITAI_VERSION_ID"
  [ -n "${CIVITAI_TOKEN:-}" ] && URL="$URL?token=$CIVITAI_TOKEN"
  curl -fJL --progress-bar "$URL" --output-dir "$CKPT_DIR" -O || {
    echo "!! 다운로드 실패 — 로그인 필요 모델이면 CIVITAI_TOKEN 을 설정하세요." >&2
    exit 1
  }
  echo "   받은 모델을 쓰려면 워크플로의 ckpt_name 을 파일명으로 바꾸세요: $WORKFLOW_DST"
fi

# ── 3. OpenClaw comfy 스킬 연동 ─────────────────────────────────
mkdir -p "$(dirname "$WORKFLOW_DST")"
cp "$WORKFLOW_SRC" "$WORKFLOW_DST"

if command -v openclaw >/dev/null 2>&1; then
  openclaw plugins install comfy 2>/dev/null || openclaw skill install comfy-ui 2>/dev/null || \
    echo "   (comfy 스킬 자동 설치 실패 — 설정만 반영합니다. 수동: openclaw plugins install comfy)"
fi

mkdir -p "$(dirname "$CONFIG")"
[ -f "$CONFIG" ] && cp "$CONFIG" "$CONFIG.bak-$(date +%Y%m%d%H%M%S)"

CONFIG="$CONFIG" WORKFLOW_DST="$WORKFLOW_DST" node <<'EOF'
const fs = require('fs');
const { CONFIG, WORKFLOW_DST } = process.env;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}

cfg.plugins ??= {};
cfg.plugins.entries ??= {};
cfg.plugins.entries.comfy ??= {};
cfg.plugins.entries.comfy.enabled = true;
cfg.plugins.entries.comfy.config = {
  ...cfg.plugins.entries.comfy.config,
  mode: 'local',
  baseUrl: 'http://127.0.0.1:8188',
  image: {
    workflowPath: WORKFLOW_DST,
    promptNodeId: '6',   // CLIPTextEncode (긍정 프롬프트)
    outputNodeId: '9',   // SaveImage
  },
};

fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
console.log(`✔ ${CONFIG} 에 comfy 스킬 설정 반영 (워크플로: ${WORKFLOW_DST})`);
EOF

# ── 4. 마무리 안내 ───────────────────────────────────────────────
echo
echo "✔ 셋업 완료. 다음 순서로 사용하세요:"
echo "  1) ComfyUI 서버 실행:      $COMFY_DIR/start.sh   (백그라운드: nohup $COMFY_DIR/start.sh &)"
echo "  2) 오픈클로 재시작:        openclaw gateway restart"
echo "  3) 오픈클로에게 요청:      \"고양이가 우주복 입은 그림 그려줘\""
echo
echo "  Civitai 모델 추가:  모델 페이지의 버전 ID로  ./setup-image-gen.sh --no-model --civitai <ID>"
echo "  (LLM과 메모리를 나눠 쓰므로, 이미지 생성이 잦으면 SDXL/Flux Schnell 등 가벼운 모델 권장)"
