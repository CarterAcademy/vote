# Repository guidance

## Production deployment

- Production SSH host: `ubuntu@10.1.130.9`.
- Release root: `/srv/committee-vote`; the active release is the `current` symlink and secrets are in `/srv/committee-vote/app.env`.
- `committee-vote.service` runs the standalone Next.js application on `10.1.130.9:3011` using the server's Node 22 runtime.
- Production frontend service target: `10.1.130.9:3011`.
- Production application URL: `http://10.1.130.9:3011/`.
- Investigation report URL: `http://10.1.130.9:3011/investigation-summary.html`.
- Local development report URL: `http://localhost:3000/investigation-summary.html`.
- Deploy from a trusted workstation with `./deploy.sh`. Override `PRODUCTION_HOST` or `REMOTE_DIR` only when the production topology intentionally changes.
- Production secrets live only in `/srv/committee-vote/app.env` on the server. Never copy that file back, commit it, or print it.
- Never run `npm run db:seed` in production.

Do not report a deployment as successful until both the direct health check and production report URL checks pass on `10.1.130.9:3011`.

## Browser compatibility

- Every feature must work in a standard browser outside the DingTalk client.
- DingTalk JSAPI integrations may provide an enhanced in-client experience, but they must not be the only way to complete a workflow; provide a browser-compatible UI and server-backed fallback.

## Authorization model

- The system has three independently assignable roles:
  - **Administrator (管理员):** has access to all system features.
  - **Initiator (发起人):** has access to poll management (投票管理) and committee management (委员会管理).
  - **Ordinary DingTalk user (普通钉钉用户):** can view and participate in a poll only when included in that poll's committee/voter list; otherwise the user's poll list is empty.
- A person may hold multiple roles at the same time. Effective permissions are the union of every role assigned to that person; assigning one role must not remove or hide capabilities granted by another role.
- Model authorization as independent roles/capabilities rather than a single mutually exclusive role field. Enforce the same merged permissions in server-side authorization, API behavior, routing, and UI navigation/actions.
