import { LANG } from "../i18n";

/*
 * A picture card the first time you fish or play kabaddi: a small drawing and three steps. Shown once
 * per device; the help card (H) covers the rest.
 */
const W = { en: 0, mr: 1, hi: 2 }[LANG];
const pick = (en: string, mr: string, hi: string) => [en, mr, hi][W];
const touch = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1);

const FISHING_SVG = `<svg viewBox="0 0 360 120" class="howto-art" aria-hidden="true">
  <rect x="0" y="62" width="360" height="58" rx="8" fill="#3d6f7a" opacity=".55"/>
  <path d="M20 20 L110 58" stroke="#c8a868" stroke-width="3"/><path d="M110 58 Q120 66 124 70" stroke="#e8e4da" stroke-width="1.2" fill="none"/>
  <circle cx="124" cy="70" r="6" fill="#d8342a"/><circle cx="124" cy="66" r="3.5" fill="#f6f2e8"/>
  <text x="124" y="104" text-anchor="middle" font-size="13" fill="#fff4dc">1 · ${pick("wait", "थांबा", "रुकें")}</text>
  <circle cx="190" cy="76" r="6" fill="#d8342a"/><circle cx="190" cy="80" r="14" fill="none" stroke="#e8f0ee" stroke-width="1.5"/>
  <text x="190" y="30" text-anchor="middle" font-size="22" fill="#ffd98a">!</text>
  <text x="190" y="104" text-anchor="middle" font-size="13" fill="#fff4dc">2 · ${pick("strike", "झटका", "झटका")}</text>
  <rect x="236" y="36" width="104" height="10" rx="5" fill="#ffffff" opacity=".2"/><rect x="236" y="36" width="60" height="10" rx="5" fill="#e8c040"/>
  <line x1="311" y1="32" x2="311" y2="50" stroke="#fff" stroke-width="2"/>
  <text x="288" y="68" text-anchor="middle" font-size="12" fill="#fff4dc">${pick("hold · let go", "धरा · सोडा", "पकड़ें · छोड़ें")}</text>
  <text x="288" y="104" text-anchor="middle" font-size="13" fill="#fff4dc">3 · ${pick("reel", "ओढा", "खींचें")}</text>
</svg>`;

const KABADDI_SVG = `<svg viewBox="0 0 360 150" class="howto-art" aria-hidden="true">
  <rect x="20" y="10" width="320" height="130" rx="4" fill="#9a7c56" opacity=".55" stroke="#f3efe4" stroke-width="2"/>
  <line x1="180" y1="10" x2="180" y2="140" stroke="#f3efe4" stroke-width="3"/>
  <line x1="250" y1="10" x2="250" y2="140" stroke="#f3efe4" stroke-width="1.2" stroke-dasharray="4 4"/>
  <text x="100" y="30" text-anchor="middle" font-size="12" fill="#fff4dc">${pick("your half", "तुमची बाजू", "आपका हिस्सा")}</text>
  <text x="260" y="30" text-anchor="middle" font-size="12" fill="#fff4dc">${pick("theirs", "त्यांची", "उनका")}</text>
  <circle cx="140" cy="80" r="9" fill="#1f5fbf"/><text x="140" y="84" text-anchor="middle" font-size="11" fill="#fff">${pick("you", "तुम्ही", "आप")}</text>
  <path d="M150 76 Q220 40 262 70" stroke="#ffd98a" stroke-width="2.5" fill="none" marker-end="url(#ah)"/>
  <path d="M262 94 Q220 124 152 94" stroke="#9ed67a" stroke-width="2.5" fill="none" marker-end="url(#ah2)"/>
  ${[[270, 62], [300, 88], [275, 112], [310, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#e0762a"/>`).join("")}
  <text x="226" y="46" text-anchor="middle" font-size="11" fill="#ffd98a">${pick("tag", "शिवा", "छुएँ")}</text>
  <text x="150" y="130" text-anchor="middle" font-size="11" fill="#9ed67a">${pick("back in one breath", "एका श्वासात परत", "एक साँस में वापस")}</text>
  <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#ffd98a"/></marker>
  <marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#9ed67a"/></marker></defs>
</svg>`;

const CARDS = {
  fishing: {
    title: () => pick("Fishing in the talav", "तलावात मासेमारी", "तालाब में मछली"),
    art: FISHING_SVG,
    steps: () => [
      pick("Watch the float. When it dips, <b>strike</b>: " + (touch ? "tap the button." : "click, E or Space."), "तरंगणी पहा. ती बुडाली की <b>झटका</b> द्या: " + (touch ? "बटण दाबा." : "क्लिक, E किंवा Space."), "तैरती गोली देखें. डूबे तो <b>झटका</b> दें: " + (touch ? "बटन दबाएँ." : "क्लिक, E या Space.")),
      pick("<b>Hold</b> to reel in. When the fish pulls hard and the tension turns red, <b>let go</b> or the line snaps.", "ओढण्यासाठी <b>दाबून धरा</b>. मासा जोरात ओढू लागला आणि ताण लाल झाला की <b>सोडा</b>, नाहीतर दोरी तुटेल.", "खींचने के लिए <b>दबाए रखें</b>. मछली ज़ोर से खींचे और तनाव लाल हो तो <b>छोड़ दें</b>, नहीं तो डोरी टूटेगी."),
      pick("Fish bite best at dawn and in the evening. Settings has an easier mode.", "पहाटे आणि संध्याकाळी मासे जास्त लागतात. सेटिंग्जमध्ये सोपी पद्धत आहे.", "सुबह और शाम मछलियाँ ज़्यादा फँसती हैं. सेटिंग्स में आसान तरीका है."),
    ],
    go: () => pick("Cast", "गळ टाका", "काँटा डालें"),
  },
  kabaddi: {
    title: () => pick("Kabaddi · Ukhali vs the Hanuman Club", "कबड्डी · उखळी विरुद्ध हनुमान क्लब", "कबड्डी · उखळी बनाम हनुमान क्लब"),
    art: KABADDI_SVG,
    steps: () => [
      pick(`Your raid: cross the midline and <b>tag</b> a defender (${touch ? "tap Tag" : "click"}, or hold it to tag the moment one is in reach).`, `तुमची चढाई: मधली रेषा ओलांडा आणि बचाव करणाऱ्याला <b>शिवा</b> (${touch ? "शिवा दाबा" : "क्लिक करा"}, किंवा दाबून धरा).`, `आपकी रेड: बीच की रेखा पार करें और किसी डिफ़ेंडर को <b>छुएँ</b> (${touch ? "छुएँ दबाएँ" : "क्लिक करें"}, या दबाए रखें).`),
      pick("Get back over the midline before your breath runs out, and don't let them catch you.", "श्वास संपण्याआधी मधल्या रेषेपलीकडे परत या, आणि पकडले जाऊ नका.", "साँस ख़त्म होने से पहले बीच की रेखा के पार लौटें, और पकड़े न जाएँ."),
      pick("Their raid: tackle their raider before he touches someone and gets away. Five raids each; the day's first win pays ₹101.", "त्यांची चढाई: त्यांचा खेळाडू कोणाला शिवून पळण्याआधी त्याला पकडा. प्रत्येकी पाच चढाया; दिवसाच्या पहिल्या विजयाला ₹101.", "उनकी रेड: उनका रेडर किसी को छूकर भागे उससे पहले उसे पकड़ें. हर टीम पाँच रेड; दिन की पहली जीत पर ₹101."),
    ],
    go: () => pick("Let's play!", "खेळू या!", "खेलें!"),
  },
};
export type HowTo = keyof typeof CARDS;

export class HowToCard {
  private el: HTMLElement;
  open = false;
  private go: () => void = () => {};
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "panel howto";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-go]")) {
        this.close();
        this.go();
      } else if (t.closest("[data-close]")) this.close();
    });
  }

  /** Has this card been shown on this device? */
  static seen(k: HowTo) {
    try {
      return localStorage.getItem(`tanda.howto.${k}`) === "1";
    } catch {
      return true;
    }
  }

  show(k: HowTo, go: () => void) {
    try {
      localStorage.setItem(`tanda.howto.${k}`, "1");
    } catch { /* ignore */ }
    const c = CARDS[k];
    this.go = go;
    this.el.innerHTML = `<div class="panel-card"><button class="x" data-close>✕</button><h2>${c.title()}</h2>${c.art}<ol class="howto-steps">${c.steps().map((s) => `<li>${s}</li>`).join("")}</ol><div class="big-acts"><button data-go>${c.go()}</button></div></div>`;
    this.el.hidden = false;
    this.open = true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }
}
