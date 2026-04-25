---
description: "LeadPin Desktop — Tauri 2 + React + Express + Supabase. Use this when: working on frontend/backend features, debugging build issues, implementing WhatsApp automation, managing state/APIs, or handling database schema changes. Covers architecture, dev setup, conventions, common pitfalls, and directory structure."
---

# LeadPin Agent Customization Guide

**LeadPin** is a desktop lead management + WhatsApp automation platform built with **Tauri 2**, **React 19**, **Express**, and **Supabase**.

> 📖 **Full setup & feature docs:** See [README.md](README.md) for detailed setup, deployment, and troubleshooting.

---

## Quick Reference

| Category | Details |
|----------|---------|
| **Tech Stack** | Frontend: React 19 + TypeScript + Tailwind 4 + Vite · Backend: Express + Puppeteer + whatsapp-web.js · Desktop: Tauri 2 · DB: Supabase |
| **Dev Commands** | Terminal 1: `cd backend && npm run dev` · Terminal 2: `npm run tauri:dev` |
| **Build** | `./build.ps1` (Windows PowerShell) → NSIS installer in `src-tauri/target/release/bundle/nsis/` |
| **Key Ports** | Frontend: `5173` (Vite) · Backend: `4000` (Express) |
| **Entry Points** | Frontend: `src/main.tsx` · Backend: `backend/src/index.ts` · Desktop: `src-tauri/src/main.rs` |
| **Database** | Supabase cloud · Schema: `backend/schema.sql` |
| **Deployment** | Windows only (Tauri + MSVC) · Sidecar pattern: backend bundled as exe inside Tauri |

---

## Architecture

```
┌──────────────────────────────────┐
│   Tauri Desktop (Windows)        │
├──────────────────────────────────┤
│ ┌──────────────┐  ┌────────────┐ │
│ │ React 19     │◄─►│ Express    │ │
│ │ (Vite build) │  │ (sidecar)  │ │
│ │ Port 5173    │  │ Port 4000  │ │
│ └──────────────┘  └────────────┘ │
└────────────────────────┬──────────┘
                         │ (HTTP)
                    ┌────▼─────────┐
                    │  Supabase    │
                    │  (Cloud DB)  │
                    └──────────────┘
```

### Key Patterns

1. **Sidecar Backend**: Express server (`backend-x86_64-pc-windows-msvc.exe`) runs inside Tauri, started automatically
2. **API Client**: `src/lib/api-client.ts` — fetch wrapper with base URL `http://localhost:4000`
3. **State Management**: React Query (`@tanstack/react-query`) for async data, React Router for navigation
4. **Authentication**: Supabase Auth (email/password) → JWT stored in localStorage
5. **Database**: Supabase PostgreSQL + RLS policies for row-level security
6. **Styling**: Tailwind CSS 4 + Radix UI for components

---

## Directory Structure & Conventions

```
leadpin/
├── src/                          # React frontend
│   ├── components/
│   │   ├── business/             # Business detail page components
│   │   ├── dashboard/            # Main dashboard + WhatsApp panels
│   │   │   └── whatsapp/         # 7 WhatsApp feature tabs (bulk, greeting, etc.)
│   │   └── ui/                   # Reusable UI primitives (button, dialog, etc.)
│   ├── hooks/                    # React hooks (data fetching, custom logic)
│   ├── lib/                      # Utilities (api-client, supabase, utils)
│   ├── pages/                    # Page-level components (Auth, Dashboard, BusinessDetail)
│   ├── providers/                # Context providers (QueryProvider)
│   ├── types/                    # TypeScript types & interfaces
│   ├── App.tsx                   # Router setup
│   ├── main.tsx                  # React DOM entry point
│   └── globals.css               # Global Tailwind styles
│
├── backend/                      # Express + Node.js
│   ├── src/
│   │   ├── controllers/          # Route handlers (business, list, whatsapp)
│   │   ├── middleware/           # Auth middleware
│   │   ├── routes/               # Route definitions
│   │   ├── services/             # Business logic (scraper, whatsapp)
│   │   ├── utils/                # Helpers (supabase client, etc.)
│   │   └── index.ts              # Express app setup
│   ├── .env.example              # Environment template
│   ├── schema.sql                # Supabase database schema
│   ├── tsconfig.json
│   └── package.json
│
├── src-tauri/                    # Tauri 2 desktop config
│   ├── src/
│   │   ├── main.rs               # Tauri entry point (sidecar launcher)
│   │   └── lib.rs
│   ├── tauri.conf.json           # Tauri config (window size, icons, sidecar)
│   ├── Cargo.toml
│   └── binaries/                 # Compiled backend exe (after build)
│
├── package.json                  # Frontend dependencies
├── tsconfig.json                 # Frontend TypeScript config
├── vite.config.ts                # Vite bundler config
├── build.ps1                     # Production build script (PowerShell)
└── README.md                     # Full documentation (Turkish)
```

### Component Naming Conventions

- **Page components**: `<Name>Page.tsx` (e.g., `DashboardPage.tsx`)
- **Feature components**: `<Feature><Purpose>.tsx` (e.g., `BulkSendPanel.tsx`, `OutreachHistory.tsx`)
- **UI primitives**: lowercase + hyphen (e.g., `button.tsx`, `confirm-dialog.tsx`)
- **Hooks**: `use<Name>.ts` (e.g., `useBusiness.ts`, `useOutreach.ts`)
- **Services**: lowercase + plural (e.g., `scraper.ts`, `whatsapp.ts`)

---

## Development Setup

### Prerequisites
- Node.js 18+
- Rust + Cargo
- Visual Studio Build Tools (Windows, "Desktop development with C++" workload)
- Supabase account (free tier works)

### Initial Setup

```bash
# 1. Install dependencies
npm install
cd backend && npm install && cd ..

# 2. Create backend/.env
copy backend\.env.example backend\.env
# Edit .env with your Supabase credentials:
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN

# 3. Run Supabase migrations
# In Supabase SQL Editor, run: backend/schema.sql
```

### Dev Workflow

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev     # Runs on http://localhost:4000
```

**Terminal 2 — Frontend + Tauri:**
```bash
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri:dev    # Opens app at http://localhost:5173
```

### Common Dev Tasks

| Task | Command |
|------|---------|
| Build frontend only | `npm run build` |
| Type check | `tsc` (both root and backend) |
| Backend type check | `cd backend && tsc` |
| Build sidecar exe | `cd backend && npm run build && npx @yao-pkg/pkg dist/index.js --targets node18-win-x64 ...` |
| Full production build | `./build.ps1` |

---

## Key Files & Patterns

### Frontend

- **API calls**: All requests go through `src/lib/api-client.ts`:
  ```ts
  const response = await apiClient.get('/api/businesses')
  ```
  Base URL is `http://localhost:4000` (dev) or relative (production).

- **Async data**: Use React Query with keys defined in `src/lib/query-keys.ts`:
  ```ts
  const { data } = useQuery({ queryKey: queryKeys.business(id), queryFn: ... })
  ```

- **Authentication**: Supabase client in `src/lib/supabase.ts`:
  ```ts
  const { data, error } = await supabase.auth.signInWithPassword(email, password)
  ```

- **Routing**: React Router with protected routes:
  ```tsx
  <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
  ```

### Backend

- **Database**: Supabase client initialized in `backend/src/utils/supabase.ts`
- **Express routes**: Defined in `backend/src/routes/` and imported in `backend/src/index.ts`
- **Controllers**: Handlers organized by domain (`business.controller.ts`, `list.controller.ts`, `whatsapp.controller.ts`)
- **Services**: Business logic (scraping, WhatsApp automation) in `backend/src/services/`
- **Middleware**: Auth validation in `backend/src/middleware/auth.ts` (validates JWT)

### Database

- **Schema**: See `backend/schema.sql` for complete table definitions, indexes, RLS policies
- **Key tables**:
  - `auth.users` — Supabase managed auth
  - `businesses` — Scraped/imported leads
  - `lists` — User-created lead groups
  - `whatsapp_auto_rules` — Greeting + keyword-based automation
  - `whatsapp_scheduled_campaigns` — Queued campaigns
  - `outreach_logs` — Message history

---

## Common Workflows

### Adding a Backend API Endpoint

1. Create handler in `backend/src/controllers/` (or existing controller)
2. Add route in `backend/src/routes/` (e.g., `business.routes.ts`)
3. Import route in `backend/src/index.ts`
4. Update TypeScript types if needed
5. Test with `http://localhost:4000/api/endpoint` in dev mode

### Adding a Frontend Component

1. Create component file in `src/components/` following naming conventions
2. Import reusable UI from `src/components/ui/`
3. Use React Query hooks from `src/hooks/` for data fetching
4. Add route in `src/App.tsx` if it's a page
5. Test by running `npm run tauri:dev`

### Fetching Data from Supabase

1. Define query key in `src/lib/query-keys.ts`
2. Create custom hook in `src/hooks/` using React Query:
   ```ts
   export const useBusiness = (id: string) => {
     return useQuery({
       queryKey: queryKeys.business(id),
       queryFn: async () => {
         const response = await apiClient.get(`/api/businesses/${id}`)
         return response.data
       }
     })
   }
   ```
3. Use in component: `const { data, isLoading } = useBusiness(id)`

### Modifying Database Schema

1. Add/modify table definitions in `backend/schema.sql` (use `IF NOT EXISTS` for safety)
2. Run updated SQL in Supabase SQL Editor
3. Update TypeScript interfaces in `src/types/index.ts`
4. Update API handlers to use new fields

---

## Build & Deployment

### Development Build
```powershell
npm run tauri:dev    # Auto-builds backend sidecar when needed
```

### Production Build
```powershell
./build.ps1          # 4-step process:
                     # 1. Backend TypeScript compile
                     # 2. Backend pkg → exe
                     # 3. Frontend Vite build
                     # 4. Tauri bundle → NSIS installer
```

**Output**: `src-tauri/target/release/bundle/nsis/LeadPin_<version>_x64-setup.exe`

### Build Troubleshooting

| Error | Solution |
|-------|----------|
| "cargo metadata not found" | Set Cargo in PATH: `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` |
| "link.exe not found" | Install Visual Studio Build Tools with "Desktop development with C++" workload |
| "backend-*.exe doesn't exist" | Normal in dev (Tauri skips for dev mode). Build production via `./build.ps1` |
| "Connection closed" (Puppeteer) | Restart backend, check `PUPPETEER_HEADLESS=true` in `.env` |

---

## Common Pitfalls & Solutions

### Backend `.env` Mistakes
- **Wrong key**: Using `SUPABASE_ANON_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY` → backend auth fails
- **Missing credentials**: `.env` not created or incomplete → backend crashes on startup
- **Solution**: Copy `backend/.env.example`, fill all required fields, restart dev server

### WhatsApp Session Issues
- **QR keeps refreshing**: Likely auth cache corrupted
- **Solution**: Delete `backend/.wwebjs_auth/` and `backend/.wwebjs_cache/`, rescan QR

### Frontend API Errors
- **"Cannot reach backend"**: Backend not running or port 4000 not accessible
- **Solution**: Verify Terminal 1 has `npm run dev` running, check `src/lib/api-client.ts` base URL

### TypeScript Errors
- **Component props type mismatch**: Ensure component exports proper `React.FC<Props>`
- **React Query hook types**: Query keys must match return types of query functions
- **Solution**: Run `tsc` to catch all type errors before runtime

### Tauri Build Failures
- **"frontendDist not found"**: Frontend build failed before Tauri invoked
- **Solution**: Run `npm run build` manually, check for errors, then `npm run tauri:build`

---

## Environment & Dependencies

### Frontend Stack
- **React 19** — UI framework
- **TypeScript** — Static typing
- **Vite 6** — Fast bundler
- **Tailwind CSS 4** — Styling
- **Radix UI** — Unstyled components (accessible)
- **React Router 7** — Navigation
- **React Query 5** — Data fetching & caching
- **Supabase JS** — Backend auth + database
- **@tauri-apps/api** — Desktop integration

### Backend Stack
- **Express 5** — HTTP framework
- **TypeScript 6** — Static typing
- **Supabase JS** — Database + auth
- **Puppeteer 24** — Google Maps scraping
- **whatsapp-web.js** — WhatsApp Web automation
- **Zod** — Schema validation

### Desktop Stack
- **Tauri 2** — Desktop framework
- **Rust** — Core engine
- **NSIS** — Windows installer

---

## Tips for Agents

1. **Always check `.env`** before debugging backend issues — missing Supabase credentials are the #1 problem
2. **Run both dev servers** — Frontend dev without backend running will cause "Cannot reach API" errors
3. **React Query caching** — If data seems stale, check query invalidation logic in components
4. **Sidecar paths** — Backend exe must be at `src-tauri/binaries/backend-x86_64-pc-windows-msvc.exe` for Tauri to find it
5. **Type safety**: Use `queryKeys` from `src/lib/query-keys.ts` to avoid mismatches between frontend + backend
6. **Database migrations**: Always use `IF NOT EXISTS` in schema.sql to prevent failures on re-runs
7. **WhatsApp automation**: `whatsapp_auto_rules` table has `reply_once_per_contact` + `cooldown_minutes` — check these when debugging reply logic
8. **Short ID tracking**: `businesses.short_id` links to tıklama takibi (click tracking) via Supabase RPC `track_short_id_click`

---

## Useful Commands Summary

```bash
# Frontend
npm run dev                       # Vite dev server (port 5173)
npm run build                     # Build dist/
npm run tauri:dev                 # Launch Tauri dev (requires backend running)
npm run tauri:build               # Build installer (release mode)

# Backend
cd backend
npm run dev                        # ts-node-dev on port 4000
npm run build                      # TypeScript compile to dist/
npm start                          # Run compiled dist/index.js
npm run build && pkg ...           # Package as exe (see build.ps1)

# Full production
./build.ps1                        # Complete build pipeline
```

---

## References

- **Full docs**: [README.md](README.md)
- **Database schema**: [backend/schema.sql](backend/schema.sql)
- **Environment template**: [backend/.env.example](backend/.env.example)
- **Tauri config**: [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)

