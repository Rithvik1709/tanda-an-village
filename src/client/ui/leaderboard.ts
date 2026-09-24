/*
 * The Ukhali leaderboard: the richest farmers of the tanda by net worth, your own rank, and an
 * optional name to show up as (no sign-up needed).
 */
type Parts = { cash: number; land: number; goods: number; debt: number };
type Row = { rank: number; name: string; worth: number; parts?: Parts | null; title: string; missions: number; sarpanch: boolean; you: boolean };
type Board = { top: Row[]; me?: { rank: number; total: number; name: string; worth: number; parts?: Parts } };

export class Leaderboard {
  private el: HTMLElement;
  open = false;
  onClose: () => void = () => {};
  /** Set the player's name through the game's action queue (server-validated). */
  setName: (n: string) => Promise<string | null> = async () => null;

  constructor(parent: HTMLElement, private token: () => string | null) {
    this.el = document.createElement("div");
    this.el.className = "panel board";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-close]")) this.close();
    });
    this.el.addEventListener("keydown", (e) => e.stopPropagation());
  }

  async show() {
    this.open = true;
    this.el.hidden = false;
    // a skeleton of the board while it loads, the same shape as the real thing
    const bone = (w: number) => `<i class="sk" style="width:${w}%"></i>`;
    this.el.innerHTML = `<div class="panel-card board-loading" aria-busy="true">
      <button class="x" data-close>✕</button>
      <h2>Ukhali Tanda's leaderboard <small>श्रीमंत शेतकरी</small></h2>
      <p class="lede">Counting everyone's cash, land, crops and bulls…</p>
      <div class="board-me">${bone(55)}</div>
      <table class="board-table"><tbody>${Array.from({ length: 7 }, (_, i) => `<tr><td class="rank">${bone(70)}</td><td>${bone(40 + ((i * 17) % 30))}<br>${bone(28 + ((i * 11) % 20))}</td><td class="num">${bone(60)}<br>${bone(90)}</td></tr>`).join("")}</tbody></table></div>`;
    let data: Board;
    try {
      const t = this.token();
      const r = await fetch("/api/leaderboard", { headers: t ? { authorization: `Bearer ${t}` } : {} });
      data = await r.json();
    } catch {
      this.el.innerHTML = `<div class="panel-card"><button class="x" data-close>✕</button><h2>Leaderboard</h2><p class="empty">Couldn't reach the village. Try again in a moment.</p></div>`;
      return;
    }
    const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
    const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : String(r));
    // what the wealth is made of: cash in hand, land, crops & livestock, less loans
    const parts = (p?: Parts | null) => (p ? `<small class="parts">cash ${rs(p.cash)} · land ${rs(p.land)} · crops &amp; bulls ${rs(p.goods)}${p.debt ? ` · owes ${rs(p.debt)}` : ""}</small>` : "");
    const rows = data.top
      .map((r) => `<tr class="${r.you ? "you" : ""}"><td class="rank">${medal(r.rank)}</td><td><b>${esc(r.name)}</b>${r.you ? " <small>(you)</small>" : ""}<br><small>${r.sarpanch ? "🏛 Sarpanch · " : ""}${esc(r.title)} · ${r.missions} mission${r.missions === 1 ? "" : "s"}</small></td><td class="num"><b>${rs(r.worth)}</b>${parts(r.parts)}</td></tr>`)
      .join("");
    const me = data.me;
    const mine = me && !data.top.some((r) => r.you) ? `<tr class="you sep"><td class="rank">${me.rank}</td><td><b>${esc(me.name)}</b> <small>(you)</small></td><td class="num"><b>${rs(me.worth)}</b>${parts(me.parts)}</td></tr>` : "";
    this.el.innerHTML = `<div class="panel-card">
      <button class="x" data-close>✕</button>
      <h2>Ukhali Tanda's leaderboard <small>श्रीमंत शेतकरी</small></h2>
      <p class="lede">The farmers of the tanda, by <b>wealth</b>: not just cash, but the cash, land, crops and bulls they own, less what they owe.</p>
      ${me ? `<div class="board-me">You're <b>#${me.rank}</b> of ${me.total} farmers · wealth ${rs(me.worth)}${parts(me.parts)}</div>` : ""}
      <table class="board-table"><thead><tr><th></th><th>Farmer</th><th class="num">Wealth</th></tr></thead><tbody>${rows || `<tr><td class="empty">No farmers yet — be the first!</td></tr>`}${mine}</tbody></table>
      ${me ? `<form class="name-form"><label>Your name on the board</label><div><input name="n" maxlength="20" value="${esc(me.name.startsWith("Farmer ") ? "" : me.name)}" placeholder="${esc(me.name)}"><button>Save</button></div><small class="name-msg">No sign-up needed. You can change it any time.</small></form>` : ""}
      <div class="panel-foot">Esc to close</div></div>`;
    const form = this.el.querySelector(".name-form") as HTMLFormElement | null;
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector(".name-msg")!;
      const err = await this.setName((form.n as HTMLInputElement).value);
      msg.textContent = err ?? "Saved!";
      if (!err) setTimeout(() => this.open && this.show(), 900);
    });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
