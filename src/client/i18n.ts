import type { CropId } from "../shared/crops";
import { GIVERS, type Job } from "../shared/jobs";

/*
 * Marathi and Hindi, a first pass: the title screen, the HUD, the hotbar, field tips, action hints,
 * the kaam list, the help card and settings. Story dialogue and the mission card stay in English
 * for now. Strings are keyed by their English text; `{x}` marks a value filled in by the caller, and a
 * key ending in "|touch" is the phone's version when the words differ (tap instead of click).
 */
export type Lang = "en" | "mr" | "hi";
export const LANGS: [Lang, string][] = [["en", "English"], ["mr", "मराठी"], ["hi", "हिन्दी"]];

const touchUi = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1);
export const LANG: Lang = (() => {
  try {
    const l = localStorage.getItem("tanda.lang");
    return l === "mr" || l === "hi" ? l : "en";
  } catch {
    return "en";
  }
})();
export function setLang(l: Lang) {
  try {
    localStorage.setItem("tanda.lang", l);
  } catch { /* ignore */ }
  location.reload(); // simplest way to redraw every word
}
if (typeof document !== "undefined") {
  document.documentElement.lang = LANG;
  if (LANG !== "en") {
    const f = document.createElement("link");
    f.rel = "stylesheet";
    f.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&display=swap";
    document.head.appendChild(f);
  }
}

// [Marathi, Hindi]
const D: Record<string, [string, string]> = {
  // ---- title screen
  "A farming game from the Deccan": ["दख्खनचा शेतीचा खेळ", "दक्कन का खेती वाला खेल"],
  "Start farming": ["शेती सुरू करा", "खेती शुरू करें"],
  "Continue your farm": ["तुमचे शेत पुढे चालू करा", "अपना खेत जारी रखें"],
  Leaderboard: ["मानाचा फलक", "लीडरबोर्ड"],
  "The village": ["गाव", "गाँव"],
  Settings: ["सेटिंग्ज", "सेटिंग्स"],
  "Continue a farm from another device": ["दुसऱ्या फोनवरचे शेत इथे चालू करा", "दूसरे फ़ोन का खेत यहाँ जारी रखें"],
  "Continue that farm": ["ते शेत चालू करा", "वह खेत जारी रखें"],
  "Created by": ["निर्माते", "निर्माता"],
  "Preparing the village…": ["गाव तयार होत आहे…", "गाँव तैयार हो रहा है…"],
  "{n} field": ["{n} शेत", "{n} खेत"],
  "{n} fields": ["{n} शेते", "{n} खेत"],
  tagline: [
    "<b>उखळी तांडा</b> मध्ये घरी परत या — जालन्यातील एक बंजारा तांडा. काळी माती नांगरा, जुन्या काफिल्याच्या वाटेने बैलगाडीतून पीक मंडीत न्या, आणि अल्पभूधारकापासून पोळ्याचे मानकरी व्हा.",
    "<b>उखळी तांडा</b> लौट आइए — जालना का एक बंजारा तांडा। काली मिट्टी जोतिए, पुराने कारवाँ के रास्ते बैलगाड़ी से फ़सल मंडी ले जाइए, और छोटे किसान से पोळा के विजेता बनिए।",
  ],
  "title-keys": ["WASD चाला · माउसने पहा · डावे क्लिक कापणी · उजवे क्लिक वापरा · E बोला · M नकाशा · T टॉर्च · Z झोप · H मदत", "WASD चलें · माउस से देखें · लेफ़्ट क्लिक कटाई · राइट क्लिक इस्तेमाल · E बात · M नक्शा · T टॉर्च · Z नींद · H मदद"],
  Language: ["भाषा", "भाषा"],

  // ---- HUD
  "Small farmer": ["अल्पभूधारक", "छोटा किसान"],
  Kisan: ["किसान", "किसान"],
  "Bada Kisan": ["बडा किसान", "बड़ा किसान"],
  Zamindar: ["जमीनदार", "ज़मींदार"],
  Sarpanch: ["सरपंच", "सरपंच"],
  Kharif: ["खरीप", "खरीफ़"],
  Rabi: ["रब्बी", "रबी"],
  Unhala: ["उन्हाळा", "गर्मी"],
  "saving…": ["जतन होत आहे…", "सहेजा जा रहा है…"],
  "offline — retrying": ["ऑफलाइन — पुन्हा प्रयत्न", "ऑफ़लाइन — फिर कोशिश"],
  "loan overdue!": ["कर्ज थकले!", "कर्ज़ बकाया!"],
  fish: ["मासे", "मछली"],
  "Click to play": ["खेळण्यासाठी क्लिक करा", "खेलने के लिए क्लिक करें"],
  "Paused · <b>H</b> shows all the controls": ["थांबवले · <b>H</b> सर्व नियंत्रणे दाखवते", "रुका हुआ · <b>H</b> सारे कंट्रोल दिखाता है"],
  "Recent messages": ["अलीकडचे संदेश", "हाल के संदेश"],

  // ---- hotbar
  "Hand · does what the soil needs": ["हात · मातीला हवे ते करतो", "हाथ · मिट्टी को जो चाहिए वह करता है"],
  Hoe: ["कुदळ", "कुदाल"],
  "Watering can": ["झारी", "झारा"],
  "{crop} seeds": ["{crop} बियाणे", "{crop} के बीज"],

  // ---- the smart hand and field tips
  "Right-click: {a}": ["उजवे क्लिक: {a}", "राइट-क्लिक: {a}"],
  "Right-click: {a}|touch": ["वापरा: {a}", "इस्तेमाल: {a}"],
  Plough: ["नांगरा", "जोतें"],
  "Sow {crop}": ["{crop} पेरा", "{crop} बोएँ"],
  Water: ["पाणी घाला", "पानी दें"],
  Harvest: ["कापणी", "कटाई"],
  "Fill can": ["झारी भरा", "झारा भरें"],
  Use: ["वापरा", "इस्तेमाल"],
  Tag: ["शिवा", "छुएँ"],
  "fill the can": ["झारी भरा", "झारा भरें"],
  "plough this soil": ["ही माती नांगरा", "यह मिट्टी जोतें"],
  " · soil {n}%": [" · माती {n}%", " · मिट्टी {n}%"],
  "Water here — press 3 for the can": ["इथे पाणी आहे — झारीसाठी 3 दाबा", "यहाँ पानी है — झारे के लिए 3 दबाएँ"],
  "Water here — press 3 for the can|touch": ["इथे पाणी आहे — खाली झारी निवडा", "यहाँ पानी है — नीचे झारा चुनें"],
  "✋ {plot} is a neighbour's field": ["✋ {plot} शेजाऱ्याचे शेत आहे", "✋ {plot} पड़ोसी का खेत है"],
  "Press 2 for the hoe to plough here": ["इथे नांगरण्यासाठी 2 (कुदळ) दाबा", "यहाँ जोतने के लिए 2 (कुदाल) दबाएँ"],
  "Press 2 for the hoe to plough here|touch": ["इथे नांगरण्यासाठी खाली कुदळ निवडा", "यहाँ जोतने के लिए नीचे कुदाल चुनें"],
  "Ploughed soil · no seeds left — Sitabai sells more": ["नांगरलेली माती · बियाणे संपले — सीताबाई विकतात", "जुती मिट्टी · बीज ख़त्म — सीताबाई बेचती हैं"],
  "{crop} is ripe · left-click to harvest": ["{crop} तयार आहे · कापणीसाठी डावे क्लिक", "{crop} पक गया · काटने के लिए लेफ़्ट-क्लिक"],
  "{crop} is ripe · left-click to harvest|touch": ["{crop} तयार आहे · वापरा दाबा", "{crop} पक गया · इस्तेमाल दबाएँ"],
  "{crop} · {p}% · right-click to water": ["{crop} · {p}% · पाणी घालण्यासाठी उजवे क्लिक", "{crop} · {p}% · पानी देने के लिए राइट-क्लिक"],
  "{crop} · {p}% · right-click to water|touch": ["{crop} · {p}% · पाणी घालण्यासाठी वापरा दाबा", "{crop} · {p}% · पानी देने के लिए इस्तेमाल दबाएँ"],
  "{crop} · {p}% · the can is empty — fill it at a well": ["{crop} · {p}% · झारी रिकामी आहे — विहिरीवर भरा", "{crop} · {p}% · झारा खाली है — कुएँ पर भरें"],
  "{crop} · {p}% grown · {state} · ripe in ~{m} min": ["{crop} · {p}% वाढले · {state} · सुमारे {m} मिनिटांत तयार", "{crop} · {p}% बढ़ा · {state} · लगभग {m} मिनट में तैयार"],
  "dry — water it (press 3)": ["कोरडे — पाणी घाला", "सूखा — पानी दें"],
  watered: ["पाणी दिलेले", "पानी दिया हुआ"],
  "{crop} · {p}% · ripe in ~{m} min": ["{crop} · {p}% · सुमारे {m} मिनिटांत तयार", "{crop} · {p}% · लगभग {m} मिनट में तैयार"],

  // ---- crops
  Jowar: ["ज्वारी", "ज्वार"],
  Onion: ["कांदा", "प्याज़"],
  Sugarcane: ["ऊस", "गन्ना"],

  // ---- stalls and places
  "Sell to Ganpat Seth, the trader": ["गणपत शेठला विका (व्यापारी)", "गणपत सेठ को बेचें (व्यापारी)"],
  "Buy seeds & tools from Sitabai": ["सीताबाईंकडून बियाणे व अवजारे घ्या", "सीताबाई से बीज और औज़ार लें"],
  "Buy & sell land with Naik Dhavlu, the tanda's headman": ["नायक धवलूंकडे जमीन घ्या-विका", "नायक धवलू से ज़मीन ख़रीदें-बेचें"],
  "Hear Kamlabai Jadhav, candidate for sarpanch": ["सरपंचपदाच्या उमेदवार कमलाबाई जाधव यांचे ऐका", "सरपंच उम्मीदवार कमलाबाई जाधव को सुनें"],
  "Hear Shankar Pawar, candidate for sarpanch": ["सरपंचपदाचे उमेदवार शंकर पवार यांचे ऐका", "सरपंच उम्मीदवार शंकर पवार को सुनें"],
  "Visit the Sevalal Maharaj mandir": ["संत सेवालाल महाराज मंदिरात जा", "संत सेवालाल महाराज मंदिर जाएँ"],
  "Loans & the godown at the Sahakari Bank": ["सहकारी बँकेत कर्ज व गोदाम", "सहकारी बैंक में कर्ज़ और गोदाम"],
  "Borrow from Sahukar Motilal (fast, but dear)": ["सावकार मोतीलालकडून उधार (लगेच, पण महाग)", "साहूकार मोतीलाल से उधार (तुरंत, पर महँगा)"],
  "Talk to Haribhau at the town mandi": ["मंडीत हरिभाऊंशी बोला", "मंडी में हरिभाऊ से बात करें"],
  "open till {h}": ["{h} पर्यंत उघडे", "{h} तक खुला"],
  "{name} is closed · opens at {open} (open {hours})": ["{name} बंद आहे · {open} ला उघडेल ({hours})", "{name} बंद है · {open} बजे खुलेगा ({hours})"],
  "Ganpat Seth's stall": ["गणपत शेठचे दुकान", "गणपत सेठ की दुकान"],
  "Sitabai's shop": ["सीताबाईंचे दुकान", "सीताबाई की दुकान"],
  "Naik Dhavlu's kacheri": ["नायक धवलूंची कचेरी", "नायक धवलू की कचहरी"],
  "The Sahakari Bank": ["सहकारी बँक", "सहकारी बैंक"],
  "Sahukar Motilal": ["सावकार मोतीलाल", "साहूकार मोतीलाल"],
  "The Jalna mandi": ["जालना मंडी", "जालना मंडी"],

  // ---- action hints
  "Sell the load at the mandi": ["मंडीत माल विका", "मंडी में माल बेचें"],
  "Continue to the town mandi": ["मंडीकडे पुढे चला", "मंडी की ओर आगे बढ़ें"],
  "Ride home": ["घरी परत चला", "घर लौटें"],
  "Load the cart for the town mandi": ["मंडीसाठी बैलगाडी भरा", "मंडी के लिए बैलगाड़ी भरें"],
  "Lead Sarja & Raja in the Pola procession": ["पोळ्याच्या मिरवणुकीत सर्जा-राजाला न्या", "पोळा जुलूस में सर्जा-राजा को ले चलें"],
  "Go home and sleep till morning": ["घरी जा आणि सकाळपर्यंत झोपा", "घर जाकर सुबह तक सोएँ"],
  "Sit with your friends by the fire": ["शेकोटीजवळ मित्रांसोबत बसा", "अलाव के पास दोस्तों के साथ बैठें"],
  "Join the gram sabha": ["ग्रामसभेत सामील व्हा", "ग्राम सभा में शामिल हों"],
  "Decide whom you back…": ["कोणाला साथ द्यायची ते ठरवा…", "तय करें किसका साथ दें…"],
  "Vote at the polling booth": ["मतदान केंद्रावर मत द्या", "मतदान केंद्र पर वोट दें"],
  "Tie Sarja & Raja in their gotha": ["सर्जा-राजाला गोठ्यात बांधा", "सर्जा-राजा को गोशाला में बाँधें"],
  "Tie Sarja & Raja at the khunta": ["सर्जा-राजाला खुंट्याला बांधा", "सर्जा-राजा को खूँटे से बाँधें"],
  "Untie Sarja & Raja": ["सर्जा-राजाला सोडा", "सर्जा-राजा को खोलें"],
  "Let Sarja & Raja plough this field": ["सर्जा-राजाला हे शेत नांगरू द्या", "सर्जा-राजा को यह खेत जोतने दें"],
  "Paint Sarja & Raja's horns with gerua": ["सर्जा-राजाची शिंगे गेरूने रंगवा", "सर्जा-राजा के सींग गेरू से रँगें"],
  "Feed Sarja & Raja ({n} kadba)": ["सर्जा-राजाला चारा द्या ({n} कडबा)", "सर्जा-राजा को चारा दें ({n} कड़बा)"],
  "Sleep till morning (you walk home)": ["सकाळपर्यंत झोपा (तुम्ही घरी चालत जाता)", "सुबह तक सोएँ (आप घर चले जाते हैं)"],
  "Switch on your torch": ["टॉर्च लावा", "टॉर्च जलाएँ"],
  "Talk to Dagdu mama, the old fisherman": ["म्हातारे मच्छीमार दगडू मामांशी बोला", "बूढ़े मछुआरे दगडू मामा से बात करें"],
  "🎣 Fish here with a gal (rod) — Sitabai sells one": ["🎣 इथे गळाने मासे पकडा — सीताबाई गळ विकतात", "🎣 यहाँ काँटे से मछली पकड़ें — सीताबाई काँटा बेचती हैं"],
  "Cast your line into the talav": ["तलावात गळ टाका", "तालाब में काँटा डालें"],
  " · {n} casts left today": [" · आज {n} वेळा बाकी", " · आज {n} बार बाकी"],
  "🎣 The fish have stopped biting today — come back tomorrow": ["🎣 आज मासे गळाला लागत नाहीत — उद्या या", "🎣 आज मछलियाँ नहीं फँस रहीं — कल आइए"],
  "Play kabaddi with the boys": ["मुलांसोबत कबड्डी खेळा", "लड़कों के साथ कबड्डी खेलें"],
  " · {r} raids each · ₹101 for the day's first win": [" · प्रत्येकी {r} चढाया · दिवसाच्या पहिल्या विजयाला ₹101", " · हर टीम {r} रेड · दिन की पहली जीत पर ₹101"],
  "The boys play kabaddi here by day, 8 am to 7 pm": ["मुले इथे दिवसा, सकाळी ८ ते संध्याकाळी ७, कबड्डी खेळतात", "लड़के यहाँ दिन में, सुबह 8 से शाम 7 तक, कबड्डी खेलते हैं"],
  "Call Chinki — she'll follow you": ["चिंकीला हाक मारा — ती तुमच्या मागे येईल", "चिंकी को बुलाएँ — वह आपके पीछे आएगी"],
  "Talk to {who}": ["{who} यांच्याशी बोला", "{who} से बात करें"],
  "Give {who} his tiffin ✓": ["{who} यांना डबा द्या ✓", "{who} को टिफ़िन दें ✓"],
  "Bring Chinki home to {who} ✓": ["चिंकीला {who} यांच्याकडे घरी न्या ✓", "चिंकी को {who} के पास घर ले जाएँ ✓"],
  "Give {who} {what} ✓": ["{who} यांना {what} द्या ✓", "{who} को {what} दें ✓"],
  "{who} needs a hand": ["{who} यांना मदत हवी आहे", "{who} को मदद चाहिए"],

  // ---- the kaam list
  "📋 Kaam today": ["📋 आजचे काम", "📋 आज का काम"],
  "{a} of {b} open": ["{b} पैकी {a} बाकी", "{b} में से {a} बाकी"],
  "all done!": ["सगळे झाले!", "सब हो गया!"],
  "Look for the <b>!</b> over their heads · new jobs every day": ["त्यांच्या डोक्यावरचे <b>!</b> पहा · रोज नवे काम", "उनके सिर के ऊपर <b>!</b> देखें · रोज़ नया काम"],
  "Everyone's gone in for the night — new jobs in the morning": ["सगळे रात्रीसाठी घरी गेले — सकाळी नवे काम", "सब रात के लिए घर चले गए — सुबह नया काम"],
  "{n} {crop}": ["{n} {crop}", "{n} {crop}"],
  "a fish from the talav": ["तलावातील एक मासा", "तालाब की एक मछली"],
  "{n} fish from the talav": ["तलावातील {n} मासे", "तालाब की {n} मछलियाँ"],
  "a can of water ({n} pours)": ["एक झारी पाणी ({n} वेळा)", "एक झारा पानी ({n} बार)"],
  "take a tiffin to {to}": ["{to} यांना डबा पोचवा", "{to} को टिफ़िन पहुँचाएँ"],
  "find Chinki the goat": ["चिंकी बकरीला शोधा", "चिंकी बकरी को ढूँढें"],

  // ---- settings
  "Mouse sensitivity": ["माउसची संवेदनशीलता", "माउस की संवेदनशीलता"],
  "How far you can see": ["किती लांब दिसते", "कितनी दूर दिखे"],
  Near: ["जवळ", "पास"],
  Normal: ["सामान्य", "सामान्य"],
  Far: ["लांब", "दूर"],
  Sound: ["आवाज", "आवाज़"],
  off: ["बंद", "बंद"],
  "Text and buttons": ["अक्षरे आणि बटणे", "अक्षर और बटन"],
  Large: ["मोठे", "बड़ा"],
  Largest: ["सर्वात मोठे", "सबसे बड़ा"],
  Graphics: ["ग्राफिक्स", "ग्राफ़िक्स"],
  "Settings are kept on this device. Your farm itself is saved online.": ["सेटिंग्ज या फोनवर राहतात. तुमचे शेत ऑनलाइन जतन होते.", "सेटिंग्स इसी फ़ोन पर रहती हैं. आपका खेत ऑनलाइन सहेजा जाता है."],
  Done: ["झाले", "हो गया"],
  "running at {tier}": ["सध्या {tier}", "अभी {tier}"],
  ", no shadows": [", सावल्या नाहीत", ", छाया नहीं"],
  low: ["कमी", "कम"],
  medium: ["मध्यम", "मध्यम"],
  high: ["उच्च", "ऊँचा"],
  "Auto (best for this device: {t})": ["आपोआप (या फोनसाठी योग्य: {t})", "अपने आप (इस फ़ोन के लिए सही: {t})"],
  "Low: smoothest, for older phones and laptops": ["कमी: सर्वात सुरळीत, जुन्या फोन व लॅपटॉपसाठी", "कम: सबसे सहज, पुराने फ़ोन और लैपटॉप के लिए"],
  Medium: ["मध्यम", "मध्यम"],
  "High: shadows, bloom and dense grass": ["उच्च: सावल्या, चमक आणि दाट गवत", "ऊँचा: छाया, चमक और घनी घास"],
  "If the game stutters, choose Low. On Auto, it also lowers itself if your device can't keep up.": ["खेळ अडखळत असेल तर 'कमी' निवडा. 'आपोआप' वर असताना फोन मागे पडला तर तो स्वतः कमी होतो.", "खेल अटके तो 'कम' चुनें. 'अपने आप' पर फ़ोन पीछे रहे तो यह ख़ुद कम हो जाता है."],
  "Takes effect when the game reloads.": ["खेळ पुन्हा सुरू झाल्यावर लागू होईल.", "खेल दोबारा खुलने पर लागू होगा."],
  "Reload now": ["आता पुन्हा सुरू करा", "अभी दोबारा खोलें"],

  // ---- phone buttons
  Jump: ["उडी", "कूदें"],
  Map: ["नकाशा", "नक्शा"],
  look: ["पहा", "देखें"],
};

/** The words in the chosen language (English when there's no translation yet). */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = en;
  if (LANG !== "en") {
    const k = touchUi && D[`${en}|touch`] ? `${en}|touch` : en;
    const hit = D[k];
    if (hit) s = hit[LANG === "mr" ? 0 : 1];
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
export const isEnglish = LANG === "en";

/** A crop's name in the chosen language. */
export const cropName = (c: CropId | string) => t(c.charAt(0).toUpperCase() + c.slice(1));
/** A neighbour's name: in Devanagari for Marathi and Hindi. */
export const giverName = (id: keyof typeof GIVERS) => (LANG === "en" ? GIVERS[id].name : GIVERS[id].local);

/** "Kashibai: 10 onion" for the kaam list and hints, in the chosen language. */
export function jobWhat(j: Job): string {
  switch (j.kind) {
    case "produce": return t("{n} {crop}", { n: j.n, crop: LANG === "en" ? j.item : cropName(j.item) });
    case "fish": return j.n === 1 ? t("a fish from the talav") : t("{n} fish from the talav", { n: j.n });
    case "water": return t("a can of water ({n} pours)", { n: j.n });
    case "parcel": return t("take a tiffin to {to}", { to: giverName(j.to) });
    case "goat": return t("find Chinki the goat");
  }
}
export const jobLineT = (j: Job) => `${giverName(j.who)}: ${jobWhat(j)}`;
