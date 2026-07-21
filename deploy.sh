#!/usr/bin/env bash

set -Eeuo pipefail

PRODUCTION_HOST="${PRODUCTION_HOST:-ubuntu@10.1.130.9}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/committee-vote}"
NODE_DIR="${NODE_DIR:-/usr/bin}"
APP_HOST="${APP_HOST:-10.1.130.9}"
APP_PORT="${APP_PORT:-3011}"
PUBLIC_URL="${PUBLIC_URL:-http://${APP_HOST}:${APP_PORT}}"

for command_name in git npm rsync ssh; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

if [[ ! -f docs/investigation-summary.html ]]; then
  echo "Run this script from the committee-vote repository root." >&2
  exit 1
fi

if [[ ! "${REMOTE_ROOT}" =~ ^/[A-Za-z0-9._/-]+$ || ! "${NODE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ || ! "${APP_PORT}" =~ ^[0-9]+$ ]]; then
  echo "REMOTE_ROOT or NODE_DIR contains unsupported characters." >&2
  exit 1
fi

commit_id="$(git rev-parse --short=12 HEAD)"
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${commit_id}"
remote_release="${REMOTE_ROOT}/releases/${release_id}"

echo "Running local release checks..."
npm run lint
npm run typecheck
npm test
npm run build

echo "Preparing ${PRODUCTION_HOST}:${remote_release}..."
ssh "${PRODUCTION_HOST}" "mkdir -p '${remote_release}'"

echo "Uploading application files (secrets and build artifacts are excluded)..."
COPYFILE_DISABLE=1 rsync --archive --compress \
  --exclude '.git/' \
  --exclude '.next/' \
  --exclude 'node_modules/' \
  --exclude 'uploads/' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'tsconfig.tsbuildinfo' \
  ./ "${PRODUCTION_HOST}:${remote_release}/"

echo "Building and activating the production release..."
ssh "${PRODUCTION_HOST}" bash -s -- \
  "${REMOTE_ROOT}" "${remote_release}" "${NODE_DIR}" "${APP_HOST}" "${APP_PORT}" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

remote_root="$1"
remote_release="$2"
node_dir="$3"
app_host="$4"
app_port="$5"
app_origin="http://${app_host}:${app_port}"
env_file="${remote_root}/app.env"
current_link="${remote_root}/current"
previous_release=""

if [[ ! -x "${node_dir}/node" || ! -x "${node_dir}/npm" ]]; then
  echo "Node 22 runtime is missing from ${node_dir}." >&2
  exit 1
fi

# npm uses `#!/usr/bin/env node`; prepend the bundled runtime so dependency
# installation and the Next.js build do not fall back to the system Node 20.
export PATH="${node_dir}:${PATH}"
if [[ "$(node --version)" != v22.* ]]; then
  echo "Expected Node 22, got $(node --version)." >&2
  exit 1
fi

if [[ ! -f "${env_file}" ]]; then
  echo "Production environment file is missing: ${env_file}" >&2
  exit 1
fi

if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
fi

rollback() {
  exit_code=$?
  if [[ ${exit_code} -ne 0 && -n "${previous_release}" && -d "${previous_release}" ]]; then
    echo "Deployment failed; restoring the previous release..." >&2
    ln -sfn "${previous_release}" "${current_link}.rollback"
    mv -Tf "${current_link}.rollback" "${current_link}"
    sudo systemctl restart committee-vote.service || true
  fi
  exit "${exit_code}"
}
trap rollback EXIT

cd "${remote_release}"
install -d -m 0750 "${remote_root}/uploads"
ln -s "${remote_root}/uploads" "${remote_release}/uploads"
"${node_dir}/npm" ci
"${node_dir}/npm" run build

# The systemd unit starts the standalone server from the release root.
cp -a .next/standalone/. ./
printf '%s\n' "$(basename "${remote_release}")" >DEPLOYED_COMMIT

echo "Creating a pre-deployment database backup..."
set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a
BACKUP_DIR="${remote_root}/backups" \
  "${node_dir}/node" "${remote_release}/scripts/backup-db.mjs"

echo "Applying database migrations..."
"${node_dir}/npm" run db:migrate

ln -sfn "${remote_release}" "${current_link}.next"
mv -Tf "${current_link}.next" "${current_link}"
sudo systemctl restart committee-vote.service

echo "Waiting for the application health endpoint..."
healthy=false
for _ in {1..30}; do
  if curl --fail --silent "${app_origin}/api/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "${healthy}" != true ]]; then
  sudo systemctl --no-pager --full status committee-vote.service || true
  sudo journalctl --no-pager -u committee-vote.service -n 100 || true
  echo "Application health check failed." >&2
  exit 1
fi

curl --fail --silent --show-error \
  "${app_origin}/investigation-summary.html" >/dev/null

trap - EXIT
sudo systemctl --no-pager --full status committee-vote.service | sed -n '1,12p'
REMOTE_SCRIPT

echo "Deployment complete."
echo "Application: ${PUBLIC_URL}/"
echo "Report:      ${PUBLIC_URL}/investigation-summary.html"
