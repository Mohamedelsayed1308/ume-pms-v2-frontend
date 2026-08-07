# ROLLBACK PLAN — UME PMS V2 (UI Modernization)

> Recovery point created in Phase 0. This document is the authoritative rollback reference.
> **Do not delete the baseline branch or tag.**

## Stable baseline (recovery point)

| Repo | Branch | Tag | Commit |
|------|--------|-----|--------|
| Frontend (`ume-pms-v2-frontend`) | `production-baseline-before-ui-v3` | `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION` | `3fe2c84` |
| Backend (`ume-pms-v2-backend`) | `production-baseline-before-ui-v3` | `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION` | `aca8e554` |

Both branch and tag are pushed to `origin`.

- Frontend production: `https://ume-pms-v2-frontend.vercel.app` (Vercel, deploys from `main`)
- Backend production: `https://ume-pms-v2-backend-production.up.railway.app` (Railway, deploys from `main`)

## 1. Restore the frontend
```bash
git checkout main
git reset --hard UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION
git push origin main --force-with-lease
```
Vercel auto-redeploys `main` → production restored (~1–2 min build).
Alternative (no history rewrite): in the Vercel dashboard, promote the last known-good deployment to Production (instant).

## 2. Restore the backend
```bash
git checkout main
git reset --hard UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION
git push origin main --force-with-lease
```
Railway auto-redeploys `main` → backend restored. Alternative: redeploy the previous successful build from the Railway dashboard.

## 3. Restore deployment configuration
No `vercel.json` / `railway.*` files are used; configuration lives in the dashboards and in `package.json` build scripts, which are captured by the baseline commit. Restoring the commit restores the build.

## 4. Restore database state
- **UI modernization phases make NO schema changes**, so no DB rollback is expected.
- The backend runs TypeORM `synchronize: true` (auto-applies entity changes on boot). **Any entity change is effectively a live migration** — see risks. If a schema change is ever made, take a Supabase snapshot BEFORE deploying, and restore that snapshot to roll back.
- No `DROP`, no column rename/removal, no data deletion is permitted during modernization.

## 5. Rollback duration
- Frontend: ~1–2 min (Vercel promote is near-instant).
- Backend: ~2–4 min (Railway rebuild) or instant via dashboard redeploy.
- Database: only if a snapshot restore is needed (minutes, manual).

## 6. Files / access required
- Git access to both repos (push).
- Vercel dashboard access (promote/redeploy).
- Railway dashboard access (redeploy).
- Supabase dashboard access (only if DB restore is ever needed).
