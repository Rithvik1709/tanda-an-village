/*
 * The phone menu (☰): everything the desktop pause panel and keyboard shortcuts give you, as big
 * buttons — and your recovery code.
 */
export class PhoneMenu {
  private el: HTMLElement;
  open = false;
  onPick: (what: "map" | "board" | "help" | "settings" | "view" | "torch" | "account") => void = () => {};
  onRestore: (code: string) => Promise<string | null> = async () => null;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, private code: () => string) {
    this.el = document.createElement("div");
    this.el.className = "panel phone-menu";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest("[data-m]") as HTMLElement | null;
      if (t === this.el || t.closest("[data-close]")) return this.close();
      if (!b) return;
      const m = b.dataset.m!;
      if (m === "copy") {
        await navigator.clipboard?.writeText(this.code()).catch(() => {});
        b.textContent = "Copied ✓";
        return;
      }
      this.close();
      this.onPick(m as "map");
    });
    this.el.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      const msg = this.el.querySelector(".pm-msg")!;
      msg.textContent = "Checking…";
      msg.textContent = (await this.onRestore((f.code as HTMLInputElement).value)) ?? "Loading that farm…";
    });
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.el.innerHTML = `<div class="panel-card">
      <button class="x" data-close>✕</button>
      <h2>Menu</h2>
      <div class="pm-grid">
        <button data-close class="pm-primary">▶ Continue</button>
        <button data-m="account">☁ Save your farm</button>
        <button data-m="map">Map</button>
        <button data-m="view">Change view</button>
        <button data-m="torch">Torch on / off</button>
        <button data-m="board">Leaderboard</button>
        <button data-m="help">How to play</button>
        <button data-m="settings">Settings</button>
      </div>
      <div class="pm-code"><span>Your farm is saved online. Recovery code</span><code>${this.code()}</code><button data-m="copy">Copy</button></div>
      <form class="pm-restore"><input name="code" placeholder="Have a code? XXXX-XXXX-XXXX" maxlength="16" autocomplete="off"><button>Continue that farm</button></form>
      <div class="pm-msg"></div>
    </div>`;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }
}
