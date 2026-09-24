import type { Action } from "../shared/rules";
import type { Save } from "../shared/save";
import type { Game } from "./game";

/*
 * Talks to /api. Actions are applied locally first (instant feel), queued, and sent in batches.
 * The server re-validates each with the same rules and returns the authoritative save, which
 * replaces ours — any unsent actions are replayed on top. A refused action simply disappears.
 */
const TOKEN_KEY = "bailgaadi.token";
export type SyncStatus = "saved" | "saving" | "offline";

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (t: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* private mode: this session only */
  }
};

type StateReply = { save: Save; recoveryCode: string; serverNow: number };

export class Net {
  token: string | null = readToken();
  recoveryCode = "";
  status: SyncStatus = "saved";
  private queue: Action[] = [];
  private inFlight = false;
  private retryMs = 1000;
  private timer = 0;
  onStatus: (s: SyncStatus) => void = () => {};
  onRejected: (errors: string[]) => void = () => {};

  private async call<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const r = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: (await r.json().catch(() => ({}))) as T };
  }

  /** Sign in (a new guest the first time) and fetch the save. Throws if the server can't be reached. */
  async boot(): Promise<StateReply> {
    if (this.token) {
      const r = await this.call<StateReply>("state");
      if (r.status === 200) return this.accept(r.data);
      if (r.status !== 401) throw new Error(`state ${r.status}`);
    }
    const s = await this.call<{ token: string }>("session", {});
    if (s.status !== 201) throw new Error(`session ${s.status}`);
    this.token = s.data.token;
    writeToken(this.token);
    const r = await this.call<StateReply>("state");
    if (r.status !== 200) throw new Error(`state ${r.status}`);
    return this.accept(r.data);
  }

  /** Continue a farm from another device. Returns an error message, or null on success. */
  async restore(code: string): Promise<string | null> {
    const s = await this.call<{ token?: string; error?: string }>("session", { recoveryCode: code });
    if (s.status !== 200 || !s.data.token) return s.data.error ?? "Couldn't reach the village.";
    this.token = s.data.token;
    writeToken(this.token);
    return null;
  }

  private accept(d: StateReply) {
    this.recoveryCode = d.recoveryCode;
    return d;
  }

  private game: Game | null = null;
  attach(game: Game) {
    this.game = game;
    game.onAct = (a) => this.push(a);
    window.addEventListener("pagehide", () => this.flushOnExit());
  }

  private setStatus(s: SyncStatus) {
    if (s !== this.status) {
      this.status = s;
      this.onStatus(s);
    }
  }

  push(a: Action) {
    this.queue.push(a);
    this.setStatus("saving");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 250); // a burst of clicks goes as one batch
  }

  /** Send queued actions. Resolves when this batch is confirmed (or failed). */
  async flush(): Promise<void> {
    if (this.inFlight || !this.queue.length || !this.game) return;
    const batch = this.queue.splice(0, 200);
    this.inFlight = true;
    try {
      const r = await this.call<{ results: { ok: boolean; error?: string }[]; save: Save; serverNow: number }>("act", { actions: batch });
      if (r.status !== 200) throw new Error(`act ${r.status}`);
      this.game.skew = r.data.serverNow - Date.now();
      const refused = r.data.results.filter((x) => !x.ok).map((x) => x.error ?? "Refused");
      // the server's save is the truth; replay what the player did while this batch was travelling
      const pending = this.queue.slice();
      const next = r.data.save;
      const g = this.game;
      g.replaceSave(next);
      if (pending.length) {
        g.replay(pending);
        g.replaceSave(g.save);
      }
      if (refused.length) this.onRejected(refused);
      this.retryMs = 1000;
      this.setStatus(this.queue.length ? "saving" : "saved");
    } catch {
      this.queue.unshift(...batch); // keep them; try again soon
      this.setStatus("offline");
      this.timer = window.setTimeout(() => this.flush(), this.retryMs);
      this.retryMs = Math.min(15000, this.retryMs * 2);
    } finally {
      this.inFlight = false;
    }
    if (this.queue.length && this.status !== "offline") await this.flush();
  }

  private flushOnExit() {
    if (!this.queue.length || !this.token) return;
    fetch("/api/act", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ actions: this.queue.splice(0, 200) }),
    }).catch(() => {});
  }

  /** Dev only: fast-forward the server's clock for this save. */
  async skip(ms: number) {
    await this.flush();
    const r = await this.call<{ save: Save; serverNow: number }>("dev", { skipMs: ms });
    if (r.status !== 200 || !this.game) throw new Error(`dev ${r.status}`);
    this.game.skew = r.data.serverNow - Date.now();
    this.game.replaceSave(r.data.save);
  }
}
