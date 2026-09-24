# Contributing to Tanda

Thank you for wanting to help build Ukhali Tanda! This guide covers how to set up, how the code is
laid out, the few rules that keep the game fair, and how to send a change.

## Ways to help

- **Play and report.** Bugs, confusing moments, missions that are too hard or too easy.
  Open an [issue](../../issues/new/choose) and add a screenshot if you can.
- **Culture and accuracy.** If you know Banjara life, Marathwada villages or Jalna district, we'd
  love corrections: names, clothes, festivals, how a mandir or a tanda really looks. These issues are
  as valuable as code.
- **Translations.** Marathi, Banjari (Gor boli) or Hindi for the UI and the mission dialogue.
- **Code.** New crops, villager routines, festival events, performance, accessibility, touch controls.
- **Art and sound.** All textures are painted on canvases and all sounds are synthesized in code, so
  improvements go straight into `src/client/scene/textures.ts` and `src/client/audio.ts`.

## Setup

You need **Node 20+** and a desktop browser (Chrome, Edge, Firefox or Safari).

```bash
git clone https://github.com/<you>/tanda-an-village.git
cd tanda-an-village
npm install
npm run dev              # http://localhost:5190 (game and API together, saves in .data/)
```

No database or accounts are needed locally: the API uses JSON files in `.data/`. To start fresh,
delete that folder, or clear the site's local storage in the browser.

Handy while developing (dev server only):

- `window.__bailgaadi` in the browser console has test hooks: `teleport`, `setHour(21)` (night),
  `skip(ms)` to fast-forward the server clock, `grant(money)`, `jumpMission(i, rep)`, `setView("first")`.
- **F3** toggles the debug overlay.

## Before you open a pull request

Please run all three. CI runs them too.

```bash
npm run typecheck
npm test
npm run build
```

If you changed gameplay, the UI or visuals, also run the scripted play-through that covers your area
(with `npm run dev` running) and look at the screenshots it writes to `out/`:

| Area | Script |
|---|---|
| accounts, saves, tampering, two devices | `node scripts/m4.mjs` |
| farming | `node scripts/shots.mjs --name x --eval "$(cat scripts/m3.js)"` |
| economy | `node scripts/shots.mjs --name x --eval "$(cat scripts/m5.js)"` |
| land market | `node scripts/shots.mjs --name x --eval "$(cat scripts/m6.js)"` |
| bulls & cart | `node scripts/shots.mjs --name x --eval "$(cat scripts/m7.js)"` |
| bank & godown | `node scripts/shots.mjs --name x --eval "$(cat scripts/m8.js)"` |
| missions / election | `scripts/missions.js`, `scripts/election.js` |

For visual changes, please attach a before and after screenshot to the PR.

## How the code is organised

```
src/shared/   the rules, pure TypeScript shared by browser and server
  world.ts      seeded village generator (OSM roads in ukhali-osm.ts)
  rules.ts      every action a player can take, and its checks
  missions.ts   the story        save.ts   save format + migrations
  crops · economy · land · bank · bulls · time   the models
src/client/   the browser game (Three.js)
  scene/        terrain, water, grass, trees, village, crops, figures, post-processing
  player/       walking, camera, navigation   ui/  HUD and panels
  villagers.ts  farmyard.ts  audio.ts  net.ts  main.ts
api/          Vercel functions: session, state, act, leaderboard, dev (+ _lib/store.ts)
tests/        vitest unit tests
scripts/      headless-Chrome play-throughs and screenshots
supabase/     database schema
```

## The rules that keep the game fair (please keep them)

1. **All game state changes go through `src/shared/rules.ts`.** Don't give the player money, items,
   land or mission progress anywhere else. The server re-runs the same rules on every action, so
   anything added only on the client will be (correctly) rolled back.
2. **Rules must be deterministic.** Use the `now` passed in and the seeded helpers in `rng.ts`, never
   `Math.random()` or `Date.now()`. The server may replay a batch after a conflict.
3. **Changing the save format?** Bump `SAVE_VERSION` in `save.ts` and add a migration step. Never
   break existing saves.
4. **Changing the map?** Block ids in `blocks.ts` are append-only. If plot ids or positions change,
   bump `LAYOUT` in `world.ts` so old saves are moved safely.
5. **The browser never talks to the database.** Only `api/` does, with the service key.
6. **Add a test** for any new rule, or for a bug you fix. `tests/missions.test.ts` shows how to play
   through rules quickly.

## Style

- TypeScript strict mode, with no unused locals or parameters.
- Match the surrounding code: small functions, and comments that explain *why*.
- Keep UI text short and friendly. Marathi and Banjari words are welcome, with an English gloss
  nearby.
- Visuals should look cinematic and warm, not blocky. Smooth shapes, soft light, no pixel art.

## Sending a change

1. Fork, and create a branch: `git checkout -b feat/cotton-crop`.
2. Keep commits focused. Write messages in the imperative ("Add cotton crop with four growth stages").
3. Open a PR using the template. Describe what changed, how you tested it, and add screenshots.
4. A maintainer will review it. Small, focused PRs are merged fastest.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).

## Questions

Open a [discussion or issue](../../issues). Be kind, and assume good intent. See the
[Code of Conduct](CODE_OF_CONDUCT.md).
