import { CROPS } from "../../shared/crops";
import type { Away, DaySummary } from "../../shared/summary";

/*
 * The morning card after you sleep (how yesterday went, and what today holds) and the welcome-back
 * card when you return after a while. One card, two uses.
 */
const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export class SummaryCard {
  private el: HTMLElement;
  open = false;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "panel summary";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener("click", (e) => (e.target as HTMLElement).closest("[data-go]") && this.close());
    this.el.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        this.close();
      }
    });
  }

  private show(eyebrow: string, title: string, rows: string[], button: string) {
    this.el.innerHTML = `<div class="panel-card"><div class="dlg-who">${eyebrow}</div><h2>${title}</h2><ul class="sum-rows">${rows.map((r) => `<li>${r}</li>`).join("")}</ul><div class="big-acts"><button data-go>${button}</button></div></div>`;
    this.el.hidden = false;
    this.open = true;
    (this.el.querySelector("[data-go]") as HTMLButtonElement | null)?.focus();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }

  /** After a night's sleep: yesterday's takings, and today's field and market. */
  morning(dayLabel: string, d: DaySummary, a: Away) {
    const i = d.income;
    const earned = [["crops", i.crops], ["fish", i.fish], ["kaam", i.kaam], ["kabaddi", i.kabaddi], ["land", i.land]].filter(([, v]) => (v as number) > 0) as [string, number][];
    const rows = [
      earned.length ? `<b>Yesterday you earned ${rs(earned.reduce((a, [, v]) => a + v, 0))}</b><span>${earned.map(([k, v]) => `${k} ${rs(v)}`).join(" · ")}</span>` : `<b>A quiet day yesterday</b><span>Nothing sold. Ganpat Seth buys produce and fish on the chowk.</span>`,
      d.costs ? `<b>You spent ${rs(d.costs)}</b><span>${d.net >= 0 ? `ahead by ${rs(d.net)}` : `behind by ${rs(-d.net)}`} for the day</span>` : "",
      ...this.today(a),
    ].filter(Boolean);
    this.show(dayLabel, "Good morning, Ukhali!", rows, "Start the day");
  }

  /** Back after a while: what's waiting. */
  away(hoursAway: string, a: Away) {
    this.show(`Welcome back · you were away ${hoursAway}`, "Ram Ram! Here's what's waiting", this.today(a), "Let's go");
  }

  private today(a: Away) {
    const crop = CROPS[a.best.crop].name.toLowerCase();
    return [
      a.ripe ? `<b>🌾 ${a.ripe} crop${a.ripe === 1 ? " is" : "s are"} ripe in your fields</b><span>Hold right-click (or Use) and walk the rows to harvest them.</span>` : "",
      a.dry ? `<b>💧 ${a.dry} growing crop${a.dry === 1 ? " is" : "s are"} dry</b><span>Watered crops grow twice as fast.</span>` : "",
      !a.ripe && !a.dry && a.growing ? `<b>🌱 ${a.growing} crop${a.growing === 1 ? " is" : "s are"} growing well</b><span>Nothing needs you in the fields right now.</span>` : "",
      `<b>📈 Ganpat pays best for ${crop} today: ${rs(a.best.price)}</b><span>${a.best.vsUsual >= 0 ? `${Math.round(a.best.vsUsual * 100)}% above` : `${Math.round(-a.best.vsUsual * 100)}% below`} the usual price</span>`,
      a.openKaam ? `<b>📋 ${a.openKaam} kaam open today</b><span>Look for the ! over the neighbours' heads.</span>` : "",
      a.loansDueSoon ? `<b class="due">⏳ ${a.loansDueSoon} loan${a.loansDueSoon === 1 ? "" : "s"} due within a day</b><span>Repay at the bank or the sahukar to avoid the late fee.</span>` : "",
    ].filter(Boolean);
  }
}
