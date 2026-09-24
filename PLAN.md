# Bailgaadi — v1 plan

A voxel (Minecraft-style) farming tycoon set in a Maharashtra village. Farm your plots, load the
bullock cart, sell at the market, earn a profit, and buy and sell farms. A real game: accounts,
cloud saves, and a server that owns the money so nobody can cheat.

Hosting: Vercel, at **bailgaadi.gajananrathod.in** (name is a working title).

This file is the build loop's source of truth. Each iteration: take the first unchecked task,
build it, verify it (typecheck, unit tests, headless screenshots LOOKED AT), tick it, add a line to
the progress log, commit. Never tick a box that wasn't verified.

---

## 1. Design pillars
1. **Cozy but real.** No game over. Money, soil, seasons and prices behave believably.
2. **Every block matters.** Soil quality, water and what's planted live on individual blocks.
3. **Land is the long game.** Plots have values that change; improving land and flipping farms is a strategy.
4. **The server owns value.** Money, inventory, crops, land and loans change only through validated server actions.
5. **Warm, not grey.** Toon-lit golden hours, painterly block clouds, a village that feels lived in.
6. **Runs on a normal laptop** in Chrome, Edge, Safari or Firefox at 60 fps.

## 2. The v1 loop
```
farm (till → sow → water → wait → harvest) → sell (village trader now, or cart to the town market for more)
   ↑                                                                                         ↓
 upgrade (seeds, tools, bulls, buildings) ← buy / sell / lease land ← profit ← (hold in godown, take a loan)
```

## 3. Architecture
```
src/
  shared/        pure TypeScript used by BOTH client and server — the rules of the game
    blocks.ts      block ids, names, colours
    world.ts       deterministic world generation (seeded): terrain, river, roads, plots, village
    crops.ts       crop defs: seasons, growth days, water need, yield, seed price
    time.ts        game clock (1 game day = 10 real minutes), seasons, monsoon
    economy.ts     daily market prices (seeded, supply/demand, events), costs
    land.ts        plot definitions, plot value model
    rules.ts       validate + apply actions to a save (the ONLY way state changes)
    save.ts        save format, versioning, migrations
  client/        Three.js game
    engine/        renderer, chunk meshing (web worker), texture atlas (canvas-generated), sky, lighting
    player/        first-person controls, collision, raycast, hotbar
    ui/            HTML/CSS HUD: hotbar, money, time, market, land office, dialogs
    net.ts         talks to /api; optimistic local apply, server confirms
api/             Vercel Functions (Web Request/Response handlers)
  session.ts       create guest player / restore from recovery code
  state.ts         load save
  act.ts           apply a batch of actions through shared/rules.ts, persist
  lib/store.ts     storage: Upstash Redis REST in prod, JSON files in .data/ for local dev
scripts/
  shots.mjs      headless real-Chrome screenshots + smoke checks (Playwright)
tests/           vitest: world gen determinism, rules, economy, land values, save migrations
```

**Local dev:** `npm run dev` = Vite with a tiny plugin that routes `/api/*` to the same handlers,
using the file store. No Vercel login needed to build and test.

**Server-authoritative:** the client applies actions optimistically for feel, sends them to
`/api/act`; the server re-validates each with `shared/rules.ts` against the stored save and the
server clock, persists, and returns the accepted state. Rejected actions roll the client back.

**Saves:** a player = `{ id, recoveryCode, money, inventory, plotsOwned, loans, bulls, blockDiffs, crops, soil, stats, version }`.
Block edits are stored as diffs from the seeded world. Crops grow from timestamps, so they grow while you're away.

**Accounts (v1):** guest account created automatically, plus a **recovery code** to continue on
another device. Google sign-in is a v2 item.

## 4. The world (v1)
- 192 × 192 blocks, 48 tall, chunks of 16 × 16 × 48. Seeded, deterministic.
- A river along one side, a village square with a temple, the trader, the seed shop, the land office,
  the cooperative bank; a road to the **town market** at the far edge; wells; neem and banyan trees.
- **16 farm plots** of different sizes, soils and water access; the player starts owning one small plot.

## 5. Milestones (the loop works top to bottom)

### M0 · Scaffold
- [x] Vite + TS + Three.js app boots to a canvas; `tsc` clean. *Done when:* `npm run build` passes.
- [x] Vitest runs; one passing test. *Done when:* `npm test` green.
- [x] `scripts/shots.mjs` opens the app in headless Chrome, waits for a ready flag, saves screenshots, fails on page errors.
- [x] `/api/*` dev routing via Vite plugin + file store; `GET /api/health` returns ok.
- [x] README with how to run.

### M1 · World you can see
- [x] Block registry (≥ 20 blocks: grass, black soil, tilled soil, wet soil, dirt, stone, sand, water, wood, leaves, planks, thatch, whitewash, brick, gravel road, fence…).
- [x] Procedural texture atlas drawn on a canvas (pixel-art style, warm palette), no external images.
- [x] Seeded terrain: gentle hills, river, black-soil plains, roads; unit test: same seed → same world.
- [x] Chunk mesher with face culling (in a web worker), transparent pass for water/leaves.
- [x] Sky, sun, hemisphere light, fog, toon-ish lighting; day–night cycle with golden hour.
- [x] Trees (neem / banyan-like), village buildings as generated structures.
- [x] *Done when:* screenshots at noon and sunset look warm and readable, 60 fps on the test machine.

### M2 · Walking and building
- [x] First-person controls with pointer lock, WASD, jump, sprint; AABB collision with blocks.
- [x] Voxel raycast (DDA) with a block outline; dig (left click) and place (right click).
- [x] Hotbar (1–9, mouse wheel) with tools and blocks; crosshair; FPS/coords debug toggle (F3).
- [x] Chunk remesh on edit is instant (< 16 ms for one chunk).
- [x] *Done when:* scripted headless test digs and places a block and the screenshot shows it.

### M3 · Farming
- [x] Crops: jowar, onion, sugarcane (v1), with seasons, growth days, water need, yield; unit tests.
- [x] Hoe tills grass/soil → tilled; seeds plant on tilled; watering can makes soil wet (dries over time).
- [x] Crop rendering: cross-plane sprites with 4 growth stages.
- [x] Growth from timestamps (server clock), watered-ness affects speed/yield; soil quality per block.
- [x] Harvest ripe crops into inventory; replant loop.
- [x] *Done when:* a scripted test tills, plants, fast-forwards time (dev-only), harvests, inventory shows produce.

### M4 · Server, accounts, saves
- [x] Store interface; file store (dev) and Upstash REST store (prod) with the same tests.
- [x] `POST /api/session` creates a guest + recovery code; restore by code.
- [x] `GET /api/state` returns the save; `POST /api/act` validates a batch via `shared/rules.ts`.
- [x] Rules reject: planting without seeds, harvesting unripe, editing plots you don't own, selling what you don't have, spending money you don't have.
- [x] Client: optimistic apply, server confirm, rollback on reject; autosave; "saved" indicator.
- [x] *Done when:* reload the page → same world edits, crops, money; a tampered client request is rejected (test).

### M5 · Economy
- [x] Daily prices per crop from a seeded model: seasonal base, monsoon effect, random walk, occasional events (glut / shortage).
- [x] Village trader (sell now, lower price) and seed & tool shop; UI panels opened by walking up to NPC stalls.
- [x] Market board with a 14-day price chart.
- [x] Costs: seeds, tools, building blocks, bull fodder; a daily ledger showing income, costs and profit.
- [x] *Done when:* unit tests pin the price model; buying and selling round-trips correctly through the server.

### M6 · Land market
- [x] Plot boundaries (fences, corner stones), "For Sale" signs, a map screen.
- [x] Plot value model: area, soil, water access, road access, improvements, crops standing; unit tests.
- [x] Land office: view plots, buy for-sale plots, list your plot, delist; NPC buyers make offers over game days.
- [x] Ownership enforced by the server for editing and farming.
- [x] *Done when:* buy a plot → farm it → list it → accept an offer → money and ownership change, all server-validated.

### M7 · Bulls and the cart
- [x] Voxel bull pair model + simple animation; bulls follow you; feed them; stamina and mood.
- [x] Plough with bulls: till a whole row in one pass (faster than the hoe).
- [x] Bullock cart: load produce, ride the road to the town market; town price premium; the sunset ride.
- [x] *Done when:* a cart trip sells at the town price and the premium is visible in the ledger.

### M8 · Money tools and progression
- [ ] Cooperative bank loan (low rate, limit by land owned) and moneylender (fast, high rate); repayment; missed-payment penalty.
- [ ] Godown storage: hold produce, sell later.
- [ ] Titles: Small farmer → Kisan → Bada Kisan → Zamindar (by net worth).
- [ ] *Done when:* tests cover interest and repayment; titles update on net worth.

### M9 · Polish and ship
- [ ] Title screen, first-time tutorial prompts, settings (mouse sensitivity, render distance, audio).
- [ ] Synthesized sound: footsteps, dig, place, till, water, harvest, cash, bulls' bells, ambience (birds, crickets).
- [ ] Performance pass: draw calls, memory, 60 fps; mobile shows a friendly "play on a computer" note.
- [ ] Deploy to Vercel with Upstash; custom domain `bailgaadi.gajananrathod.in`; production smoke test.
- [ ] *Done when:* a new player can go from title screen to first profit on the live site, and the save survives a reload.

## 6. Not in v1 (on purpose)
Multiplayer shared district, Google sign-in, more crops and buildings, processing units, festivals (Bail Pola), mobile controls.

## 7. Progress log
_(one line per loop iteration: date · task · how it was verified · commit)_

- 2026-09-24 · M0 scaffold · `tsc` clean, vitest 1/1, `vite build` ok, `/api/health` → FileStore ok, headless Chrome screenshot shows a lit WebGL cube, no page errors
- 2026-09-24 · M1 world · 27 blocks, canvas atlas, seeded world (6 vitest: determinism, 16 non-overlapping plots, one starter, river water, spawn), worker mesher with AO (0.8 ms/chunk, whole world 0.1–0.3 s), sky + day–night; screenshots at noon / golden hour / 5 views looked at and fixed (market pit, river framing, map edge ring, soil and sunset tone); 60 fps (16.6 ms median, p95 17.6 ms, 270 draw calls worst view)
- 2026-09-24 · M2 walking and building · 5 new vitest (landing, no tunnelling from y 47, wall stop, 1.25-block jump, DDA faces); scripted headless play: walked 3 blocks, jumped 1.25, dug a 3-block trench in the road and stacked bricks (screenshots m2-before/after/wide looked at), swam out of the river onto the bank, outline visible; edit → new geometry 1.3–2.5 ms; outline strengthened after first look
- 2026-09-24 · M3 farming · shared/time + crops + save + rules (the same code the server will run), 8 new vitest (clock/seasons, wet/dry growth integration is sample-independent, yield, till→plant→water→harvest, cheating refusals, refill/uproot, soil wear + rest); scripted headless run (scripts/m3.js) tilled 12 cells, sowed 3 crops, watered with 13 can refills at the well, fast-forwarded ~5 game days, harvested 24 jowar / 20 onion / 28 sugarcane, unripe refused; screenshots sown/growing/ripe/close-up/harvested looked at. Fixed on the way: client was drawing into the pristine world array (harvested plants reappeared), plants had full-cell hitboxes (now slim, stage-height), unripe left-click uprooted (now just reports %), well water unreachable (refill counts water within 2 blocks), jowar head redrawn, repeated toasts collapse. Edits are now limited to land you own.
- 2026-09-24 · M4 server, accounts, saves · /api/session (guest + recovery code, restore), /api/state, /api/act (batch ≤ 256, shared rules on the server clock), /api/dev (fast-forward, dev only, 404 on Vercel); tokens stored as sha256; 8 new vitest (store contract run against memory, file and an Upstash REST fake; accounts; persistence; tampered batch all refused; seed-limit enforced server-side; server clock); scripts/m4.mjs 14/14 in headless Chrome: farm → raw tampered requests refused → devtools seed cheat rolled back 6→4 → reload restores same code/inventory/11 cells/brick/crops → second device restores by typed code; screenshots looked at (spawn now faces up the road; placeholder casing). Real Upstash is exercised at deploy (M9).
- 2026-09-24 · M5 economy · shared/economy (mandi price = base × season scarcity × monsoon × exact mean-reverting walk × glut/shortage events; village 0.85×, town 1.1×), shop catalog, save v2 (ledger, money stats, blocks now cost and are returned when dug; v1 migration), Ganpat and Sakharam as voxel NPCs with E-to-trade panels (Sell / Prices 14-day SVG chart / Ledger; Buy with sections); 12 new vitest (pinned price snapshot, band, seasonality, event rate, buyer ordering, trade rules, 14-day ledger pruning, migration, server round trip, exact ripening); scripts/m5.js: grew onions → sold 12 via the panel (+₹70) → bought seeds & bricks (−₹100) → server money 470 = local, ledger 3 lines; screenshots trader/sell/prices/ledger/shop looked at. Fixed: crops could stall at 99.99…% (float) and never ripen; shop panel overlapped hotbar; E-hint overlapped toasts.
- 2026-09-24 · M6 land market · shared/land (value = area × soil × water × road × slow land mood + tilled + buildings + standing crops; rotating weekly for-sale list with asking premium; deterministic NPC offers from 8 named buyers, likelier near value, never above ask, 2-day expiry), save v3 listings, rules buyPlot/listPlot/delist/acceptOffer (keep ≥ 1 field; sold land is cleared), Talathi NPC + land office panel (Plots with soil/water/road bars, Your land with valuation breakdown, list/delist/accept), "FOR SALE"/"Listed" boards at plot gates, M map with ownership colours and prices, plot-entry toasts; 8 new vitest (pinned values, monotonic factors, mood band, improvements, offer behaviour, weekly market, full buy→farm→list→offer→accept, land tricks refused); scripts/m6.js: bought Pimpalwadi ₹32,500 → farmed 5 cells → listed ₹30,900 → offer from Kulkarni sheth after 4 days → accepted, server/local money 58,900, ownership and field gone; screenshots office/plots/sign/offer/map looked at. Fixed: sign post crossed the lettering; map village labels piled up / ghat clipped.
- 2026-09-24 · M7 bulls and the cart · shared/bulls (stamina and mood integrated from timestamps: hungry after a day, rest restores), save v4 (bulls, trip), shop section "Bulls & cart" (pair ₹4,500, cart ₹2,800, plough ₹900, kadba ₹10), rules feed / plough (8-block row, 2 stamina each, stops at your fence) / startTrip (≤ 200, 20 stamina) / sellTown (only after the 20 s road, town price 1.1× vs village 0.85×, ledger lines carry the premium); voxel Khillari pair (painted horns, jhool, bells, yoke, gait animation), spoked cart that parks tipped on its shafts, A* road pathing, the ride (view turns with the cart), Haribhau the mandi agent, R / F keys, bull status chip; 7 new vitest; scripts/m7.js: bought pair+cart+plough → ploughed 8 in one pass → sowed, watered, grew 24 onions → fed the sulking pair → loaded → ~25 s ride east → sold ₹226 at the town mandi, ledger "+₹53 town premium", server = local ₹4,426; screenshots bulls/plough/cart/load/ride/town/sold/ledger looked at. Fixed: plough silently fell back to the hoe while the pair was still walking up, parked cart tipped the wrong way, ride camera sat in a bull's blanket and did not turn with the road, arrival faced the wrong way, ledger lower-cased names.
