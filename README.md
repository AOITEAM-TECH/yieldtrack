# MB Production — Motherboard Production & Yield Reporting System

A complete, real, working factory floor app: plain HTML/CSS/JS front end + a live Supabase
Postgres database. No build step — just open the HTML files, or host the folder anywhere
(a shared network drive, GitHub Pages, Netlify, an internal IIS/Apache folder). Because the
data lives in Supabase (not the browser), every device that opens these files sees the same
live production data.

## Already live for you
A Supabase project was created and wired in for you — the schema, RLS policies, realtime,
and all master data (20 lines, 25 models, 3 shifts) are already loaded. The URL and key
are already embedded in `js/supabase.js`, so this runs immediately, out of the box.

- Project URL: `https://qniqmsdmiifbailzotlq.supabase.co`
- Tables: `lines`, `models`, `shifts`, `users`, `targets`, `production_reports`, `hourly_production`

## Logging in
Two accounts are seeded to start:
- **Admin:** `admin` / `1234` — sees the Admin tab (Lines, Models, Shifts, Targets, Users)
- **Operator:** `operator` / `1111` — production entry, dashboard, reports, fault log

Add real operators/incharges from **Admin → Users** and disable/delete the demo logins once
your team is set.

⚠️ This login is a lightweight app-level gate (a `users` table + PIN), not full Supabase
Auth — it's enough to identify who is working a shift on a trusted factory network, but it
is **not** bank-grade security. If this ever needs to be internet-facing, upgrade to real
Supabase Auth and tighten the row-level-security policies (currently open, so any holder of
the public anon key can read/write — fine on an internal LAN, not for the open internet).

## Pages
| Page | What it does |
|---|---|
| `index.html` | Sign in |
| `dashboard.html` | Live KPIs, current production, shift status, yield & line charts |
| `production.html` | Hourly entry — pick Date/Line/Model/Shift, 8 slots auto-generate, live yield calc, mismatch warning, Save per hour |
| `faults.html` | Every logged issue across lines/shifts, searchable by date range |
| `reports.html` | Shift-wise / Full-day / Full-week search, line-wise & model-wise breakdowns, **Export Excel** and **Export PDF** |
| `admin.html` | Manage Lines, Models, Shifts (timings), Targets, Users |

## The one rule this whole app enforces
Operators only ever type **quantities** (Target, Overall, Top, Bottom) and Issues.
Every percentage — Overall / Top / Bottom Yield, at the hour, shift, day, week, line, or
model level — is calculated by `js/calculations.js` from **totals**, never averaged from
other percentages. That logic is centralized in one file so it's consistent everywhere
(dashboard, reports, Excel, PDF).

## Running it
Just open `index.html` in a browser — or better, serve the folder with any static file
server so relative links behave correctly, e.g.:
```
npx serve motherboard-production
```
Then share that address on your factory LAN so every workstation reads/writes the same
live Supabase data.

## Extending it
- `supabase/schema.sql` has the full schema if you want to inspect or re-run it elsewhere.
- Want SSO, audit logs, or file-based fault attachments? Those are natural next steps once
  the current app is validated on the floor.
