# Bailgaadi

A voxel farming tycoon set in a Maharashtra village: farm your plots, ride the bullock cart to market,
earn a profit, and buy and sell farms. Browser game (Three.js), server-validated economy, cloud saves.

- Plan and progress: [PLAN.md](PLAN.md)
- Run: `npm install && npm run dev` → http://localhost:5190 (saves go to `.data/` locally)
- Check: `npm run typecheck && npm test && npm run shots`
- Deploy: Vercel + Upstash Redis (`KV_REST_API_URL`, `KV_REST_API_TOKEN`); domain `bailgaadi.gajananrathod.in`
