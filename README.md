# Tanda · तांडा

A cinematic farming game set in **Ukhali Tanda (उखळी तांडा)**, a Banjara settlement in Maharashtra. Ox caravans were the Banjara trade of old, and they still are in the game. Farm black soil, water your jowar, onions
and sugarcane, cart the harvest to the town mandi behind your bulls Sarja and Raja, and buy and sell
land. Runs in the browser (Three.js). A server checks every move, and your farm is saved online.

- Plan and progress: [PLAN.md](PLAN.md)
- Run: `npm install && npm run dev`, then open http://localhost:5190. Local saves go to `.data/`.
- Check: `npm run typecheck && npm test && npm run build`
- Scripted play in headless Chrome (dev server running):
  - `node scripts/m4.mjs`: accounts, saves, tamper checks
  - `node scripts/shots.mjs --name x --eval "$(cat scripts/m3.js)"`: farming (also m5 economy, m6 land, m7 cart, m8 bank)

## Deploy (Vercel + Upstash Redis)

1. `npx vercel login`
2. `npx vercel link`: create the project `tanda`.
3. Vercel dashboard → Storage → add **Upstash for Redis** (free tier) and connect it to the project.
   It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Without them, the API refuses to run on Vercel.
4. `npx vercel --prod`
5. Check the deploy: `curl https://<deployment>/api/health` should return `{"ok":true,"store":"UpstashStore",…}`.
6. Domains → add `tanda.gajananrathod.in`, then at your DNS provider add a `CNAME` from `tanda`
   to `cname.vercel-dns.com`.

The dev-only endpoint `/api/dev` (clock fast-forward and money grant) returns 404 on Vercel.
