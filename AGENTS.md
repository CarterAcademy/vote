# Repository guidance

## Production deployment

- Production SSH host: `ubuntu@10.1.131.51`.
- Release root: `/srv/committee-vote`; the active release is the `current` symlink and secrets are in `/srv/committee-vote/app.env`.
- `committee-vote.service` runs the standalone Next.js application on `10.1.131.51:3000` using the bundled Node 22 runtime at `/srv/committee-vote/runtime/node22`.
- nginx already serves another application at `/`. It exposes only the exact `/investigation-summary.html` route for Committee Vote using `infra/nginx/committee-vote.production.conf`.
- Production application URL: `http://10.1.131.51:3000/`.
- Investigation report URL: `http://10.1.131.51/investigation-summary.html`.
- Local development report URL: `http://localhost:3000/investigation-summary.html`.
- Deploy from a trusted workstation with `./deploy.sh`. Override `PRODUCTION_HOST` or `REMOTE_DIR` only when the production topology intentionally changes.
- Production secrets live only in `/srv/committee-vote/app.env` on the server. Never copy that file back, commit it, or print it.
- Never run `npm run db:seed` in production.

Do not report a deployment as successful until both the direct health check and nginx report URL checks pass.
