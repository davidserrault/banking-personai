#!/bin/zsh
set -e
cd -- "$(dirname -- "$0")"
PERSONAI_NODE="$(command -v node || true)"
if [[ -z "$PERSONAI_NODE" ]]; then
  PERSONAI_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$PERSONAI_NODE" ]]; then
  echo "Install Node.js 22.13 or newer, then follow README.md."
  read -r "?Press Enter to close."
  exit 1
fi
if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  echo "Install project dependencies with pnpm install, then launch again."
  read -r "?Press Enter to close."
  exit 1
fi
echo "PersonAI: http://127.0.0.1:5173/"
exec "$PERSONAI_NODE" node_modules/vite/bin/vite.js --host 127.0.0.1
