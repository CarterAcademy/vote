#!/usr/bin/env bash

set -Eeuo pipefail

PRODUCTION_HOST="${PRODUCTION_HOST:-ubuntu@10.1.131.51}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/committee-vote}"
NODE_DIR="${NODE_DIR:-${REMOTE_ROOT}/runtime/node22/bin}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/icais-registration}"
NGINX_SNIPPET="infra/nginx/committee-vote.production.conf"
PUBLIC_URL="${PUBLIC_URL:-http://10.1.131.51}"

for command_name in git npm rsync ssh; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

if [[ ! -f docs/investigation-summary.html || ! -f "${NGINX_SNIPPET}" ]]; then
  echo "Run this script from the committee-vote repository root." >&2
  exit 1
fi

if [[ ! "${REMOTE_ROOT}" =~ ^/[A-Za-z0-9._/-]+$ || ! "${NODE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
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
  --exclude '.DS_Store' \
  --exclude '._*' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'tsconfig.tsbuildinfo' \
  ./ "${PRODUCTION_HOST}:${remote_release}/"

echo "Building and activating the production release..."
ssh "${PRODUCTION_HOST}" bash -s -- \
  "${REMOTE_ROOT}" "${remote_release}" "${NODE_DIR}" "${NGINX_SITE}" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

remote_root="$1"
remote_release="$2"
node_dir="$3"
nginx_site="$4"
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
  "${node_dir}/node" "${current_link}/scripts/backup-db.mjs"

ln -sfn "${remote_release}" "${current_link}.next"
mv -Tf "${current_link}.next" "${current_link}"
sudo systemctl restart committee-vote.service

echo "Waiting for the application health endpoint..."
healthy=false
for _ in {1..30}; do
  if curl --fail --silent http://10.1.131.51:3000/api/health >/dev/null; then
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
  http://10.1.131.51:3000/investigation-summary.html >/dev/null

echo "Installing the nginx report route..."
sudo install -m 0644 infra/nginx/committee-vote.production.conf \
  /etc/nginx/snippets/committee-vote-report.conf

include_line='    include /etc/nginx/snippets/committee-vote-report.conf;'
if ! sudo grep -Fqx "${include_line}" "${nginx_site}"; then
  match_count="$(sudo grep -c '^[[:space:]]*server_name 10\.1\.131\.51 _;' "${nginx_site}")"
  if [[ "${match_count}" != 1 ]]; then
    echo "Could not identify exactly one nginx server block in ${nginx_site}." >&2
    exit 1
  fi
  sudo sed -i \
    "/^[[:space:]]*server_name 10\\.1\\.131\\.51 _;/a\\${include_line}" \
    "${nginx_site}"
fi

sudo nginx -t
sudo systemctl reload nginx

nginx_ready=false
for _ in {1..15}; do
  if curl --fail --silent \
    --header 'Host: 10.1.131.51' \
    http://127.0.0.1/investigation-summary.html >/dev/null; then
    nginx_ready=true
    break
  fi
  sleep 1
done

if [[ "${nginx_ready}" != true ]]; then
  echo "nginx report URL check failed." >&2
  exit 1
fi

trap - EXIT
sudo systemctl --no-pager --full status committee-vote.service | sed -n '1,12p'
REMOTE_SCRIPT

echo "Deployment complete."
echo "Application: http://10.1.131.51:3000/"
echo "Report:      ${PUBLIC_URL}/investigation-summary.html"
