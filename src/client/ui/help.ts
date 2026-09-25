import { LANG } from "../i18n";

/*
 * The H card, in the chosen language: phone words on a phone, keys on a computer.
 */
const TOUCH_UI = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1);
const W = { en: 0, mr: 1, hi: 2 }[LANG];
const pick = (en: string, mr: string, hi: string) => [en, mr, hi][W];
const row = (b: string, t: string) => `<div><b>${b}</b><span>${t}</span></div>`;

export function helpRows() {
  return TOUCH_UI
    ? [
        row(pick("Move", "चालणे", "चलना"), pick("Left thumb anywhere on the lower left to walk (push far to run). Drag the right side of the screen to look.", "खालच्या डाव्या बाजूला कुठेही डावा अंगठा ठेवून चाला (दूर ढकलले की धावा). पाहण्यासाठी स्क्रीनची उजवी बाजू ओढा.", "नीचे बाईं ओर कहीं भी बायाँ अँगूठा रखकर चलें (दूर धकेलें तो दौड़ें). देखने के लिए स्क्रीन का दायाँ हिस्सा खींचें.")),
        row(pick("Use", "वापरा", "इस्तेमाल"), pick("Look at the soil and tap <b>Use</b>: it ploughs, sows, waters, fills the can or harvests, whatever the soil needs. Hold it and walk to do a whole row.", "मातीकडे पाहून <b>वापरा</b> दाबा: मातीला हवे ते होते — नांगरणी, पेरणी, पाणी, झारी भरणे किंवा कापणी. पूर्ण ओळीसाठी दाबून धरा आणि चाला.", "मिट्टी की ओर देखकर <b>इस्तेमाल</b> दबाएँ: मिट्टी को जो चाहिए वही होता है — जुताई, बुवाई, पानी, झारा भरना या कटाई. पूरी क़तार के लिए दबाए रखें और चलें.")),
        row(pick("Talk &amp; trade", "बोलणे व व्यापार", "बात और व्यापार"), pick("Tap the button that appears near a stall or person.", "दुकान किंवा माणसाजवळ दिसणारे बटण दाबा.", "दुकान या व्यक्ति के पास दिखने वाला बटन दबाएँ.")),
        row(pick("Bulls &amp; cart", "बैल व गाडी", "बैल और गाड़ी"), pick("<b>Plough</b> in your field · <b>Tie</b> behind your house · <b>Feed</b> near your bulls · <b>Cart</b> by your cart to ride to the mandi.", "शेतात <b>नांगरा</b> · घरामागे <b>बांधा</b> · बैलांजवळ <b>चारा</b> · मंडीसाठी गाडीजवळ <b>गाडी</b>.", "खेत में <b>जोतें</b> · घर के पीछे <b>बाँधें</b> · बैलों के पास <b>चारा</b> · मंडी के लिए गाड़ी के पास <b>गाड़ी</b>.")),
        row(pick("Pastimes", "विरंगुळा", "मनोरंजन"), pick("📋 <b>Kaam</b>: a <b>!</b> over someone's head means they have a job for you · 🤼 <b>Kabaddi</b> on the maidan behind the school (tap <b>Tag</b>) · 🎣 <b>Fishing</b> in the talav beyond it (a gal from Sitabai; hold the button to reel)", "📋 <b>काम</b>: डोक्यावर <b>!</b> म्हणजे तुमच्यासाठी काम · 🤼 शाळेमागच्या मैदानावर <b>कबड्डी</b> (<b>शिवा</b> दाबा) · 🎣 त्यापलीकडच्या तलावात <b>मासेमारी</b> (सीताबाईंकडून गळ; ओढण्यासाठी बटण दाबून धरा)", "📋 <b>काम</b>: सिर पर <b>!</b> यानी आपके लिए काम · 🤼 स्कूल के पीछे मैदान में <b>कबड्डी</b> (<b>छुएँ</b> दबाएँ) · 🎣 उसके आगे तालाब में <b>मछली</b> (सीताबाई से काँटा; खींचने के लिए बटन दबाए रखें)")),
        row(pick("Other", "इतर", "और"), pick("<b>Map</b> · ☰ menu: view, torch, recent messages, settings · at night, tap <b>Sleep till morning</b> · 🏆 leaderboard", "<b>नकाशा</b> · ☰ मेनू: दृश्य, टॉर्च, अलीकडचे संदेश, सेटिंग्ज · रात्री <b>सकाळपर्यंत झोपा</b> दाबा · 🏆 मानाचा फलक", "<b>नक्शा</b> · ☰ मेनू: दृश्य, टॉर्च, हाल के संदेश, सेटिंग्स · रात में <b>सुबह तक सोएँ</b> दबाएँ · 🏆 लीडरबोर्ड")),
      ]
    : [
        row(pick("Move", "चालणे", "चलना"), pick("<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · mouse look", "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> चाला · <kbd>Shift</kbd> धावा · <kbd>Space</kbd> उडी · माउसने पहा", "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> चलें · <kbd>Shift</kbd> दौड़ें · <kbd>Space</kbd> कूदें · माउस से देखें")),
        row(pick("Pick a tool", "अवजार निवडा", "औज़ार चुनें"), pick("<kbd>1</kbd> hand (does what the soil needs) · <kbd>2</kbd> hoe · <kbd>3</kbd> watering can · <kbd>4</kbd><kbd>5</kbd><kbd>6</kbd> seeds (or mouse wheel)", "<kbd>1</kbd> हात (मातीला हवे ते करतो) · <kbd>2</kbd> कुदळ · <kbd>3</kbd> झारी · <kbd>4</kbd><kbd>5</kbd><kbd>6</kbd> बियाणे (किंवा माउसचे चाक)", "<kbd>1</kbd> हाथ (मिट्टी को जो चाहिए) · <kbd>2</kbd> कुदाल · <kbd>3</kbd> झारा · <kbd>4</kbd><kbd>5</kbd><kbd>6</kbd> बीज (या माउस का पहिया)")),
        row(pick("Use it", "वापरा", "इस्तेमाल"), pick("<b>Right-click</b> the soil: plough, sow, water · hold it and walk for a whole row · <b>Left-click</b> a ripe crop: harvest", "मातीवर <b>उजवे क्लिक</b>: नांगरा, पेरा, पाणी घाला · पूर्ण ओळीसाठी दाबून धरून चाला · तयार पिकावर <b>डावे क्लिक</b>: कापणी", "मिट्टी पर <b>राइट-क्लिक</b>: जोतें, बोएँ, पानी दें · पूरी क़तार के लिए दबाए रखकर चलें · पकी फ़सल पर <b>लेफ़्ट-क्लिक</b>: कटाई")),
        row(pick("Talk &amp; trade", "बोलणे व व्यापार", "बात और व्यापार"), pick("<kbd>E</kbd> near a stall or person", "दुकान किंवा माणसाजवळ <kbd>E</kbd>", "दुकान या व्यक्ति के पास <kbd>E</kbd>")),
        row(pick("Bulls &amp; cart", "बैल व गाडी", "बैल और गाड़ी"), pick("<kbd>P</kbd> bulls plough your field · <kbd>G</kbd> tie / untie at home · <kbd>F</kbd> feed · <kbd>R</kbd> at the cart: load and ride to the town mandi", "<kbd>P</kbd> बैल शेत नांगरतात · <kbd>G</kbd> घरी बांधा / सोडा · <kbd>F</kbd> चारा · गाडीजवळ <kbd>R</kbd>: माल भरा आणि मंडीला चला", "<kbd>P</kbd> बैल खेत जोतते हैं · <kbd>G</kbd> घर पर बाँधें / खोलें · <kbd>F</kbd> चारा · गाड़ी के पास <kbd>R</kbd>: माल भरें और मंडी चलें")),
        row(pick("Pastimes", "विरंगुळा", "मनोरंजन"), pick("📋 <b>Kaam</b>: a <b>!</b> over someone's head means a job for you (<kbd>E</kbd>) · 🤼 <b>Kabaddi</b> on the maidan behind the school (<kbd>E</kbd>; click to tag or tackle) · 🎣 <b>Fishing</b> in the talav beyond it (a gal from Sitabai; <kbd>E</kbd> cast, click to strike, hold the mouse or <kbd>Space</kbd> to reel)", "📋 <b>काम</b>: डोक्यावर <b>!</b> म्हणजे तुमच्यासाठी काम (<kbd>E</kbd>) · 🤼 शाळेमागच्या मैदानावर <b>कबड्डी</b> (<kbd>E</kbd>; शिवण्यासाठी क्लिक) · 🎣 तलावात <b>मासेमारी</b> (सीताबाईंकडून गळ; <kbd>E</kbd> गळ टाका, क्लिक करून झटका द्या, ओढण्यासाठी माउस किंवा <kbd>Space</kbd> दाबून धरा)", "📋 <b>काम</b>: सिर पर <b>!</b> यानी आपके लिए काम (<kbd>E</kbd>) · 🤼 स्कूल के पीछे मैदान में <b>कबड्डी</b> (<kbd>E</kbd>; छूने के लिए क्लिक) · 🎣 तालाब में <b>मछली</b> (सीताबाई से काँटा; <kbd>E</kbd> काँटा डालें, क्लिक करके झटका दें, खींचने के लिए माउस या <kbd>Space</kbd> दबाए रखें)")),
        row(pick("Other", "इतर", "और"), pick("<kbd>K</kbd> today's kaam · <kbd>L</kbd> leaderboard · <kbd>M</kbd> map · <kbd>V</kbd> first/third person · <kbd>T</kbd> torch at night · <kbd>Z</kbd> sleep till morning (at night) · <kbd>H</kbd> this help · <kbd>Esc</kbd> pause · 🔔 recent messages", "<kbd>K</kbd> आजचे काम · <kbd>L</kbd> मानाचा फलक · <kbd>M</kbd> नकाशा · <kbd>V</kbd> दृश्य बदला · <kbd>T</kbd> रात्री टॉर्च · <kbd>Z</kbd> सकाळपर्यंत झोपा · <kbd>H</kbd> ही मदत · <kbd>Esc</kbd> थांबवा · 🔔 अलीकडचे संदेश", "<kbd>K</kbd> आज का काम · <kbd>L</kbd> लीडरबोर्ड · <kbd>M</kbd> नक्शा · <kbd>V</kbd> दृश्य बदलें · <kbd>T</kbd> रात में टॉर्च · <kbd>Z</kbd> सुबह तक सोएँ · <kbd>H</kbd> यह मदद · <kbd>Esc</kbd> रोकें · 🔔 हाल के संदेश")),
      ];
}

export function helpCard(picture = "") {
  return `<div class="panel-card"><button class="x" data-close>✕</button><h2>${pick("How to play", "कसे खेळायचे", "कैसे खेलें")}</h2>
      <p class="lede">${pick("You farm a field in Ukhali Tanda. Grow crops, sell them, and use the money for bulls, a cart and more land.", "तुम्ही उखळी तांड्यात शेती करता. पिके घ्या, विका, आणि त्या पैशातून बैल, गाडी आणि आणखी जमीन घ्या.", "आप उखळी तांडा में खेती करते हैं. फ़सल उगाइए, बेचिए, और उस पैसे से बैल, गाड़ी और ज़मीन लीजिए.")}</p>
      ${picture || helpPicture()}
      <details class="help-more"><summary>${pick("All controls", "सर्व नियंत्रणे", "सारे कंट्रोल")}</summary><div class="help-grid">${helpRows().join("")}</div></details>
      <p class="hint">${pick("The golden marker and the goal card (top left) always show what to do next. Your farm is saved online automatically.", "सोनेरी खूण आणि वरच्या डावीकडचे कार्ड नेहमी पुढे काय करायचे ते दाखवतात. तुमचे शेत आपोआप ऑनलाइन जतन होते.", "सुनहरा निशान और ऊपर बाईं ओर का कार्ड हमेशा अगला काम बताते हैं. आपका खेत अपने आप ऑनलाइन सहेजा जाता है.")}</p>
      <div class="big-acts"><button data-close>${pick("Got it", "समजले", "समझ गया")}</button></div></div>`;
}

/** A drawn keyboard and mouse (or, on a phone, the screen's controls) with the keys that matter labelled. */
export function helpPicture() {
  const lab = (x: number, y: number, s: string, a: "start" | "middle" | "end" = "middle") => `<text x="${x}" y="${y}" text-anchor="${a}" class="hp-lab">${s}</text>`;
  if (TOUCH_UI) {
    return `<svg viewBox="0 0 520 230" class="help-pic" role="img" aria-label="${pick("The phone controls", "फोनवरची नियंत्रणे", "फ़ोन के कंट्रोल")}">
      <rect x="10" y="10" width="500" height="210" rx="22" class="hp-screen"/>
      <circle cx="80" cy="160" r="34" class="hp-pad"/><circle cx="80" cy="160" r="13" class="hp-key hi"/>
      ${lab(80, 112, pick("walk: thumb anywhere here", "चालणे: इथे कुठेही अंगठा", "चलें: यहाँ कहीं भी अँगूठा"))}
      <circle cx="445" cy="150" r="34" class="hp-pad"/>${lab(445, 154, pick("look", "पहा", "देखें"))}
      <circle cx="360" cy="180" r="24" class="hp-key hi"/>${lab(360, 184, pick("Use", "वापरा", "इस्तेमाल"))}
      ${lab(360, 146, pick("hold for a row", "ओळीसाठी धरा", "क़तार के लिए दबाएँ"))}
      <circle cx="360" cy="92" r="17" class="hp-key"/>${lab(360, 96, pick("Jump", "उडी", "कूदें"))}
      <rect x="170" y="150" width="150" height="30" rx="15" class="hp-key hi"/>${lab(245, 170, pick("Talk · Cart · Feed…", "बोला · गाडी · चारा…", "बात · गाड़ी · चारा…"))}
      ${lab(245, 200, pick("the button that appears", "दिसणारे बटण", "जो बटन दिखे"))}
      <rect x="400" y="24" width="44" height="22" rx="11" class="hp-key"/>${lab(422, 39, pick("Map", "नकाशा", "नक्शा"))}
      <circle cx="470" cy="35" r="11" class="hp-key"/>${lab(470, 39, "☰")}
      <rect x="24" y="24" width="150" height="46" rx="10" class="hp-card"/>${lab(99, 44, pick("your next step", "पुढची पायरी", "अगला कदम"))}${lab(99, 60, pick("(tap to open)", "(उघडण्यासाठी दाबा)", "(खोलने के लिए दबाएँ)"))}
    </svg>`;
  }
  const key = (x: number, y: number, w: number, s: string, hi = false) => `<rect x="${x}" y="${y}" width="${w}" height="30" rx="6" class="hp-key${hi ? " hi" : ""}"/><text x="${x + w / 2}" y="${y + 20}" text-anchor="middle" class="hp-k">${s}</text>`;
  // the keys that matter are gold; what they do is written underneath, the mouse's beside it
  return `<svg viewBox="0 0 560 290" class="help-pic" role="img" aria-label="${pick("The keyboard and mouse controls", "कीबोर्ड व माउस नियंत्रणे", "कीबोर्ड और माउस कंट्रोल")}">
    ${["1", "2", "3", "4", "5", "6"].map((k, i) => key(20 + i * 38, 14, 34, k, true)).join("")}
    ${key(38, 52, 34, "Q")}${key(76, 52, 34, "W", true)}${key(114, 52, 34, "E", true)}${key(152, 52, 34, "R", true)}${key(190, 52, 34, "T", true)}
    ${key(48, 90, 34, "A", true)}${key(86, 90, 34, "S", true)}${key(124, 90, 34, "D", true)}${key(162, 90, 34, "F", true)}${key(200, 90, 34, "G", true)}${key(276, 90, 34, "H", true)}
    ${key(10, 128, 60, "Shift", true)}${key(74, 128, 34, "Z", true)}${key(250, 128, 34, "M", true)}
    ${key(90, 166, 200, "Space", true)}
    ${lab(10, 226, pick("1 hand · 2 hoe · 3 can · 4–6 seeds", "1 हात · 2 कुदळ · 3 झारी · 4–6 बियाणे", "1 हाथ · 2 कुदाल · 3 झारा · 4–6 बीज"), "start")}
    ${lab(10, 246, pick("WASD walk · Shift run · Space jump · E talk", "WASD चाला · Shift धावा · Space उडी · E बोला", "WASD चलें · Shift दौड़ें · Space कूदें · E बात"), "start")}
    ${lab(10, 266, pick("F feed · G tie · R cart · T torch · K kaam · M map · H help · Z sleep", "F चारा · G बांधा · R गाडी · T टॉर्च · K काम · M नकाशा · H मदत · Z झोप", "F चारा · G बाँधें · R गाड़ी · T टॉर्च · K काम · M नक्शा · H मदद · Z नींद"), "start")}
    <g transform="translate(440 14)">
      <rect x="0" y="0" width="90" height="140" rx="45" class="hp-mouse"/>
      <path d="M45 0 L45 60 M0 60 L90 60" class="hp-line"/>
      <path d="M45 0 A45 45 0 0 0 0 45 L0 60 L45 60 Z" class="hp-key hi"/>
      <path d="M45 0 A45 45 0 0 1 90 45 L90 60 L45 60 Z" class="hp-key hi"/>
      <text x="22" y="40" text-anchor="middle" class="hp-k">L</text><text x="68" y="40" text-anchor="middle" class="hp-k">R</text>
      ${lab(45, 172, pick("L: harvest", "डावे: कापणी", "बायाँ: कटाई"))}
      ${lab(45, 192, pick("R: use", "उजवे: वापरा", "दायाँ: इस्तेमाल"))}
      ${lab(45, 212, pick("hold R: a whole row", "उजवे धरा: पूर्ण ओळ", "दायाँ दबाएँ: पूरी क़तार"))}
      ${lab(45, 232, pick("move: look", "हलवा: पहा", "हिलाएँ: देखें"))}
    </g>
  </svg>`;
}
