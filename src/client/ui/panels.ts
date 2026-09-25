import { hoursText } from "../../shared/hours";
import { CROP_IDS, CROPS, type CropId } from "../../shared/crops";
import { buyerPrice, LEDGER_DAYS, news, SHOP } from "../../shared/economy";
import { block } from "../../shared/blocks";
import type { Action, Result } from "../../shared/rules";
import type { Save } from "../../shared/save";
import { askingPrice, forSale, offersFor, valuePlot } from "../../shared/land";
import { BULL_NAMES, bullsMoodWord, bullsNow, CART_CAPACITY, TRIP_COST } from "../../shared/bulls";
import { carried, CARRY, creditLimit, GODOWN_CAPACITY, GODOWN_RENT, isOverdue, LENDERS, type Lender, netWorth, owed, rentFor, stored, titleFor } from "../../shared/bank";
import { DAY_MS } from "../../shared/time";
import { current } from "../../shared/missions";
import { clock } from "../../shared/time";
import type { World } from "../../shared/world";
import { FISH, FISH_IDS, type FishId, fishPrice } from "../../shared/fish";
import { GIVERS } from "../../shared/jobs";
import { HELPERS, type HelperId } from "../../shared/helpers";

/*
 * The trader's and shopkeeper's panels. They only ever call `act` — the same actions the server
 * re-checks — and re-render from the save after each one.
 */
export type PanelKind = "trader" | "shop" | "land" | "cart" | "town" | "bank" | "sahukar" | "mandir" | "kamlabai" | "shankar";
type Ctx = {
  save: () => Save;
  now: () => number;
  act: (a: Action) => Result;
  toast: (m: string, k?: "ok" | "bad") => void;
  world: World;
  showMap: () => void;
  ride: (dest: "town" | "home") => void;
  onTab: (tab: string) => void;
};

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
    // a number you typed stays put while the panel redraws around it (it redraws on every save)
    this.el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.tagName === "INPUT") t.dataset.dirty = "1";
    });
  }

  show(kind: PanelKind, tab?: string) {
    this.open = kind;
    this.tab = tab ?? (kind === "trader" ? "sell" : kind === "land" ? "plots" : kind === "cart" ? "load" : kind === "town" ? "mandi" : kind === "bank" ? "loans" : kind === "sahukar" ? "loans" : kind === "mandir" ? "offer" : "buy");
    this.ctx.onTab(this.tab);
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
    if (what === "map") return this.ctx.showMap();
    if (what === "rideHome") {
      this.close();
      return this.ctx.ride("home");
    }
    if (what === "setOff") {
      const load: Record<string, number> = {};
      this.el.querySelectorAll<HTMLInputElement>("input[data-load]").forEach((i) => {
        const n = Math.floor(Number(i.value) || 0);
        if (n > 0) load[i.dataset.load!] = n;
      });
      const res = this.ctx.act({ t: "startTrip", load });
      this.ctx.toast(res.ok ? (res.msg ?? "Off we go") : res.error, res.ok ? "ok" : "bad");
      if (res.ok) {
        this.close();
        this.ctx.ride("town");
      } else this.render();
      return;
    }
    if (what === "sellTown") {
      const res = this.ctx.act({ t: "sellTown" });
      this.ctx.toast(res.ok ? (res.msg ?? "Sold") : res.error, res.ok ? "ok" : "bad");
      if (res.ok) this.tab = "sold";
      return this.render();
    }
    if (what === "tab") {
      this.tab = a;
      this.ctx.onTab(a);
      return this.render();
    }
    const s = this.ctx.save();
    let r: Result | null = null;
    if (what === "sellFish") {
      const have = s.inv[`fish:${a}`] ?? 0;
      const n = b === "all" ? have : Math.min(Number(b), have);
      if (n < 1) return this.ctx.toast("No fish to sell.", "bad");
      r = this.ctx.act({ t: "sellFish", item: a as FishId, n });
    } else if (what === "sell") {
      const have = s.inv[a] ?? 0;
      const n = b === "all" ? have : Math.min(Number(b), have);
      if (n < 1) return this.ctx.toast(`No ${CROPS[a as CropId].name.toLowerCase()} to sell yet.`, "bad");
      r = this.ctx.act({ t: "sell", item: a as CropId, n, where: "village" });
    } else if (what === "borrow") {
      const input = this.el.querySelector("input[data-borrow]") as HTMLInputElement | null;
      const amount = b ? Number(b) : Math.round(Number(input?.value.replace(/[^0-9]/g, "")) / 100) * 100;
      r = this.ctx.act({ t: "borrow", lender: a as Lender, amount });
      if (r.ok && input) delete input.dataset.dirty;
    } else if (what === "repay") {
      const loan = s.loans.find((l) => l.id === Number(a));
      if (!loan) return this.ctx.toast("That loan is already paid off.", "ok");
      const due = owed(loan, this.ctx.now());
      const input = this.el.querySelector(`input[data-repay="${a}"]`) as HTMLInputElement | null;
      const typed = Math.floor(Number(input?.value.replace(/[^0-9]/g, "")) || 0);
      // "all": offer everything you have — the lender takes exactly what's owed at its own clock,
      // so a few seconds' interest can't leave a rupee or two hanging on the loan
      const amount = b === "all" ? s.money : b === "typed" ? typed : Number(b);
      if (amount < 1) return this.ctx.toast("How much do you want to repay?", "bad");
      if (b === "all" && s.money < due) return this.ctx.toast(`You owe ${rs(due)} but have ${rs(s.money)}.`, "bad");
      r = this.ctx.act({ t: "repay", loan: Number(a), amount: Math.min(amount, s.money) });
      if (r.ok && input) delete input.dataset.dirty;
    } else if (what === "store" || what === "withdraw") {
      const input = this.el.querySelector(`input[data-gd="${a}"]`) as HTMLInputElement | null;
      const n = b === "all" ? (what === "store" ? (s.inv[a] ?? 0) : (s.godown[a]?.n ?? 0)) : Math.floor(Number(input?.value) || 0);
      if (n < 1) return this.ctx.toast("Nothing to move.", "bad");
      r = this.ctx.act({ t: what, item: a as CropId, n: what === "withdraw" ? Math.min(n, CARRY - carried(s)) : n });
    } else if (what === "deliver") r = this.ctx.act({ t: "deliver", to: a as "sitabai" | "mandir", item: b as CropId, n: Math.min(Number(t.dataset.n), s.inv[b] ?? 0) });
    else if (what === "teej") r = this.ctx.act({ t: "visit", place: "teej" });
    else if (what === "drip") r = this.ctx.act({ t: "installDrip", plot: Number(a) });
    else if (what === "buyPlot") r = this.ctx.act({ t: "buyPlot", plot: Number(a) });
    else if (what === "delist") r = this.ctx.act({ t: "delist", plot: Number(a) });
    else if (what === "accept") r = this.ctx.act({ t: "acceptOffer", plot: Number(a), day: Number(b) });
    else if (what === "list") {
      const input = this.el.querySelector(`input[data-price="${a}"]`) as HTMLInputElement | null;
      r = this.ctx.act({ t: "listPlot", plot: Number(a), price: Math.round(Number(input?.value.replace(/[^0-9]/g, "")) || 0) });
    } else if (what === "buy") r = this.ctx.act({ t: "buy", item: t.dataset.item!, n: Number(t.dataset.n ?? 1) });
    if (r) this.ctx.toast(r.ok ? (r.msg ?? "Done") : r.error, r.ok ? "ok" : "bad");
    this.render();
  }

  /** Called on every save change so numbers stay live while the panel is open. */
  render() {
    if (!this.open) return;
    const s = this.ctx.save();
    const day = clock(this.ctx.now()).day;
    const tabs =
      this.open === "cart" || this.open === "town" || this.open === "mandir" || this.open === "kamlabai" || this.open === "shankar"
        ? []
        : this.open === "bank"
          ? [["loans", "Loans"], ["godown", "Godown"], ["worth", "Your worth"]]
          : this.open === "sahukar"
            ? [["loans", "Loans"]]
        : this.open === "trader" ? [["sell", "Sell"], ["prices", "Prices"], ["ledger", "Ledger"]] : this.open === "land" ? [["plots", "Plots"], ["mine", "Your land"]] : [["buy", "Buy"], ["ledger", "Ledger"]];
    const who =
      this.open === "trader"
        ? `<h2>Ganpat Seth <small>village trader · व्यापारी</small></h2><p class="lede">"I pay fair, and I pay today. For more, you'd have to cart it to the town mandi."</p>`
        : this.open === "kamlabai"
          ? `<h2>Kamlabai Jadhav <small>candidate for sarpanch · बचत गट अध्यक्ष</small></h2><p class="lede">"Ram Ram, bhau. Our women walk a kilometre for water while the tanki on the tekdi stands half empty. Vote for me and every lane gets a tap. And the Z.P. school gets a real teacher, not one who comes twice a month."</p>`
          : this.open === "shankar"
          ? `<h2>Shankar Pawar <small>candidate for sarpanch</small></h2><p class="lede">"A tar road to the Jalna highway, that's what I'll bring! And for your trouble…" (he pats a thick envelope) "…Motilal seth takes care of his friends. Why walk to the booth for nothing?"</p>`
          : this.open === "mandir"
          ? `<h2>Sevalal Maharaj mandir <small>संत सेवालाल महाराज</small></h2><p class="lede">White flags flutter over the shrine. The tanda brings its first harvest here.</p>`
          : this.open === "bank"
          ? `<h2>Sahakari Bank &amp; godown <small>Joshi saheb, manager · सहकारी बँक</small></h2><p class="lede">"We lend at one rupee in a hundred a day, against your land. Pay on time and we're friends for life."</p>`
          : this.open === "sahukar"
            ? `<h2>Sahukar Motilal <small>moneylender · सावकार</small></h2><p class="lede">"No papers, no waiting. Money today — five in a hundred a day, mind you, and I don't like waiting."</p>`
            : this.open === "cart"
          ? `<h2>Load the bailgaadi <small>बैलगाडी</small></h2><p class="lede">The town mandi pays more than Ganpat — if you make the trip. Sarja and Raja know the road.</p>`
          : this.open === "town"
            ? `<h2>Town mandi <small>Haribhau, commission agent · अडत्या</small></h2><p class="lede">"Unload here, bhau. Town prices, cash today."</p>`
            : this.open === "land"
          ? `<h2>Naik Dhavlu's kacheri <small>the tanda's headman · नायक</small></h2><p class="lede">"Ram Ram! The tanda settled here for this black soil. Buy land near water, bhai — it feeds you every season."</p>`
          : `<h2>Sitabai's seeds &amp; tools <small>बी-बियाणे</small></h2><p class="lede">"Ram Ram! Good seed, good harvest. And my Khillari bulls pull a cart like our caravans of old."</p>`;
    const body =
      this.open === "kamlabai" || this.open === "shankar" ? `<p class="hint">${current(s)?.id === "election" ? "Listen to both candidates, attend the gram sabha at the school, then decide." : "The election is over."}</p>` : this.tab === "offer" ? this.offer(s) : this.tab === "loans" ? this.loans(s, day, this.open === "bank" ? "bank" : "sahukar") : this.tab === "godown" ? this.godown(s) : this.tab === "worth" ? this.worth(s, day) : this.tab === "load" ? this.load(s, day) : this.tab === "mandi" || this.tab === "sold" ? this.mandi(s, day) : this.tab === "sell" ? this.sell(s, day) : this.tab === "prices" ? this.prices(day) : this.tab === "ledger" ? this.ledger(s, day) : this.tab === "plots" ? this.plots(s, day) : this.tab === "mine" ? this.mine(s, day) : this.buy(s);
    // keep what the player is typing (and where the cursor is) across the redraw
    const keyOf = (i: HTMLInputElement) => [...i.attributes].filter((a) => a.name.startsWith("data-") && a.name !== "data-dirty").map((a) => `${a.name}=${a.value}`).join("&");
    const typed = new Map<string, string>();
    this.el.querySelectorAll<HTMLInputElement>("input[data-dirty]").forEach((i) => typed.set(keyOf(i), i.value));
    const focus = document.activeElement instanceof HTMLInputElement && this.el.contains(document.activeElement) ? { key: keyOf(document.activeElement), at: document.activeElement.selectionStart } : null;
    const scroll = this.el.querySelector(".panel-card")?.scrollTop ?? 0;
    this.el.innerHTML = `
      <div class="panel-card">
        <button class="x" data-do="close" title="Close (E)">✕</button>
        ${who}${hoursText(this.open) ? `<p class="hours-line">🕰 Open ${hoursText(this.open)}</p>` : ""}
        <div class="tabs" ${tabs.length ? "" : 'style="border:0"'}>${tabs.map(([k, n]) => `<button data-do="tab:${k}" class="${k === this.tab ? "on" : ""}">${n}</button>`).join("")}<span class="wallet">${rs(s.money)}</span></div>
        <div class="panel-body">${body}</div>
        <div class="panel-foot">E or Esc to close</div>
      </div>`;
    this.el.querySelectorAll<HTMLInputElement>("input").forEach((i) => {
      const k = keyOf(i);
      if (typed.has(k)) {
        i.value = typed.get(k)!;
        i.dataset.dirty = "1";
      }
      if (focus && focus.key === k) {
        i.focus();
        try { i.setSelectionRange(focus.at, focus.at); } catch { /* number inputs have no selection */ }
      }
    });
    const card = this.el.querySelector(".panel-card");
    if (card) card.scrollTop = scroll;
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
    // fish from the talav: Ganpat buys those too, by the piece
    const fishRows = FISH_IDS.filter((f) => s.inv[`fish:${f}`]).map((f) => {
      const have = s.inv[`fish:${f}`] ?? 0, p = fishPrice(f, day);
      return `<tr><td>🐟 ${FISH[f].name} <small>${FISH[f].local}</small></td><td class="num">${have}</td><td class="num">${rs(p)}</td><td class="num"><b>${rs(p * have)}</b></td>
        <td class="acts"><button data-do="sellFish:${f}:1">Sell 1</button><button data-do="sellFish:${f}:all">All</button></td></tr>`;
    }).join("");
    return `${heads.map((h) => `<div class="news ${h.kind}">${h.kind === "glut" ? "📉" : "📈"} ${h.headline}</div>`).join("")}
      <table><thead><tr><th>Produce</th><th class="num">You have</th><th class="num">Price today</th><th class="num">Worth</th><th></th></tr></thead><tbody>${rows}${fishRows}</tbody></table>`;
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
      else if (e.kind === "buy") d.costs += e.amount;
      if (e.kind === "borrow" || e.kind === "repay") {
        d.lines.push(`${e.kind === "borrow" ? "Borrowed" : "Repaid"} ${rs(e.amount)} ${e.kind === "borrow" ? "from" : "to"} ${e.where} <small>(not counted as income or cost)</small>`);
        byDay.set(e.day, d);
        continue;
      }
      if (e.item === "godown-rent") {
        d.lines.push(`Godown rent for ${e.n} · <b class="down">−${rs(e.amount)}</b>`);
        byDay.set(e.day, d);
        continue;
      }
      if (e.item.startsWith("job:") || e.item === "kabaddi") {
        const giver = Object.values(GIVERS).find((g) => g.name === e.where);
        d.lines.push(`${e.item === "kabaddi" ? "Kabaddi prize" : `A job for ${giver?.name ?? e.where}`} · <b class="up">+${rs(e.amount)}</b>`);
        byDay.set(e.day, d);
        continue;
      }
      if (e.item.startsWith("unhire:")) {
        d.lines.push(`Cancelled ${HELPERS[e.item.slice(7) as HelperId]?.name ?? "a labourer"} · <b class="up">+${rs(e.amount)}</b>`);
        byDay.set(e.day, d);
        continue;
      }
      if (e.item.startsWith("hire:")) {
        d.lines.push(`Hired ${HELPERS[e.item.slice(5) as HelperId]?.name ?? "a labourer"} for a day · <b class="down">−${rs(e.amount)}</b>`);
        byDay.set(e.day, d);
        continue;
      }
      if (e.item.startsWith("fish:")) {
        d.lines.push(`Sold ${e.n} ${FISH[e.item.slice(5) as FishId]?.name.toLowerCase() ?? "fish"} · <b class="up">+${rs(e.amount)}</b>`);
        byDay.set(e.day, d);
        continue;
      }
      const name = e.item.startsWith("plot:")
        ? `the plot ${this.ctx.world.plots[Number(e.item.slice(5))]?.name ?? ""}`
        : e.kind === "sell" ? CROPS[e.item as CropId]?.name ?? e.item : SHOP.find((i) => i.id === e.item)?.name ?? e.item;
      const where = e.where === "town" ? " at the town mandi" : "";
      const prem = e.premium ? ` <span class="prem">(+${rs(e.premium)} town premium)</span>` : "";
      d.lines.push(`${e.kind === "sell" ? "Sold" : "Bought"} ${e.item.startsWith("plot:") ? "" : e.n + " "}${e.item.startsWith("plot:") || !CROPS[e.item as CropId] ? name : name.toLowerCase()}${where} · <b class="${e.kind === "sell" ? "up" : "down"}">${e.kind === "sell" ? "+" : "−"}${rs(e.amount)}</b>${prem}`);
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

  private offer(s: Save) {
    const m = current(s);
    if (m?.id !== "teej") return `<p class="empty">Ram Ram. You bow to Sevalal Maharaj. (During Teej, the tanda brings offerings here.)</p>`;
    const now = this.ctx.now();
    const h = clock(now).hour;
    const row = (c: CropId) => {
      const have = s.inv[c] ?? 0;
      return `<tr><td><i class="dot" style="background:${CROP_COLOR[c]}"></i>${CROPS[c].name}</td><td class="num">${have}</td><td class="acts"><button data-do="deliver:mandir:${c}" data-n="10" ${have ? "" : "disabled"}>Offer ${Math.min(10, have) || 10}</button></td></tr>`;
    };
    const night = h >= 19 || h < 4;
    return `<table><thead><tr><th>Offering</th><th class="num">You have</th><th></th></tr></thead><tbody>${row("jowar")}${row("onion")}</tbody></table>
      <div class="big-acts"><button data-do="teej" ${night ? "" : "disabled"}>${night ? "Join the Teej gathering" : "The gathering begins after 7 pm"}</button></div>`;
  }

  private loans(s: Save, day: number, lender: Lender) {
    const now = this.ctx.now();
    const L = LENDERS[lender];
    const limit = creditLimit(this.ctx.world, s, lender, now, day);
    const defaulted = s.loans.some((l) => isOverdue(l, now));
    const mine = s.loans.filter((l) => l.lender === lender);
    const list = mine.length
      ? mine.map((l) => {
          const due = owed(l, now);
          const left = (l.dueAt - now) / DAY_MS;
          const when = left >= 0 ? `due in ${left < 1 ? "under a day" : `${Math.floor(left)} day${Math.floor(left) === 1 ? "" : "s"}`}` : `<b class="down">overdue ${Math.ceil(-left)} day${Math.ceil(-left) === 1 ? "" : "s"} — late fee and double interest</b>`;
          return `<div class="plot-card"><div class="plot-head"><b>${rs(l.principal)} borrowed</b><span>you owe <b>${rs(due)}</b></span></div><small>${when}</small>
            <div class="acts list-row">Repay <span class="rupee">₹</span><input data-repay="${l.id}" value="${Math.min(due, Math.max(0, s.money))}" inputmode="numeric"><button data-do="repay:${l.id}:typed" ${s.money >= 1 ? "" : "disabled"}>Repay</button><button data-do="repay:${l.id}:all" ${s.money >= due ? "" : "disabled"}>Pay it all off (${rs(due)})</button></div></div>`;
        }).join("")
      : `<p class="empty">No loans from ${L.name}.</p>`;
    const terms = `${Math.round(L.rate * 100)}% a day, due in ${L.termDays} days; late: ${Math.round(L.lateFee * 100)}% fee and double interest.`;
    const form = defaulted
      ? `<p class="news glut">You have an overdue loan. Nobody will lend until it's paid.</p>`
      : `<div class="acts list-row">Borrow <span class="rupee">₹</span><input data-borrow value="${Math.min(limit, 2000)}" inputmode="numeric"><button data-do="borrow:${lender}" ${limit ? "" : "disabled"}>Borrow</button><button data-do="borrow:${lender}:${limit}" ${limit ? "" : "disabled"}>Max ₹${limit.toLocaleString("en-IN")}</button></div>`;
    return `<p class="hint">${terms} ${lender === "bank" ? "The bank lends up to 40% of the land you own." : "The sahukar lends to anyone — up to ₹3,000 plus a little against your land."}</p>
      <div class="plot-card">${form}</div>${list}`;
  }

  private godown(s: Save) {
    const now = this.ctx.now();
    const rows = CROP_IDS.map((c) => {
      const lot = s.godown[c];
      const rent = lot ? rentFor(lot, lot.n, now) : 0;
      return `<tr><td><i class="dot" style="background:${CROP_COLOR[c]}"></i>${CROPS[c].name}</td><td class="num">${s.inv[c] ?? 0}</td><td class="num">${lot?.n ?? 0}</td><td class="num">${rent ? rs(rent) : "—"}</td>
        <td class="acts"><input class="qty" data-gd="${c}" type="number" min="1" value="10"><button data-do="store:${c}" ${s.inv[c] ? "" : "disabled"}>Store</button><button data-do="store:${c}:all" ${s.inv[c] ? "" : "disabled"}>All</button><button data-do="withdraw:${c}" ${lot ? "" : "disabled"}>Take</button></td></tr>`;
    }).join("");
    return `<p class="hint">You can carry ${CARRY} (carrying ${carried(s)}). The godown holds ${GODOWN_CAPACITY} (${stored(s)} stored); rent is ₹${GODOWN_RENT} per unit per day, paid when you take it out. Hold a crop here through a glut and sell when the price recovers.</p>
      <table><thead><tr><th>Produce</th><th class="num">Carrying</th><th class="num">Stored</th><th class="num">Rent due</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private worth(s: Save, day: number) {
    const w = netWorth(this.ctx.world, s, this.ctx.now(), day);
    const t = titleFor(w.total);
    const prevMin = Math.max(0, t.min === -Infinity ? 0 : t.min);
    const pct = t.next ? Math.max(0, Math.min(100, ((w.total - prevMin) / (t.next.at - prevMin)) * 100)) : 100;
    const row = (k: string, v: number, neg = false) => `<tr><td>${k}</td><td class="num ${neg ? "down" : ""}">${neg ? "−" : ""}${rs(Math.abs(v))}</td></tr>`;
    return `<div class="title-card"><small>You are a</small><b>${t.name}</b><span>${t.local}</span>
        ${t.next ? `<div class="progress"><i style="width:${pct}%"></i></div><small>${rs(Math.max(0, t.next.at - w.total))} more to become a <b>${t.next.name}</b></small>` : `<small>The highest a farmer can rise.</small>`}</div>
      <table>${row("Cash", w.money)}${row("Land (with crops & improvements)", w.land)}${row("Produce (carried, stored, on the cart)", w.goods)}${row("Bulls, cart & tools", w.livestock)}${row("Loans", w.debt, true)}
      <tfoot><tr><td>Net worth</td><td class="num"><b>${rs(w.total)}</b></td></tr></tfoot></table>`;
  }

  private load(s: Save, day: number) {
    const b = s.bulls ? bullsNow(s.bulls, this.ctx.now()) : null;
    const status = b ? `<p class="hint">🐂 ${BULL_NAMES.join(" & ")} · stamina ${Math.round(b.stamina)} · ${bullsMoodWord(b.mood)}. The trip costs ${TRIP_COST} stamina.</p>` : "";
    let room = CART_CAPACITY;
    const rows = CROP_IDS.map((c) => {
      const have = s.inv[c] ?? 0;
      const n = Math.min(have, room);
      room -= n;
      const v = buyerPrice(c, day, "village"), t = buyerPrice(c, day, "town");
      return `<tr><td><i class="dot" style="background:${CROP_COLOR[c]}"></i>${CROPS[c].name}</td><td class="num">${have}</td><td class="num">${rs(v)}</td><td class="num"><b>${rs(t)}</b> <span class="up">+${Math.round((t / v - 1) * 100)}%</span></td>
        <td class="acts"><input class="qty" data-load="${c}" type="number" min="0" max="${have}" value="${n}" ${have ? "" : "disabled"}></td></tr>`;
    }).join("");
    const any = CROP_IDS.some((c) => (s.inv[c] ?? 0) > 0);
    return `${status}<table><thead><tr><th>Produce</th><th class="num">You have</th><th class="num">Village</th><th class="num">Town</th><th class="num">Load</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="big-acts"><button data-do="setOff" ${any ? "" : "disabled"}>Set off for the town mandi →</button></div>
      <p class="hint">The cart holds ${CART_CAPACITY}. The ride takes about half a minute along the road east.</p>`;
  }

  private mandi(s: Save, day: number) {
    if (this.tab === "sold" || !s.trip) {
      const last = s.ledger.filter((l) => l.where === "town" && l.day === day);
      const total = last.reduce((a, l) => a + l.amount, 0), prem = last.reduce((a, l) => a + (l.premium ?? 0), 0);
      const summary = last.length ? `<p class="sold">Sold for <b>${rs(total)}</b> — <b class="up">${rs(prem)} more</b> than Ganpat would have paid today.</p>` : `<p class="empty">Nothing on the cart. Load it at home and ride here to sell at town prices.</p>`;
      return `${summary}<div class="big-acts"><button data-do="rideHome">Ride home ←</button><button class="ghost" data-do="close">Stay in town a while</button></div>`;
    }
    const rows = Object.entries(s.trip.load).map(([c, n]) => {
      const t = buyerPrice(c as CropId, day, "town"), v = buyerPrice(c as CropId, day, "village");
      return `<tr><td><i class="dot" style="background:${CROP_COLOR[c as CropId]}"></i>${CROPS[c as CropId].name}</td><td class="num">${n}</td><td class="num">${rs(t)}</td><td class="num"><b>${rs(Math.round(t * n))}</b></td><td class="num up">+${rs(Math.round(t * n) - Math.round(v * n))}</td></tr>`;
    }).join("");
    return `<table><thead><tr><th>On the cart</th><th class="num">Qty</th><th class="num">Town price</th><th class="num">You get</th><th class="num">vs village</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="big-acts"><button data-do="sellTown">Sell the load</button></div>`;
  }

  private plots(s: Save, day: number) {
    const w = this.ctx.world;
    const bar = (v: number) => `<span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span>`;
    const rows = w.plots
      .map((p) => {
        const mine = s.plots.includes(p.id);
        const sale = !mine && forSale(p, day);
        const price = askingPrice(p, day);
        const status = mine ? (s.listings[p.id] ? `<b class="listed">listed ₹${s.listings[p.id].price.toLocaleString("en-IN")}</b>` : `<b class="up">yours</b>`) : sale ? rs(price) : `<span class="flat">not for sale</span>`;
        const act = sale ? `<button data-do="buyPlot:${p.id}" ${s.money >= price ? "" : "disabled"}>Buy</button>` : "";
        return { sort: mine ? 0 : sale ? 1 : 2, price, html: `<tr><td><b>${p.name}</b><br><small>${p.x1 - p.x0 + 1} × ${p.z1 - p.z0 + 1} · ${soilName(w, p)}</small></td>
          <td>${bar(p.soil)}</td><td>${bar(p.water)}</td><td>${bar(p.road)}</td><td class="num">${status}</td><td class="acts">${act}</td></tr>` };
      })
      .sort((a, b) => a.sort - b.sort || a.price - b.price)
      .map((r) => r.html)
      .join("");
    return `<p class="hint">The village puts a few plots on the market each week. Prices follow soil, water from the river or wells, and how close the road is. <button class="link" data-do="map">Open the map (M)</button></p>
      <table class="plots"><thead><tr><th>Plot</th><th>Soil</th><th>Water</th><th>Road</th><th class="num">Price</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private mine(s: Save, day: number) {
    const w = this.ctx.world;
    const now = this.ctx.now();
    return s.plots
      .map((id) => {
        const p = w.plots[id];
        const v = valuePlot(w, s, p, now, day);
        const listing = s.listings[id];
        const parts = `land ${rs(v.land)} · tilled ${rs(v.tilled)} · buildings ${rs(v.buildings)} · standing crops ${rs(v.crops)}`;
        let action: string;
        if (listing) {
          const offers = offersFor(p, listing, day, v.total);
          const list = offers.length
            ? offers.map((o) => `<div class="offer"><span><b>${o.buyer}</b> offers <b>${rs(o.amount)}</b> <small>(${o.expires - day <= 0 ? "last day" : `${o.expires - day} more day${o.expires - day > 1 ? "s" : ""}`})</small></span><button data-do="accept:${id}:${o.day}">Accept</button></div>`).join("")
            : `<p class="hint">Listed at ${rs(listing.price)}. No offers yet — buyers come by over the next game days. A price near the value brings them faster.</p>`;
          action = `${list}<div class="acts"><button class="ghost" data-do="delist:${id}">Take it off the market</button></div>`;
        } else {
          action = `<div class="acts list-row">Ask <span class="rupee">₹</span><input data-price="${id}" value="${Math.round((v.total * 1.05) / 100) * 100}" inputmode="numeric"><button data-do="list:${id}">List for sale</button></div>`;
        }
        const drip = s.drip.includes(id) ? `<div class="acts"><span class="up">💧 Drip irrigation installed</span></div>` : s.inv.drip ? `<div class="acts"><button data-do="drip:${id}">Install the drip set here</button></div>` : "";
        return `<div class="plot-card"><div class="plot-head"><b>${p.name}</b><span>worth about <b>${rs(v.total)}</b></span></div><small>${parts}</small>${drip}${action}</div>`;
      })
      .join("");
  }

  private buy(s: Save) {
    const m = current(s);
    const order = m?.id === "order" ? `<div class="order-card"><b>Sitabai's order for Teej</b> — 20 jowar for the feast. You have ${s.inv.jowar ?? 0}.
      <button data-do="deliver:sitabai:jowar" data-n="20" ${(s.inv.jowar ?? 0) >= 20 ? "" : "disabled"}>Deliver 20 jowar</button></div>` : "";
    return order + this.buyTable(s);
  }

  private buyTable(s: Save) {
    const section = (i: { id: string }) =>
      i.id.startsWith("seed:") ? "Seeds" : i.id.startsWith("block:") ? "Building" : ["bulls", "cart", "fodder", "gerua"].includes(i.id) ? "Bulls & cart" : i.id === "drip" ? "Irrigation" : "Tools";
    let last = "";
    const rows = SHOP.filter((i) => !i.id.startsWith("block:")).map((i) => {
      const head = section(i) !== last ? `<tr class="section"><td colspan="4">${(last = section(i))}</td></tr>` : "";
      const have = s.inv[i.id] ?? 0;
      const one = i.max === 1;
      const owned = one && have >= 1;
      const afford = (n: number) => (s.money >= i.price * n ? "" : "disabled");
      const icon = i.id === "drip" ? "💧" : i.id === "gerua" ? "🎨" : i.id === "bulls" ? "🐂" : i.id === "cart" ? "🛞" : i.id === "fodder" ? "🌾" : i.id === "plough" ? "⛏" : i.id.startsWith("block:") ? `<i class="dot sq" style="background:${blockColor(Number(i.id.slice(6)))}"></i>` : i.id.startsWith("seed:") ? `<i class="dot" style="background:${CROP_COLOR[i.id.slice(5) as CropId]}"></i>` : "🪣";
      return `${head}<tr><td>${icon} ${i.name}${i.note ? `<br><small>${i.note}</small>` : ""}</td><td class="num">${one ? (owned ? "owned" : "—") : have}</td><td class="num">${i.id.startsWith("seed:") && s.perks.includes("discount") ? `<s>${rs(i.price)}</s> ${rs(i.price * 0.8)}` : rs(i.price)}</td>
        <td class="acts">${owned ? "" : `<button data-do="buy" data-item="${i.id}" data-n="1" ${afford(1)}>Buy${one ? "" : " 1"}</button>`}${one ? "" : `<button data-do="buy" data-item="${i.id}" data-n="10" ${afford(10)}>10</button>`}</td></tr>`;
    }).join("");
    return `<table><thead><tr><th>Item</th><th class="num">You have</th><th class="num">Price</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}

function soilName(w: World, p: { x0: number; z0: number; y: number }) {
  const id = w.voxels[p.x0 + 3 + 192 * (p.z0 + 3 + 192 * p.y)];
  return id === 24 ? "red soil" : "black soil";
}

const BLOCK_COLORS: Record<string, string> = { Planks: "#b58a58", Brick: "#b5563a", Whitewash: "#ece4d4", Thatch: "#c9a45c", Cobblestone: "#9a958c", Fence: "#7a5c3c", "Roof tiles": "#b8553a", "Hay bale": "#d9b35a" };
const blockColor = (id: number) => BLOCK_COLORS[block(id).name] ?? "#888";
