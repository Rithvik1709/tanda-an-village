# Tanda · तांडा

Created by **Gajanan Rathod**.

A cinematic farming game set in **Ukhali Tanda (उखळी तांडा)**, a Banjara settlement in Maharashtra. Ox caravans were the Banjara trade of old, and they still are in the game. Farm black soil, water your jowar, onions
and sugarcane, cart the harvest to the town mandi behind your bulls Sarja and Raja, and buy and sell
land. Runs in the browser (Three.js). A server checks every move, and your farm is saved online.

- Plan and progress: [PLAN.md](PLAN.md)
- Run: `npm install && npm run dev`, then open http://localhost:5190. Local saves go to `.data/`.
- Check: `npm run typecheck && npm test && npm run build`
- Scripted play in headless Chrome (dev server running):
  - `node scripts/m4.mjs`: accounts, saves, tamper checks
  - `node scripts/shots.mjs --name x --eval "$(cat scripts/m3.js)"`: farming (also m5 economy, m6 land, m7 cart, m8 bank)

## Deploy (Vercel + Supabase)

The game's API runs as Vercel functions in this repo (`api/`). They check every move and are the only
thing that talks to the database. Players start as guests, with no sign-up.

1. **Supabase:** create a project at supabase.com (Region: Mumbai). In the SQL Editor, paste
   [`supabase/schema.sql`](supabase/schema.sql) and run it.
2. **Vercel:** `npx vercel login`, then `npx vercel link` (project `tanda`).
3. **Keys:** in Vercel → Settings → Environment Variables, add `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Settings → API). Or use Vercel's Supabase integration,
   which adds them for you. **The service key must never go in client code.**
4. `npx vercel --prod`
5. Check: `curl https://<deployment>/api/health` should return `{"ok":true,"store":"SupabaseStore",…}`.
6. Domains → add `tanda.gajananrathod.in`, then at your DNS provider add a `CNAME` from `tanda` to `cname.vercel-dns.com`.

Without the Supabase keys, the API refuses to run on Vercel, so saves are never silently lost.
Locally it uses JSON files in `.data/`.

**What's stored:**
- `kv`: players, session token hashes, recovery codes, and each save as JSONB with a `rev` column.
  A stale write is refused and replayed, so two devices can play at once.
- `leaderboard`: name, net worth, title, missions and Sarpanch, updated after every accepted move.
- `accounts`: ready for sign-up later (Supabase Auth user → guest farm).

The dev-only endpoint `/api/dev` (clock fast-forward and money grant) returns 404 on Vercel.

## The map

The map is based on the real Ukhali, Jalna district (19.819° N, 76.214° E). The roads and lanes come
from OpenStreetMap (© OpenStreetMap contributors, ODbL; data in `src/shared/ukhali-osm.ts`). The field
strips, the village's extent, the red scrub to the east and the round field well were placed by
reading satellite imagery. The scale is about 4 m per block, and buildings are game-sized, so the
village has fewer, larger houses than the real one.
