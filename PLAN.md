# Tanda (उखळी तांडा · Ukhali Tanda) — v1 plan  _(formerly "Bailgaadi"; the repo folder keeps that name)_

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

### M2 · Walking and building *(block digging/building later retired by the visual change — see C4)*
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
- [x] Cooperative bank loan (low rate, limit by land owned) and moneylender (fast, high rate); repayment; missed-payment penalty.
- [x] Godown storage: hold produce, sell later.
- [x] Titles: Small farmer → Kisan → Bada Kisan → Zamindar (by net worth).
- [x] *Done when:* tests cover interest and repayment; titles update on net worth.

### ⟶ Visual direction change (2026-09-24, from the user)
The game must look **cinematic and real** — like the Ghibli-style bike game the user shared — not
blocky Minecraft. "Minecraft" meant the open gameplay (farm, sell, buy and sell land), not the art.
Everything under `src/shared` (rules, server, economy, land, bulls, loans, saves) stays; the voxel
renderer, pixel atlas, block models and first-person-only camera are replaced. No digging or block
building: real farming only. Camera: third-person by default, **V** toggles first-person.

### C1 · Land, light and the farmer
- [x] Smooth terrain mesh from the world's height field (plots exactly flat), procedural ground shader (grass, black soil, red soil, dirt roads, river banks), detail noise, slope shading.
- [x] River water shader (sky-tinted, fresnel, moving ripples, soft shoreline).
- [x] Sky: painterly gradient dome, soft sun, drifting billboard clouds; ACES tone mapping, bloom, colour grade + vignette; soft sun shadows around the player.
- [x] A farmer model (kurta, dhoti, pheta) with procedural walk/idle; third-person spring camera that avoids the ground; **V** first-person; collision with terrain.
- [x] *Done when:* golden-hour and noon screenshots look cinematic (painterly light, depth, no blocks), 60 fps.

### C2 · Living landscape
- [x] GPU-instanced grass with wind (dense near the player, fading out), wildflowers, marigolds.
- [x] Neem and banyan trees (trunks, clustered canopies, wind sway), bushes, rocks.
- [x] *Done when:* the fields-and-village views read as a painted Deccan landscape.

### C3 · The village, modelled
- [x] Whitewashed houses with Mangalore-tile roofs and verandahs, the temple with its shikhara and flag, stalls with cloth awnings, the well, the bank, the land office, the town mandi; fences and gates around plots; colliders.
- [x] Villagers as proper figures (same rig as the farmer) at their stalls.
- [x] *Done when:* the square, market and a plot gate look like a Maharashtra village street.

### C4 · Fields and crops
- [x] Field cells on the plot grid: ploughed furrows, darker when watered; soft highlight of the aimed cell (third- and first-person).
- [x] Real-looking jowar, onion and sugarcane in four growth stages (instanced), swaying.
- [x] Rules: dig/place retired; till/plough/sow/water/harvest unchanged; HUD hotbar is tools and seeds only.
- [x] *Done when:* the M3 farming script passes with the new targeting and the screenshots look like a real field.

### C5 · Bulls, cart and the ride
- [x] Smooth Khillari bull pair (painted horns, jhool, bells) and a wooden bailgaadi with spoked wheels; walk cycle; the ride with a cinematic follow camera.
- [x] For-sale boards, NPC panels, map and every earlier script (M4–M8) adapted and passing.
- [x] *Done when:* the sunset cart ride screenshot looks like a film still.

### C6 · Performance
- [x] 60 fps on a normal laptop: instancing, LOD, shadow budget, draw calls; render-distance setting drives grass and fog.

### M9 · Polish and ship
- [x] Title screen, first-time tutorial prompts, settings (mouse sensitivity, render distance, audio).
- [x] Synthesized sound: footsteps, dig, place, till, water, harvest, cash, bulls' bells, ambience (birds, crickets).
- [x] Performance pass: draw calls, memory, 60 fps; mobile shows a friendly "play on a computer" note.
- [ ] Deploy to Vercel with Upstash; custom domain `bailgaadi.gajananrathod.in`; production smoke test.
- [ ] *Done when:* a new player can go from title screen to first profit on the live site, and the save survives a reload.

### U · UX pass (from the UX review, 2026-09-25)
Source: the Tanda UX Review (a new-player audit on desktop and phone, set against 20 games). One task at a
time: build it, test it (unit tests where there is logic, `tsc`, build, a scripted play-through, screenshots
looked at), tick it, log it, commit. Push once at the end.

- [x] **U1 · Teach every step.** Mission 2 gains "Sow 6 onions" and "Water them" before the harvest (old saves that already harvested count them done); the current objective shows a one-line "how" with the key or button; the dead "Getting started" card code goes (it was already hidden); the welcome card becomes one line and a button. *Done when:* the mission card walks a new player from the title to the first sale one step at a time; the missions test covers the new objectives and old saves.
- [x] **U2 · Quiet HUD.** One compact cluster: money, a small sun-dial time, season/day; "saved" only while saving or offline; the crop/fish counts only while you carry something; the kaam list starts folded to a count chip and only appears after Mission 1. *Done when:* the first second of play shows the mission card, the cluster and the hotbar only (screenshot), and everything reappears when relevant.
- [x] **U3 · Smart action.** Slot 1 (the hand) becomes "smart": right-click / Use does what the aimed tile needs (plough → sow the last or chosen seed → water → harvest; fill at water). The tip names the action. On phones the Use button is labelled with that action and the separate Harvest button shows only when it's needed (kabaddi tag). Explicit tools still work. *Done when:* a play script ploughs, sows, waters and harvests a tile with only the hand selected, on desktop and phone.
- [x] **U4 · Hold to work a row.** Holding right-click / Use and walking applies the action to each new tile you aim at (about 8 a second); repeats stay quiet (no error spam). *Done when:* a script waters and harvests a row of 10 tiles in one hold.
- [x] **U5 · Selling in one tap.** Village prices in whole rupees; a "Sell everything for ₹X" button (produce and fish); the reason for a price move (glut/shortage) beside the arrow. *Done when:* unit tests pin whole-rupee prices; a script sells a mixed load in one click and the server agrees. (Pausing the clock in shops is left out: the clock is shared real time the server checks, and a pause would be a time exploit.)
- [x] **U6 · Visible payoff.** "+14 jowar" floats from the crop to the counts; "+₹450" counts up into the money; first harvest and first sale get a small celebration. HTML/CSS only. *Done when:* screenshots show the floaters; no measurable frame cost.
- [x] **U7 · End of day and while-you-were-away.** Sleeping shows the day's summary (earnings by source, costs, loans due, tomorrow's best price); returning after a while shows what's ripe or dry, today's best price and open kaam. *Done when:* scripts see both cards with correct figures.
- [x] **U8 · A message log.** Toasts are also kept in a "recent" list (last 30, with game times) you can open from a small bell chip; important ones (mission steps, money) play a sound. *Done when:* a missed toast can be read again on desktop and phone.
- [x] **U9 · A map you can use.** Click or tap a place (a landmark, a field, a neighbour) to set a blue waypoint that the marker and arrow guide you to; village labels no longer pile up; your ripe fields are marked; full screen on phones. *Done when:* a script sets a waypoint from the map and the arrow points to it; screenshots look clean.
- [x] **U10 · Ready-to-hand-over marker.** A neighbour's "!" turns into a green ✓ when you already carry what they asked for (or Chinki is following you, or you hold their tiffin). *Done when:* a script sees the ✓ appear after picking up the goods.
- [x] **U11 · Phone controls.** A floating joystick where the left thumb lands; 48 px hotbar slots; the objective arrow kept clear of the thumbs; a UI size setting (100/125/150%). *Done when:* the phone script passes at all three sizes and screenshots look right.
- [x] **U12 · Marathi and Hindi (first pass).** A language choice on the title screen (English · मराठी · हिन्दी) for the title screen, HUD, hotbar, field tips, action hints, the kaam list, the help card and settings; Devanagari set larger. Story dialogue stays English for now. *Done when:* each language renders on desktop and phone with no English left in those parts.
- [x] **U13 · Sound as information.** A temple bell at dusk before the shops close, a rooster at dawn, a chime when one of your crops ripens nearby; at night the "sleep" hint beats a closed-shop notice. *Done when:* the audio self-test covers the new sounds and a night script sees the sleep hint by a closed stall.
- [x] **U14 · Gentle minigames.** Settings: "Easy fishing" (a gentler fight, no snapping); a warning sound as a surge begins; a one-time picture card the first time you fish and play kabaddi; hold to tag/tackle in kabaddi without the missed-dive stumble. *Done when:* the reel test covers easy mode and scripts see the cards once.
- [x] **U15 · A picture of the controls.** The help card shows a drawn keyboard with the keys that matter (or the phone layout on touch), not a list of 30. *Done when:* screenshots of both.
- [x] **U16 · Not by colour alone, and less motion.** Ripe crops in your fields get a small bobbing marker (one instanced draw); a "reduce motion" setting turns off confetti, shakes and bobbing. *Done when:* screenshots show the markers; the setting removes them.
- [x] **U17 · Measure it.** Vercel Analytics events: started, first harvest, first sale, mission done, returned next day. *Done when:* events fire in a script (dev mode logs them).

### F · Play-test fixes (reported 2026-09-25)
Loop: fix, test with a script and screenshots, tick, log, commit; push at the end.
- [x] **F1 · The cart card can always go somewhere.** When the bulls are sulking or tired, the card says so by the button and offers "Feed them" (using your kadba), or tells you where to buy kadba; Set off is disabled with the reason until they can go.
- [x] **F2 · E continues a story card.** Single-button cards take E, Enter, Space or a click; choice cards take 1/2/3; the footer says so. A held key doesn't skip the card it opened.
- [x] **F3 · The kaam list opens from the keyboard.** K opens and folds it (the chip shows "K"); it starts open the first time it appears; a phone taps it as before.
- [x] **F4 · A drip set installs itself.** Buying one installs it on the field you're standing in, or else your first field without drip, and says which; the Your land tab still moves the spare ones.
- [x] **F5 · People you can talk to.** No neighbour stands in a shop doorway (Tulsa aaji was at the bank door); E and the hint go to whoever is nearest, a neighbour or a stall; the neighbours by the well, the mandir and the banyan say Ram Ram.
- [ ] **F6 · Up the tanki.** A proper ladder outside the bowl, with a safety cage and a landing; E at its foot climbs up, you sit on the rim looking over the tanda, and moving climbs back down.
- [ ] **F7 · Sit with your friends.** E by the fire sits you in the circle (the chai and +1 once a night); moving stands you up; the hint changes once you're sitting and once tonight's visit is done.
- [ ] **F8 · Offerings stop at the count.** Offering and delivery buttons show what's still needed and become "Given ✓" once the objective is met; the rules refuse to take more than is asked (Sitabai's 20, the mandir's 10 and 10); "Join the gathering" says ✓ once joined.

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
- 2026-09-24 · M8 money tools · shared/bank: loans (bank 1%/day, 8-day term, limit 40% of land; sahukar 5%/day, 4 days, ₹3,000 + 15% of land; late = one-off fee + double rate; no new loans while overdue; max 3 per lender), carry limit 200 + godown (2,000, ₹0.1/unit/day rent on withdrawal, weighted-average lot date), net worth (cash + valued land + produce anywhere + resale of bulls/cart/tools − debt), titles Small farmer → Kisan 25k → Bada Kisan 100k → Zamindar 400k confirmed server-side in /api/act (bestTitle); save v5; Joshi saheb at the bank (Loans / Godown / Your worth), Sahukar Motilal under the banyan; ledger lists loans without counting them as income or cost; HUD title + "loan overdue!"; 11 new vitest (interest on time and late, both lenders, limits, defaulter lockout, junk, godown rent + averaging, full sacks, net worth, titles, migration); scripts/m8.js: borrowed ₹4,800 (bank max) + ₹1,000 → stored 18 onions → ₹2 rent → both loans overdue, bank refuses, HUD warns → repaid all → Kisan → Bada Kisan toasts, server bestTitle 2, money 109,072 = local; screenshots bank/sahukar/godown/overdue/worth/title looked at. Fixed: ground height stood NPCs and bulls on tree canopies; the pause panel covered hints and toasts.
- 2026-09-24 · M9 (partial, uncommitted work saved): title screen with orbit, settings (sensitivity, render distance, volume), first-time tutorial, phone note, synthesized WebAudio sounds (16, offline-rendered self-test all non-silent), api/lib → api/_lib for Vercel. Then the user redirected the visuals: cinematic, not Minecraft → milestones C1–C6 added before M9.
- 2026-09-24 · C1–C6 cinematic rebuild (the user's direction) · smooth blurred heightfield terrain with painterly ground shader, river shader (depth tint, fresnel, ripples), painted cloud sprites, soft PCF sun shadows following the player, ACES + bloom + warm/cool grade + vignette; a modelled farmer (kurta, dhoti, pheta) with walk cycle, third-person spring camera and V for first person; instanced wind grass (34 blades/block, player parts it, marigold/white flowers, dry-gold patches); procedural neem/banyan trees with swaying soft canopies and aerial roots; the village modelled (plastered/brick houses, tile/thatch hip roofs, verandahs, stalls with awnings and produce, temple shikhara + kalash + flag, well with pulley, haystacks, split-rail fences); ridged furrows and modelled jowar/onion/sugarcane in 4 stages; rounded Khillari bulls and spoked bailgaadi with a filmed ride; painted SVG hotbar; voxel mesher now draws nothing (voxels kept for collision and rules). Verified: 66 vitest, build, m4 13/13, m3/m5/m6/m7/m8 scripts error-free, ~60 fps (16.6 ms median, p95 18.5) at ~300 draw calls / 1.5 M tris; screenshots of spawn, noon, square, market, fields, crops, bulls, ride, sign, HUD looked at and fixed (faceted canopies, dull light, blotchy plaster, flat soil, invisible furrows, ride camera inside the jhool).
- 2026-09-24 · M9 up to deploy · vercel.json, README deploy steps; api helpers moved to api/_lib so Vercel doesn't treat them as endpoints. Remaining: Vercel login, Upstash, domain and the live smoke test (needs the user).
- 2026-09-24 · The user's requests: renamed to **Tanda**, village **Ukhali Tanda · उखळी तांडा**; Banjara elements added (women in mirror-work ghaghra, kanchali, coin-edged odhni, bangle stacks and silver earrings; embroidered torans over doors; mirror-work stall awnings; Sevalal Maharaj mandir with white flags; Teej sprout baskets; Naik Dhavlu the headman runs land; Sitabai runs the seed shop; "Ram Ram" greetings); night: tungsten bulbs at every door and stall (emissive + a pool of 8 point lights on the nearest ones) and a hand torch (T, spotlight that also lights the grass shader). Screenshots of the square at night, torch, women and Sitabai looked at; fixed an inside-out skirt and the well pit. Domain now tanda.gajananrathod.in.
- 2026-09-24 · The user's requests: (1) a living tanda: villagers hoe and tend neighbours' fields (those fields grow their own crops), women carry matkas from the well, people walk the real roads, children play in the chowk; work poses and props on the figure rig. (2) The real Ukhali map: roads and lanes from OpenStreetMap, fields, village extent, red scrub and the field vihir placed from satellite imagery; ~4.2 m per block; the Jalna road runs north and the town mandi sits at its west end; 41 houses fill the gaothan; river removed (village well + vihir). (3) Easier to follow: a welcome card, an 11-step goal chain, a golden world marker with distance arrow, H help card, plain-language tips. Verified: 66 vitest, build, m4 13/13, m3/m5/m6/m7/m8 error-free; screenshots of the map, village, lanes, working fields, ride and guide looked at. Fixed: nearest-stall selection (the Naik's door is next to Ganpat's stall), starter keeps the name Aamrai.

---
- 2026-09-25 · F1 the cart card can always go somewhere · When Sarja and Raja are sulking or too tired, a box above the load table says so and offers "Feed them kadba" (with your count), or says where to buy kadba; Set off reads "Feed them first to set off" and is disabled until they can go. Verified: tsc, scripts/fix/f1.js (no fodder: reason + where to buy, button disabled; with fodder: Feed button; after feeding the box goes), screenshots looked at.
- 2026-09-25 · F2 E continues a story card · Single-button cards take E as well as Enter, Space or a click; cards with choices show 1, 2… on their buttons and take the number keys; the footer says which ("E or Enter to continue" / "Press 1–2 to choose", translated; none on phones). A key held or repeating from opening the card is ignored for 250 ms. Verified: tsc, scripts/fix/f2.js (story card closed by E; Kashibai's card by E; Bhimrao's two-choice card ignores E and closes on 2), screenshots looked at.
- 2026-09-25 · F3 the kaam list opens from the keyboard · K opens and folds it (a K key cap on its header; K is in the help picture and list); it starts open the first time and remembers your choice; a tap still toggles it on a phone. Verified: tsc, scripts/fix/f3.js (starts open, K folds and saves "0", K opens), screenshots looked at.
- 2026-09-25 · F4 a drip set installs itself · Buying one at Sitabai's installs it at once on the field of yours you were last in (else your first field without drip) and says which; if every field has drip it waits in your things with a note. A set bought earlier and never installed (a play-tester's friend) goes in when you enter the village. Verified: tsc, scripts/fix/f4.js (bought → installed on Aamrai, planted cell watered for good, server "saved"), and the spare-set path (inv 1 → 0, drip [9], server saved).
- 2026-09-25 · F5 people you can talk to · Tulsa aaji stood in the bank's doorway (her spot was "the house door nearest south of the chowk", and the bank is a house): shop doors are now left out. Joshi saheb stood inside the bank's wall; he's beside the door now. The sahukar's counter was 6 m from him, by the well; it's in front of him. E and the hint go to whoever is nearest, a neighbour with kaam (within reach) or a stall; the four neighbours at the well, the mandir and the banyan have names and say Ram Ram (a line a day, translated prompt). Verified: tsc, scripts/fix/f5.js (bank door → bank; well → "Say Ram Ram to Gangubai" and her card; sahukar counter in front of him), screenshots looked at.

## 8. Missions (proposed · v1.1)
A 10-mission story arc for Ukhali Tanda. It replaces the flat goal chain, and each mission teaches one system.
The server checks missions like everything else: progress comes from the save, and rewards are granted by
`rules.ts`. Missions run one at a time, and each has a story card, 2–4 objectives, and a reward.

| # | Mission | Story | Objectives | New system | Reward |
|---|---|---|---|---|---|
| 1 | **Ghar Wapsi** (Homecoming) | You return to the tanda. Naik Dhavlu meets you at the chowk and walks you to Aamrai. | Talk to the Naik · walk to Aamrai · clear the weeds · plough 6 patches | talking to NPCs with dialogue | ₹200 + onion seeds |
| 2 | **Pehli Fasal** (First crop) | Your first onions. Ganpat Seth offers a low price. | Sow and water 6 onions · harvest · check the Prices tab · sell when the price is above ₹7 | haggling, a lowball first offer | Sickle (faster harvest) |
| 3 | **Vihir ka Paani** (Water) | Summer: the village well is running low and there's a queue. | Fetch water from the vihir in the fields · keep 8 crops watered through 2 days | well water level, the far well, wilting | Brass can |
| 4 | **Sitabai ki Maang** (Sitabai's order) | Sitabai needs 20 jowar for the tanda's Teej feast, due in 3 days. | Grow and deliver 20 jowar before the deadline | delivery orders with deadlines | Seed discount + reputation |
| 5 | **Sarja aur Raja** | A Khillari pair is for sale. You need ₹4,500. | Raise the money (bank loan or the sahukar, your choice) · buy the bulls · feed them · plough a row | choices with consequences (the sahukar's interest) | Plough |
| 6 | **Teej** | The festival: girls of the tanda grow wheat sprouts in baskets, and there's singing and dancing at night. | Deliver marigolds and sprouts to the mandir · light the bulbs · join the night gathering | festivals, reputation, night event | Reputation ★, mirror-work jhool |
| 7 | **Tandyacha Karwan** (The caravan) | The old Banjara way: take a full cart to the Jalna mandi before it closes at 2 pm. A glut is coming. | Load 50+ produce · ride before 2 pm · sell above the village price | timed trip, market events | Town-trader contact (better prices) |
| 8 | **Sahukarache Karz** (The moneylender's debt) | Motilal threatens a neighbour's family field over a debt. | Choose: lend them money, harvest their field for them, or refuse | village relationships, moral choice | Reputation or cash, plus a different ending line |
| 9 | **Zameen ka Sauda** (The land deal) | The Naik tells you the field by the vihir will go up for sale. Deshmukh saheb wants it too. | Save ₹25,000 in 6 days · win the bidding at the kacheri | auctions against a rival | Second field |
| 10 | **Gram Panchayat Nivadnuk** (the election) | Shankar Pawar (the sahukar's money, a road, envelopes) vs Kamlabai Jadhav (taps from the tanki, a teacher for the Z.P. school) | Hear both · gram sabha at the school · decide · vote | village politics, choices with lasting effects | Sarpanch / drip subsidy / ₹2,000 |
| 11 | **Bail Pola** | The bull festival: paint Sarja and Raja's horns, dress them, lead the procession. | Keep the bulls happy for 3 days · decorate them · win the procession | bull care score, cosmetics, finale | Title **Bada Kisan** + credits |

**Systems to build:** mission engine (shared + server), NPC dialogue cards, reputation (★ with the tanda), deadlines,
delivery orders, choices saved in the save, festival events (Teej and Pola decorations in the world), a sickle,
well water levels, an auction, and bull decoration.
**Order of work:** engine + missions 1–3 → 4–6 → 7–10, each verified by a scripted play-through.
- 2026-09-24 · Missions + physics + modern village (the user's requests) · shared/missions.ts: 10 missions checked against save counters with per-mission baselines, deadline restarts, choices, perks (sickle, discount, townContact, polaChampion), reputation (better village prices); new actions talk/visit/deliver/choose/claimMission/decorate/installDrip, all server-validated; story dialogues, checklist card, markers per objective; mandir offering panel, Sitabai's order, Pola procession with gulal. Physics: villagers route with A* over a walkability grid (houses, fences, wells, stalls, trunks, pump sheds), circle separation for everyone including you, a camera that won't look through walls, level ground at wells, an open clearing where women draw water. Modern tanda: concrete poles with sagging wires and street lamps, brick pump houses with motors gushing into tanks and field channels, drip irrigation (buy ₹6,000, install on a field: always watered; a third of neighbours' fields have it too). Save v7: farms from the old map are moved onto the new Aamrai (the user's bug: an old save still owned plot 5). Verified: 70 vitest (full 10-mission play-through), build, m4 13/13, m3/m5/m6/m7/m8/missions scripts pass; screenshots of dialogues, card, well, pump, poles, drip looked at.
- 2026-09-24 · The user's requests: school ↔ Hanuman mandir swapped; the tanki moved halfway up the tekdi onto a slightly lower terrace; the hero is a modern boy back from the city (checked shirt over a tee, jeans, white sneakers, watch, backpack, short hair); new mission 10 'Gram Panchayat Nivadnuk': two candidates at the Z.P. school with campaign posters (only during the election), a daytime gram sabha, three choices (back Kamlabai → drip sets 50% off, +15★; Shankar's envelope → +₹2,000, −15★, the sahukar lends more at 20% higher rates; stand yourself with ★50 and a ₹1,000 deposit → Sarpanch, shown in the HUD), one vote at the booth. Verified: 71 vitest (every election path), build, all scripts incl. new scripts/election.js (became Sarpanch through the UI); screenshots looked at.
- 2026-09-24 · Supabase + leaderboard (the user's choice: keep the Vercel functions as the rule-checking layer, no forced sign-up) · SupabaseStore over PostgREST with the service key (tables kv + leaderboard + accounts, RLS on with no policies: supabase/schema.sql); versioned saves (rev) with load→apply→compare-and-set→replay in updateSave, so two devices at once never lose moves; Upstash dropped; leaderboard published after every accepted move, GET /api/leaderboard (top 20 with shared ranks, your rank, no ids or secrets); optional names via a server-validated setName (any script, 2–20 chars); Leaderboard on the title screen and L in game. Verified: 79 vitest (the store contract runs on memory, file and a fake PostgREST; concurrent acts from two devices; names; ranks), build, all play scripts; screenshots looked at.
- 2026-09-25 · Pastimes to fill the waiting time (the user's request) · the kabaddi maidan cut level into the tekdi's foot behind the Z.P. school, and past it the Ukhali talav in a hollow held by an earthen bund (world gen runs after the trees, so the rest of the village keeps its trees); shared/jobs.ts: three kaam a day for everyone (produce, fish, water for Tulsa aaji, a tiffin to Pawar guruji, Chinki the lost goat), paid above the trader's price with ★; shared/fish.ts: five fish (chilapi to the rare maral), the bite decided by the save's id and cast count, 12 casts a day, a gal at Sitabai's, Ganpat buys fish; kabaddi: five raids each against the Hanuman Club (breath, tags, bonus line, lona; defenders back off and cut off the way home, lunge when you turn; tackle their raider, a missed dive stumbles you), ₹101 for the day's first win; new actions job/fish/sellFish/kabaddi, all server-checked; the talav's own water sheet clipped to its ellipse, the walker wades at the talav's level. Fixed on the way: on phones the hint button called empty handlers (bound before the game set them) and sat under the look pad. Verified: 100 vitest (pastimes + a reel model tested with a 0.25 s human reaction lag: careful play lands every fish, holding through surges snaps the line), tsc, scripts/pastimes.js and scripts/kabaddi.js (a bot's matches ended 4–6, 9–3, 5–5; server save = local), m3/m5/m7/night/missions/election re-run clean, a phone-sized run (cast by the hint, strike by the button, the kaam chip, a match); 60 fps at the maidan (+129 draw calls there, +28 at the chowk); screenshots of the maidan, talav, a job, the goat, a cast, a bite, the reel, the catch, a raid and defence looked at and fixed (water spilling over the bund, rod pointing straight up, the camera hiding the rod, a too-easy match, the scoreboard running ahead, overlays under the phone's look pad).
- 2026-09-25 · U1 teach every step · Mission 2 gains "Sow 6 onions" and "Water them" (a `plant:<crop>` counter; saves that already harvested count them done), every early objective has a "how" line (phone wording on touch, shown even on the folded phone card), the welcome card is one line, the hidden "Getting started" card code is gone. Verified: 102 vitest (new: sow/water order, how lines, old saves), tsc, scripts/ux/u1.js on desktop and phone (card text at each step; server counters plant 6 / water 6), screenshots looked at.
- 2026-09-25 · U2 quiet HUD · the info chip is title, money, ★, a sun-dial clock and "Kharif · 6/8"; "saved" shows only while saving or offline; the produce chip shows only what you carry (fish too), and on phones a 🧺 count joins the info chip; the kaam list appears after Mission 1, folded to a chip that remembers being opened. Verified: tsc, scripts/ux/u2.js on desktop and phone (first second: no kaam, no counts; after Mission 1: kaam chip; carrying: counts), screenshots looked at.
- 2026-09-25 · U3 smart action · the hand (slot 1) does what the aimed tile needs: plough → sow (last seed, else onion/jowar/sugarcane) → water → harvest, fill at water; a ripe crop is harvested with any tool; the tip and (on phones) the Use button name the action, the Harvest button is gone (Use reads "Tag" in kabaddi); the farmer shows the tool he uses; mission how-lines speak of the hand. Verified: tsc, 102 vitest, scripts/ux/u3.js on desktop and phone (plough, sow, water, harvest one tile with the hand only: +8 onions, server saved), m3 (every crop harvested, none left; it now checks produce since watering rounds pick ripe crops) and missions re-run, screenshots of the phone labels looked at.
- 2026-09-25 · U4 hold to work a row · holding right-click (or Use on a phone) works every new tile you aim at, at most ~8 a second; repeats stay quiet except one "can is empty / no seeds" warning; never builds by holding; the plough and sow how-lines teach it. Verified: tsc, 102 vitest, scripts/ux/u4.js (one hold each: 12 tiles ploughed, 12 sown, 12 watered, 12 harvested = 96 onions; toasts merged "+8 onion ×12"; server saved), screenshot looked at.
- 2026-09-25 · U5 selling in one tap · stall prices are whole rupees (village and town, never below ₹1); the Sell tab opens with "Sell everything · N items for ₹X" (produce and fish, the total with your ★ bonus), and a glut/scarce tag sits beside the price arrow. The clock pause in shops was left out (the clock is shared real time the server checks). Verified: 103 vitest (whole rupees for 200 days, town above village), scripts/ux/u5.js (76 items: the button said ₹640, the sale paid ₹640, the server says ₹1,640), m5 re-run, screenshot looked at.
- 2026-09-25 · U6 visible payoff · "+8 onion" rises from the plant and flies into the counts (the 🧺 on phones), money pops "+₹72" and counts up into the purse, the chip it lands on bumps; the first harvest and the first sale each get confetti and a line. DOM/CSS only, respects reduced motion. Verified: tsc, scripts/ux/u6.js (floaters seen mid-flight, money ₹1,049 → ₹1,072 = the save, both first-time toasts, median frame 16.7 ms), screenshots looked at (money floater moved below the chip).
- 2026-09-25 · U7 end of day and while-you-were-away · shared/summary.ts: `daySummary` (income by crops/fish/kaam/kabaddi/land, costs, net) and `awaySummary` (ripe, dry and growing crops in your fields, open kaam, loans due within a day, the best price against the usual); waking shows "Good morning, Ukhali!" with yesterday and today, returning after 20+ minutes shows "Here's what's waiting". Verified: 106 vitest (new summary tests), scripts/ux/u7.js (earned ₹533 = onions ₹432 + kabaddi ₹101, spent ₹30, 6 dry, 3 kaam), night.js re-run, screenshots looked at.
- 2026-09-25 · U8 message log · every toast is also kept (last 30, repeats folded with a count, game time) in "Recent messages": a 🔔 with an unread count beside the hotbar on a computer, a button in the phone ☰ menu; it's a window like the others (Esc closes). Money and mission toasts already carry their sounds. Verified: tsc, scripts/ux/u8.js on desktop and phone (toasts faded, then read back in order), screenshot looked at.
- 2026-09-25 · U9 a map you can use · click/tap the map to pick the nearest place (a field, landmark or neighbour; else the spot) → the golden marker and arrow guide you there as "📍 …" and a blue pin shows it on the map, clearing when you arrive; dots and job circles claim their space first and labels try five spots or give way; your fields say "🌾 N ripe"; on phones the map fills the screen height with the legend beside it, and the tappable hint no longer shows over windows. Verified: tsc, scripts/ux/u9.js on desktop and phone (picked the talav → arrow "📍 Talav (fishing) · 46 m" → arrived toast → back to the mission arrow), screenshots looked at.
- 2026-09-25 · U10 ready-to-hand-over marker · the gold "!" over a neighbour becomes a green ✓ when you carry what a job needs (produce, fish, 12 pours, their tiffin, Chinki at your heels); the hint says "Give Savitribai 11 onion ✓" and the ready job comes first in the hint and the dialogue. Verified: tsc, scripts/ux/u10.js (marks ! → ✓ for the right giver once carrying; hint text), screenshot looked at.
- 2026-09-25 · U11 phone controls · touching the lower-left third brings the joystick to your thumb (it goes home when you let go); the phone hotbar is drawn at 90% (≈47–50 px slots, was 62% ≈ 32 px) with the hint raised above it; the objective arrow is kept off the goal card and the thumb controls (its whole box, not just its point); Settings → "Text and buttons": Normal / Large (and Largest on a computer; phones stop at 120% before controls collide), applied with the CSS `scale` property anchored at each element's corner. Verified: tsc, scripts/ux/u11.js on desktop and phone (floating stick walked 3.4 m and went home; 56/50 px slots; arrow off the card at the largest size), scripts/phone.mjs 57 PASS at three sizes, screenshots looked at.
- 2026-09-25 · U12 Marathi and Hindi (first pass) · src/client/i18n.ts: `t()` keyed by the English text, `{x}` values, phone variants (`|touch`); a language row on the title screen (English · मराठी · हिन्दी, each in its own script) and in Settings, reloading into the choice; translated: title screen, the HUD chip (titles, seasons, saving/offline, loan overdue), hotbar names, every field tip and the smart-hand labels, stall hints, opening hours and closed notices, cart/bulls/night/pastime hints, the kaam list and job lines (neighbours in Devanagari), the help card (new src/client/ui/help.ts), settings incl. graphics, the phone buttons; Noto Sans Devanagari loaded only for mr/hi and set larger. Stays English for now: story dialogue, the mission card, shop panels, server messages. Needs a native speaker's review. Verified: tsc, scripts/ux/u12.js in mr and hi on desktop and phone (no English left in those parts, no page errors), English unchanged (u3 re-run), screenshots looked at.
- 2026-09-25 · U13 sound as information · synthesized `templebell` (rung at 6:30 pm with "the stalls close soon"), `rooster` at dawn, `ripe` (a soft two-note chime and "🌾 Onion is ripe in Aamrai" when a crop ripens in a field of yours within 25 m); at night by a closed stall the hint offers Z: sleep instead of the closed notice. Verified: tsc, scripts/ux/u13.js (audio self-test non-silent for all three; ripe toast after growing; bell toast crossing 6:30 pm; night hint by Sitabai's closed stall), strings in mr/hi.
- 2026-09-25 · U14 gentle minigames · Settings → "Easy fishing" (half the fight, tension capped so the line never snaps); a synthesized `tug` as a surge begins; a one-time picture card (a drawing and three steps, in all three languages) the first time you cast and the first time you play kabaddi; holding Use / right-click in kabaddi tags or tackles the moment someone is in reach, never diving at thin air. Old scripts mark the cards seen. Verified: 107 vitest (reel: easy mode never snaps, every fish lands holding on), tsc, scripts/ux/u14.js (setting saved; fishing card once then cast; kabaddi card once; holding tagged a defender), screenshots looked at.
- 2026-09-25 · U15 a picture of the controls · The help card (H) opens on a drawing: a keyboard with the keys that matter in gold and what they do written below, the mouse beside it (L harvest, R use, hold R for a row); on touch, a phone with the joystick area, Use, Jump, look, the contextual button and the goal card labelled. The full list of controls folds under "All controls". Pictures translated. Verified: tsc, screenshot desktop and phone (labels clear of keys), rows under the fold 7/6.
- 2026-09-25 · U16 not by colour alone, less motion · A small gold spark turns and bobs over each ripe plant on your own land (one instanced draw, placed from each crop's height); Settings → "Reduce motion" (defaulting to the system setting) stops confetti, the sparks' and markers' bobbing, the fishing shake, the chant pulse and the HUD bumps, and floaters fade rather than fly. Verified: tsc, 107 vitest, scripts/ux/u16.js (5 sparks over 5 ripe, none over the young row; setting saved, html class on, confetti 160 → 0), screenshot looked at.
- 2026-09-25 · U17 measure it · src/client/metrics.ts sends Vercel Analytics custom events: `started` (first visit on a device), `first_harvest`, `first_sale` (once per device), `mission_done` {mission} each time a mission completes, `returned` {days} once on each later calendar day; each carries touch/lang/mission where useful. Dev logs `[metric]` to the console and keeps window.__metrics. Verified: tsc, scripts/ux/u17.js → started, first_harvest, first_sale, mission_done:1, mission_done:2, returned:2d (a second harvest and a same-day return sent nothing).
