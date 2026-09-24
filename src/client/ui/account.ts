import type { AccountInfo } from "../net";

/*
 * "Save your farm": sign in with Google, or with a link sent by email, so the farm follows its
 * farmer to any phone or computer. Offered once the first mission is done (a guest can play the
 * start without any sign-up), again a little later if they chose "Maybe later", and any time from
 * the menu. Signed in, the same card shows where the farm is saved and lets you sign out.
 */
const LATER = "tanda.signin.later"; // the mission index when they last said "maybe later"

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const G = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

export class AccountCard {
  private el: HTMLElement;
  open = false;
  onClose: () => void = () => {};
  onGoogle: () => void = () => {};
  onEmail: (email: string) => Promise<string | null> = async () => null;
  onSignOut: () => void = () => {};

  constructor(parent: HTMLElement, private info: () => { account: AccountInfo | null; code: string; enabled: boolean }) {
    this.el = document.createElement("div");
    this.el.className = "panel account-card";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener("keydown", (e) => e.stopPropagation()); // typing an email mustn't walk the farmer
    this.el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t.closest("[data-close]")) return this.close();
      if (t.closest("[data-later]")) {
        try {
          localStorage.setItem(LATER, String(this.mission));
        } catch {
          /* ignore */
        }
        return this.close();
      }
      if (t.closest("[data-google]")) return this.onGoogle();
      if (t.closest("[data-signout]")) return this.onSignOut();
    });
    this.el.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      const input = f.querySelector("input") as HTMLInputElement;
      const msg = this.el.querySelector(".ac-msg") as HTMLElement;
      const btn = f.querySelector("button") as HTMLButtonElement;
      btn.disabled = true;
      msg.className = "ac-msg";
      msg.textContent = "Sending…";
      const err = await this.onEmail(input.value.trim());
      btn.disabled = false;
      if (err) {
        msg.className = "ac-msg bad";
        msg.textContent = err;
        return;
      }
      this.el.querySelector(".panel-card")!.innerHTML = `<button class="x" data-close>✕</button>
        <div class="ac-icon">✉️</div><h2>Check your email</h2>
        <p class="lede">We sent a sign-in link to <b>${esc(input.value.trim())}</b>. Open it on this device and your farm is saved. (It can take a minute; look in spam too.)</p>
        <div class="big-acts"><button data-close>Back to the farm</button></div>`;
    });
  }

  private mission = 0;

  /** Should we offer sign-in now? After the first mission, and once more two missions after "later". */
  static due(mission: number) {
    let later: number | null = null;
    try {
      const v = localStorage.getItem(LATER);
      later = v === null ? null : Number(v);
    } catch {
      /* ignore */
    }
    return mission >= 1 && (later === null || (mission >= later + 2 && later < 3));
  }

  show(mission = 0, prompted = false) {
    this.mission = mission;
    this.open = true;
    this.el.hidden = false;
    const { account, code, enabled } = this.info();
    if (account) {
      const how = account.provider === "google" ? "your Google account" : "your email";
      this.el.innerHTML = `<div class="panel-card"><button class="x" data-close>✕</button>
        <div class="ac-icon">✅</div><h2>Your farm is saved</h2>
        <p class="lede">It's saved to ${how}, <b>${esc(account.email)}</b>. Sign in with it on any phone or computer and carry on where you left off.</p>
        <div class="big-acts"><button data-close class="pm-primary">Back to the farm</button><button data-signout class="ghost">Sign out of this device</button></div>
        <details class="ac-code"><summary>Recovery code</summary><p>Also works without signing in: <code>${esc(code)}</code></p></details></div>`;
      return;
    }
    if (!enabled) {
      this.el.innerHTML = `<div class="panel-card"><button class="x" data-close>✕</button>
        <div class="ac-icon">🔑</div><h2>Your recovery code</h2>
        <p class="lede">Signing in isn't available right now. Keep this code; it brings your farm back on any device: <code class="big-code">${esc(code)}</code></p>
        <div class="big-acts"><button data-close>Back to the farm</button></div></div>`;
      return;
    }
    this.el.innerHTML = `<div class="panel-card"><button class="x" data-close>✕</button>
      <div class="ac-icon">🌾</div><h2>${prompted ? "Well farmed! Now save your farm" : "Save your farm"}</h2>
      <p class="lede">Sign in so your fields, money and bulls follow you to any phone or computer. It's free, and there's no password to remember.</p>
      <button class="ac-google" data-google>${G}<span>Continue with Google</span></button>
      <div class="ac-or"><span>or</span></div>
      <form class="ac-email"><input type="email" name="email" placeholder="you@example.com" autocomplete="email" inputmode="email" required><button>Email me a link</button></form>
      <div class="ac-msg"></div>
      <p class="ac-legal">By signing in you agree to the <a href="/terms" target="_blank" rel="noopener">terms</a>. We keep only your email to save your farm: <a href="/privacy" target="_blank" rel="noopener">privacy</a>.</p>
      ${prompted ? `<button class="ac-later" data-later>Maybe later</button>` : ""}
      <details class="ac-code"><summary>Or keep your recovery code</summary><p>Without signing in, this code is the only way back to your farm: <code>${esc(code)}</code></p></details></div>`;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }
}
