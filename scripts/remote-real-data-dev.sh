#!/usr/bin/env bash

set -Eeuo pipefail

PRODUCTION_HOST="${PRODUCTION_HOST:-ubuntu@10.1.131.51}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/committee-vote}"
REMOTE_WORKSPACE="${REMOTE_WORKSPACE:-${REMOTE_ROOT}/dev-workspace}"
NODE_DIR="${NODE_DIR:-${REMOTE_ROOT}/runtime/node22/bin}"
LOCAL_PORT="${LOCAL_PORT:-3001}"
REMOTE_PORT="${REMOTE_PORT:-3100}"
LOCAL_BIND_HOST="${LOCAL_BIND_HOST:-127.0.0.1}"

if [[ "${1:-}" != "--confirm-production-data" ]]; then
  echo "This workflow runs development code against the real database on ${PRODUCTION_HOST}." >&2
  echo "Re-run with --confirm-production-data after confirming that test actions may change real records." >&2
  exit 2
fi

for command_name in npm rsync ssh; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

for numeric_port in "${LOCAL_PORT}" "${REMOTE_PORT}"; do
  if [[ ! "${numeric_port}" =~ ^[0-9]+$ ]] || (( numeric_port < 1024 || numeric_port > 65535 )); then
    echo "Ports must be integers between 1024 and 65535." >&2
    exit 1
  fi
done

for remote_path in "${REMOTE_ROOT}" "${REMOTE_WORKSPACE}" "${NODE_DIR}"; do
  if [[ ! "${remote_path}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
    echo "Remote paths may contain only letters, numbers, dot, underscore, slash, and dash." >&2
    exit 1
  fi
done

if [[ ! "${LOCAL_BIND_HOST}" =~ ^[A-Za-z0-9.:-]+$ ]]; then
  echo "LOCAL_BIND_HOST contains unsupported characters." >&2
  exit 1
fi

redirect_uri="http://${LOCAL_BIND_HOST}:${LOCAL_PORT}/api/auth/dingtalk/web/callback"

echo "Checking the local source before upload..."
npm run typecheck

echo "Syncing source to the isolated server-side development workspace..."
ssh "${PRODUCTION_HOST}" "mkdir -p '${REMOTE_WORKSPACE}'"
COPYFILE_DISABLE=1 rsync --archive --compress --delete \
  --exclude '.git/' \
  --exclude '.next/' \
  --exclude 'node_modules/' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  --exclude 'tsconfig.tsbuildinfo' \
  ./ "${PRODUCTION_HOST}:${REMOTE_WORKSPACE}/"

echo "Starting the server-side development process with the server-resident database configuration..."
ssh "${PRODUCTION_HOST}" bash -s -- \
  "${REMOTE_ROOT}" "${REMOTE_WORKSPACE}" "${NODE_DIR}" "${REMOTE_PORT}" "${redirect_uri}" <<'REMOTE'
set -Eeuo pipefail

remote_root="$1"
remote_workspace="$2"
node_dir="$3"
remote_port="$4"
redirect_uri="$5"
env_file="${remote_root}/app.env"
pid_file="${remote_workspace}/.remote-dev.pid"
log_file="${remote_workspace}/remote-dev.log"

if [[ ! -f "${env_file}" ]]; then
  echo "Server environment file is missing." >&2
  exit 1
fi
if [[ ! -x "${node_dir}/node" || ! -x "${node_dir}/npm" ]]; then
  echo "Bundled Node runtime is missing." >&2
  exit 1
fi

export PATH="${node_dir}:${PATH}"
cd "${remote_workspace}"
"${node_dir}/npm" ci --silent

if [[ -f "${pid_file}" ]]; then
  previous_pid="$(cat "${pid_file}")"
  if [[ "${previous_pid}" =~ ^[0-9]+$ ]] && kill -0 "${previous_pid}" 2>/dev/null; then
    kill "${previous_pid}"
    for _ in {1..20}; do
      kill -0 "${previous_pid}" 2>/dev/null || break
      sleep 0.25
    done
  fi
fi

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a
export NODE_ENV=development
export DINGTALK_MOCK_ENABLED=false
export ALLOW_INSECURE_PRODUCTION_MOCK=false
export DINGTALK_WEB_REDIRECT_URI="${redirect_uri}"
export DINGTALK_WEB_ALLOW_INSECURE_REDIRECT=true
export DINGTALK_APP_BASE_URL="${redirect_uri%/api/auth/dingtalk/web/callback}"
export NEXT_TELEMETRY_DISABLED=1

nohup "${node_dir}/npm" run dev -- --hostname 127.0.0.1 --port "${remote_port}" \
  >"${log_file}" 2>&1 &
dev_pid=$!
printf '%s\n' "${dev_pid}" >"${pid_file}"

ready=false
for _ in {1..60}; do
  if curl --fail --silent "http://127.0.0.1:${remote_port}/api/health" >/dev/null; then
    ready=true
    break
  fi
  if ! kill -0 "${dev_pid}" 2>/dev/null; then
    tail -n 80 "${log_file}" >&2
    exit 1
  fi
  sleep 1
done

if [[ "${ready}" != true ]]; then
  tail -n 80 "${log_file}" >&2
  exit 1
fi
REMOTE

cleanup() {
  ssh "${PRODUCTION_HOST}" bash -s -- "${REMOTE_WORKSPACE}" <<'REMOTE' || true
set -Eeuo pipefail
remote_workspace="$1"
pid_file="${remote_workspace}/.remote-dev.pid"
if [[ -f "${pid_file}" ]]; then
  dev_pid="$(cat "${pid_file}")"
  if [[ "${dev_pid}" =~ ^[0-9]+$ ]] && kill -0 "${dev_pid}" 2>/dev/null; then
    kill "${dev_pid}"
  fi
  rm -f "${pid_file}"
fi
REMOTE
}
trap cleanup EXIT INT TERM

echo "Remote real-data development is ready at http://${LOCAL_BIND_HOST}:${LOCAL_PORT}/"
echo "DingTalk redirect URL: ${redirect_uri}"
echo "Press Ctrl-C to stop the tunnel and the server-side development process."
ssh -N \
  -o ExitOnForwardFailure=yes \
  -L "${LOCAL_BIND_HOST}:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
  "${PRODUCTION_HOST}"
