import { CROP_IDS, CROPS, type CropId } from "../../shared/crops";
import { buyerPrice, LEDGER_DAYS, news, SHOP } from "../../shared/economy";
import { block } from "../../shared/blocks";
import type { Action, Result } from "../../shared/rules";
import type { Save } from "../../shared/save";
import { clock } from "../../shared/time";

/*
 * The trader's and shopkeeper's panels. They only ever call `act` — the same actions the server
 * re-checks — and re-render from the save after each one.
 */
export type PanelKind = "trader" | "shop";
type Ctx = { save: () => Save; now: () => number; act: (a: Action) => Result; toast: (m: string, k?: "ok" | "bad") => void };

const CROP_COLOR: Record<CropId, string> = { jowar: "#e0b060", onion: "#e07a9a", sugarcane: "#9ccf5a" };
const rs = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

export class Panels {
  private el: HTMLElement;
  open: PanelKind | null = null;
  private tab = "sell";
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, private ctx: Ctx) {
    this.el = document.createElement("div");
    this.el.className = "panel";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener("click", (e) => this.click(e));
    this.el.addEventListener("keydown", (e) => e.stopPropagation());
  }

  show(kind: PanelKind, tab?: string) {
    this.open = kind;
    this.tab = tab ?? (kind === "trader" ? "sell" : "buy");
    this.el.hidden = false;
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = null;
    this.el.hidden = true;
    this.onClose();
  }

  private click(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest("[data-do]") as HTMLElement | null;
    if (!t) return;
    const [what, a, b] = t.dataset.do!.split(":");
    if (what === "close") return this.close();
    if (what === "tab") {
      this.tab = a;
      return this.render();
    }
    const s = this.ctx.save();
    let r: Result | null = null;
    if (what === "sell") {
      const have = s.inv[a] ?? 0;
      const n = b === "all" ? have : Math.min(Number(b), have);
      if (n < 1) return this.ctx.toast(`No ${CROPS[a as CropId].name.toLowerCase()} to sell yet.`, "bad");
      r = this.ctx.act({ t: "sell", item: a as CropId, n, where: "village" });
    } else if (what === "buy") r = this.ctx.act({ t: "buy", item: t.dataset.item!, n: Number(t.dataset.n ?? 1) });
    if (r) this.ctx.toast(r.ok ? (r.msg ?? "Done") : r.error, r.ok ? "ok" : "bad");
    this.render();
  }

  /** Called on every save change so numbers stay live while the panel is open. */
  render() {
    if (!this.open) return;
    const s = this.ctx.save();
    const day = clock(this.ctx.now()).day;
    const tabs = this.open === "trader" ? [["sell", "Sell"], ["prices", "Prices"], ["ledger", "Ledger"]] : [["buy", "Buy"], ["ledger", "Ledger"]];
    const who =
      this.open === "trader"
        ? `<h2>Ganpat Seth <small>village trader · व्यापारी</small></h2><p class="lede">"I pay fair, and I pay today. For more, you'd have to cart it to the town mandi."</p>`
        : `<h2>Sakharam's seeds &amp; tools <small>बी-बियाणे</small></h2><p class="lede">"Good seed, good harvest. Tell me what you're growing."</p>`;
    const body = this.tab === "sell" ? this.sell(s, day) : this.tab === "prices" ? this.prices(day) : this.tab === "ledger" ? this.ledger(s, day) : this.buy(s);
    this.el.innerHTML = `
      <div class="panel-card">
        <button class="x" data-do="close" title="Close (E)">✕</button>
        ${who}
        <div class="tabs">${tabs.map(([k, n]) => `<button data-do="tab:${k}" class="${k === this.tab ? "on" : ""}">${n}</button>`).join("")}<span class="wallet">${rs(s.money)}</span></div>
        <div class="panel-body">${body}</div>
        <div class="panel-foot">E or Esc to close</div>
      </div>`;
  }

  private sell(s: Save, day: number) {
    const heads = news(day);
    const rows = CROP_IDS.map((c) => {
      const p = buyerPrice(c, day, "village");
      const y = buyerPrice(c, day - 1, "village");
      const trend = p > y ? `<span class="up">▲ ${rs(p - y)}</span>` : p < y ? `<span class="down">▼ ${rs(y - p)}</span>` : `<span class="flat">—</span>`;
      const have = s.inv[c] ?? 0;
      return `<tr><td><i class="dot" style="background:${CROP_COLOR[c]}"></i>${CROPS[c].name} <small>${CROPS[c].local}</small></td>
        <td class="num">${have}</td><td class="num">${rs(p)} ${trend}</td><td class="num"><b>${rs(Math.round(p * have))}</b></td>
        <td class="acts"><button data-do="sell:${c}:1" ${have ? "" : "disabled"}>Sell 1</button><button data-do="sell:${c}:10" ${have >= 10 ? "" : "disabled"}>10</button><button data-do="sell:${c}:all" ${have ? "" : "disabled"}>All</button></td></tr>`;
    }).join("");
    return `${heads.map((h) => `<div class="news ${h.kind}">${h.kind === "glut" ? "📉" : "📈"} ${h.headline}</div>`).join("")}
      <table><thead><tr><th>Produce</th><th class="num">You have</th><th class="num">Price today</th><th class="num">Worth</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /** 14-day price chart (what Ganpat pays), drawn as SVG. */
  private prices(day: number) {
    const W = 560, H = 220, L = 38, R = 12, T = 12, Bm = 26;
    const ds = Array.from({ length: 14 }, (_, i) => day - 13 + i);
    const series = CROP_IDS.map((c) => ({ c, ps: ds.map((d) => buyerPrice(c, d, "village")) }));
    const all = series.flatMap((s) => s.ps);
    const lo = Math.floor(Math.min(...all) - 0.5), hi = Math.ceil(Math.max(...all) + 0.5);
    const x = (i: number) => L + (i / 13) * (W - L - R);
    const y = (p: number) => T + (1 - (p - lo) / (hi - lo)) * (H - T - Bm);
    const grid = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
      .map((p) => `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${L - 6}" y="${y(p) + 4}" class="axis" text-anchor="end">₹${p.toFixed(0)}</text>`)
      .join("");
    const xl = ds.map((d, i) => (i % 3 === 1 || i === 13 ? `<text x="${x(i)}" y="${H - 8}" class="axis" text-anchor="middle">${i === 13 ? "today" : `${day - d}d ago`}</text>` : "")).join("");
    const lines = series
      .map(({ c, ps }) => `<polyline fill="none" stroke="${CROP_COLOR[c]}" stroke-width="2.5" points="${ps.map((p, i) => `${x(i)},${y(p)}`).join(" ")}"/><circle cx="${x(13)}" cy="${y(ps[13])}" r="4.5" fill="${CROP_COLOR[c]}"/>`)
      .join("");
    const legend = series.map(({ c, ps }) => `<span><i class="dot" style="background:${CROP_COLOR[c]}"></i>${CROPS[c].name} ${rs(ps[13])}</span>`).join("");
    return `<div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" class="chart">${grid}${xl}${lines}</svg>
      <p class="hint">What Ganpat pays per unit. Prices follow the seasons: a crop that grows badly this season is scarce, so it's dearer. Watch for gluts.</p>`;
  }

  private ledger(s: Save, day: number) {
    const byDay = new Map<number, { income: number; costs: number; lines: string[] }>();
    for (const e of s.ledger) {
      const d = byDay.get(e.day) ?? { income: 0, costs: 0, lines: [] };
      if (e.kind === "sell") d.income += e.amount;
      else d.costs += e.amount;
      const name = e.kind === "sell" ? CROPS[e.item as CropId]?.name ?? e.item : SHOP.find((i) => i.id === e.item)?.name ?? e.item;
      d.lines.push(`${e.kind === "sell" ? "Sold" : "Bought"} ${e.n} ${name.toLowerCase()} · <b class="${e.kind === "sell" ? "up" : "down"}">${e.kind === "sell" ? "+" : "−"}${rs(e.amount)}</b>`);
      byDay.set(e.day, d);
    }
    if (!byDay.size) return `<p class="empty">Nothing yet. Harvest something and sell it to Ganpat — every sale and purchase shows up here, day by day.</p>`;
    const label = (d: number) => (d === day ? "Today" : d === day - 1 ? "Yesterday" : `${day - d} days ago`);
    const rows = [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([d, v]) => {
        const p = v.income - v.costs;
        return `<tr><td>${label(d)}</td><td class="num up">+${rs(v.income)}</td><td class="num down">−${rs(v.costs)}</td><td class="num"><b class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "+" : "−"}${rs(Math.abs(p))}</b></td></tr>
          <tr class="detail"><td colspan="4">${v.lines.slice(-6).join(" · ")}</td></tr>`;
      })
      .join("");
    const inc = [...byDay.values()].reduce((a, v) => a + v.income, 0);
    const cost = [...byDay.values()].reduce((a, v) => a + v.costs, 0);
    return `<table class="ledger"><thead><tr><th>Day</th><th class="num">Income</th><th class="num">Costs</th><th class="num">Profit</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>Last ${LEDGER_DAYS} days</td><td class="num up">+${rs(inc)}</td><td class="num down">−${rs(cost)}</td><td class="num"><b>${inc - cost >= 0 ? "+" : "−"}${rs(Math.abs(inc - cost))}</b></td></tr></tfoot></table>`;
  }

  private buy(s: Save) {
    const section = (i: { id: string }) => (i.id.startsWith("seed:") ? "Seeds" : i.id.startsWith("block:") ? "Building" : "Tools");
    let last = "";
    const rows = SHOP.map((i) => {
      const head = section(i) !== last ? `<tr class="section"><td colspan="4">${(last = section(i))}</td></tr>` : "";
      const have = s.inv[i.id] ?? 0;
      const one = i.max === 1;
      const owned = one && have >= 1;
      const afford = (n: number) => (s.money >= i.price * n ? "" : "disabled");
      const icon = i.id.startsWith("block:") ? `<i class="dot sq" style="background:${blockColor(Number(i.id.slice(6)))}"></i>` : i.id.startsWith("seed:") ? `<i class="dot" style="background:${CROP_COLOR[i.id.slice(5) as CropId]}"></i>` : "🪣";
      return `${head}<tr><td>${icon} ${i.name}${i.note ? `<br><small>${i.note}</small>` : ""}</td><td class="num">${one ? (owned ? "owned" : "—") : have}</td><td class="num">${rs(i.price)}</td>
        <td class="acts">${owned ? "" : `<button data-do="buy" data-item="${i.id}" data-n="1" ${afford(1)}>Buy${one ? "" : " 1"}</button>`}${one ? "" : `<button data-do="buy" data-item="${i.id}" data-n="10" ${afford(10)}>10</button>`}</td></tr>`;
    }).join("");
    return `<table><thead><tr><th>Item</th><th class="num">You have</th><th class="num">Price</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}

const BLOCK_COLORS: Record<string, string> = { Planks: "#b58a58", Brick: "#b5563a", Whitewash: "#ece4d4", Thatch: "#c9a45c", Cobblestone: "#9a958c", Fence: "#7a5c3c", "Roof tiles": "#b8553a", "Hay bale": "#d9b35a" };
const blockColor = (id: number) => BLOCK_COLORS[block(id).name] ?? "#888";
