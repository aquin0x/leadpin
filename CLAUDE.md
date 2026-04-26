# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> A more detailed guide already exists at [AGENTS.md](AGENTS.md). Read it for directory layout, naming conventions, common workflows, and pitfalls. This file captures only what's specific to operating efficiently in this repo.

## What this is

LeadPin Desktop — a Windows desktop app that scrapes Google Maps businesses and runs WhatsApp outreach (bulk send, auto-reply, scheduled campaigns, click tracking). Stack: **Tauri 2 + React 19 + Vite + Tailwind 4** (frontend) and **Express + Puppeteer + whatsapp-web.js** (backend), with **Supabase** as the only data store.

The backend is shipped as a **sidecar binary** inside the Tauri app. In dev they run as two separate processes; in production `build.ps1` packages the backend with `@yao-pkg/pkg` into `src-tauri/binaries/backend-x86_64-pc-windows-msvc.exe` and Tauri auto-launches it.

## Dev loop

Two terminals (PowerShell on Windows):

```powershell
# Terminal 1 — backend on :4000
cd backend; npm run dev

# Terminal 2 — Tauri + Vite (:5173)
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri:dev
```

Frontend-only (browser, no desktop shell): `npm run dev`.

## Build / typecheck

| Goal | Command |
|------|---------|
| Frontend typecheck + bundle | `npm run build` (runs `tsc && vite build`) |
| Backend typecheck + compile | `cd backend && npm run build` |
| Production installer | `./build.ps1` → `src-tauri/target/release/bundle/nsis/LeadPin_<ver>_x64-setup.exe` |

There is **no test runner, no linter, and no formatter configured**. Don't invent `npm test` / `npm run lint` — they don't exist. Type errors via `tsc` are the only automated check.

## Things to know before editing

- **Schema lives in one file:** [backend/schema.sql](backend/schema.sql) is the source of truth for all Supabase tables, RLS policies, indexes, and the `track_short_id_click` RPC. Apply with the Supabase SQL editor; written with `IF NOT EXISTS` so re-runs are safe. There is no migrations framework — edits go in this single file.
- **All frontend → backend traffic goes through `src/lib/api-client.ts`** (base `http://localhost:4000`). The frontend does **not** talk to Supabase directly for app data — only for `supabase.auth.*`. The backend uses `SUPABASE_SERVICE_ROLE_KEY` and enforces auth via JWT middleware.
- **React Query keys are centralized** in `src/lib/query-keys.ts`. Reuse them so invalidation works.
- **WhatsApp session state** lives in `backend/.wwebjs_auth/` and `backend/.wwebjs_cache/`. If QR keeps refreshing or sessions misbehave, deleting these is the standard fix.
- **`link_owner` feature flag** (short-link click tracking) is set manually in Supabase via `auth.users.raw_app_meta_data`. Don't add UI to grant it — it's intentionally admin-only.
- **Shell:** the project is Windows-only (Tauri MSVC + NSIS). `build.ps1` is PowerShell. The Bash tool here uses Unix paths but the underlying OS is Windows; PowerShell is available via the PowerShell tool when needed.

## Where features live

- **WhatsApp UI panels** (7 tabs: bulk, auto-reply, templates, greeting, scheduled, history, lines): `src/components/dashboard/whatsapp/`
- **Backend WhatsApp + scraping services**: `backend/src/services/`
- **Tauri sidecar wiring**: `src-tauri/src/lib.rs` and `src-tauri/tauri.conf.json` (`externalBin` / `bundle.externalBin`)
