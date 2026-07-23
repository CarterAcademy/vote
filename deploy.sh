#!/usr/bin/env bash

set -Eeuo pipefail

PRODUCTION_HOST="${PRODUCTION_HOST:-ubuntu@10.1.130.9}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/committee-vote}"
NODE_DIR="${NODE_DIR:-/usr/bin}"
APP_HOST="${APP_HOST:-10.1.130.9}"
APP_PORT="${APP_PORT:-3011}"
PUBLIC_URL="${PUBLIC_URL:-http://${APP_HOST}:${APP_PORT}}"
RELEASES_TO_KEEP="${RELEASES_TO_KEEP:-5}"

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

if [[ ! "${REMOTE_ROOT}" =~ ^/[A-Za-z0-9._/-]+$ || ! "${NODE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ || ! "${APP_PORT}" =~ ^[0-9]+$ || ! "${RELEASES_TO_KEEP}" =~ ^[0-9]+$ || ${RELEASES_TO_KEEP} -lt 2 ]]; then
  echo "REMOTE_ROOT or NODE_DIR contains unsupported characters, or RELEASES_TO_KEEP is less than 2." >&2
  exit 1
fi

commit_id="$(git rev-parse --short=12 HEAD)"
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${commit_id}"
remote_build="${REMOTE_ROOT}/builds/${release_id}"
remote_release="${REMOTE_ROOT}/releases/${release_id}"

echo "Running local release checks..."
npm run lint
npm run typecheck
npm test
npm run build

echo "Preparing ${PRODUCTION_HOST}:${remote_build}..."
ssh "${PRODUCTION_HOST}" "mkdir -p '${REMOTE_ROOT}/builds' '${REMOTE_ROOT}/releases' && test ! -e '${remote_build}' && test ! -e '${remote_release}' && mkdir '${remote_build}'"

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
  ./ "${PRODUCTION_HOST}:${remote_build}/"

echo "Building and activating the production release..."
ssh "${PRODUCTION_HOST}" bash -s -- \
  "${REMOTE_ROOT}" "${remote_build}" "${remote_release}" "${NODE_DIR}" "${APP_HOST}" "${APP_PORT}" "${RELEASES_TO_KEEP}" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

remote_root="$1"
remote_build="$2"
remote_release="$3"
node_dir="$4"
app_host="$5"
app_port="$6"
releases_to_keep="$7"
app_origin="http://${app_host}:${app_port}"
env_file="${remote_root}/app.env"
current_link="${remote_root}/current"
runtime_release="${remote_release}.runtime"
previous_release=""
activated=false

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
  rm -rf -- "${remote_build}" "${runtime_release}" || true
  if [[ ${exit_code} -ne 0 && "${activated}" == true ]]; then
    if [[ -n "${previous_release}" && -d "${previous_release}" ]]; then
      echo "Deployment failed; restoring the previous release..." >&2
      ln -sfn "${previous_release}" "${current_link}.rollback"
      mv -Tf "${current_link}.rollback" "${current_link}"
      sudo systemctl restart committee-vote.service || true
    else
      echo "Initial deployment failed; stopping the service..." >&2
      rm -f -- "${current_link}"
      sudo systemctl stop committee-vote.service || true
    fi
  fi
  if [[ ${exit_code} -ne 0 && "${activated}" == true && -d "${remote_release}" ]]; then
    rm -rf -- "${remote_release}" || true
  fi
  exit "${exit_code}"
}
trap rollback EXIT

cd "${remote_build}"
install -d -m 0750 "${remote_root}/uploads"
"${node_dir}/npm" ci
"${node_dir}/npm" run build

echo "Creating a pre-deployment database backup..."
set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a
BACKUP_DIR="${remote_root}/backups" \
  "${node_dir}/node" "${remote_build}/scripts/backup-db.mjs"

echo "Applying database migrations..."
"${node_dir}/npm" run db:migrate

echo "Assembling the standalone runtime release..."
install -d -m 0750 "${runtime_release}/.next"
cp -a "${remote_build}/.next/standalone/." "${runtime_release}/"
cp -a "${remote_build}/.next/static" "${runtime_release}/.next/static"
if [[ -d "${remote_build}/public" ]]; then
  cp -a "${remote_build}/public" "${runtime_release}/public"
fi
rm -rf -- "${runtime_release}/uploads"
ln -s "${remote_root}/uploads" "${runtime_release}/uploads"
printf '%s\n' "$(basename "${remote_release}")" >"${runtime_release}/DEPLOYED_COMMIT"
mv "${runtime_release}" "${remote_release}"
rm -rf -- "${remote_build}"

ln -sfn "${remote_release}" "${current_link}.next"
mv -Tf "${current_link}.next" "${current_link}"
activated=true
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

echo "Removing releases older than the newest ${releases_to_keep}..."
mapfile -t release_names < <(
  find "${remote_root}/releases" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r
)
for ((release_index = releases_to_keep; release_index < ${#release_names[@]}; release_index++)); do
  release_name="${release_names[release_index]}"
  if [[ "${release_name}" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,40}$ ]]; then
    rm -rf -- "${remote_root}/releases/${release_name}"
  else
    echo "Skipping unexpected release directory name: ${release_name}" >&2
  fi
done

sudo systemctl --no-pager --full status committee-vote.service | sed -n '1,12p'
REMOTE_SCRIPT

echo "Deployment complete."
echo "Application: ${PUBLIC_URL}/"
echo "Report:      ${PUBLIC_URL}/investigation-summary.html"
