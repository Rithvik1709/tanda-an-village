import { track } from "@vercel/analytics";

/*
 * A handful of custom events, to see whether people get going and come back: started, first harvest,
 * first sale, each mission done, and returned on a later day. The "first" ones are sent once per device.
 * In dev they are logged to the console and kept on window.__metrics for scripts.
 */
type Props = Record<string, string | number | boolean>;
const sent: { name: string; props: Props }[] = [];
(window as unknown as { __metrics: typeof sent }).__metrics = sent;

const has = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return "1"; // no storage: don't keep counting "firsts"
  }
};
const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch { /* private mode */ }
};

export function metric(name: string, props: Props = {}) {
  sent.push({ name, props });
  if (import.meta.env.DEV) console.info("[metric]", name, props);
  try {
    track(name, props);
  } catch { /* analytics blocked */ }
}

/** Send `name` only the first time on this device. */
export function firstTime(name: string, props: Props = {}) {
  if (has(`tanda.metric.${name}`)) return;
  put(`tanda.metric.${name}`, "1");
  metric(name, props);
}

/** On entering the village: "started" the first time, "returned" once on each later calendar day. */
export function arrived(props: Props = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const first = has("tanda.metric.firstDay");
  if (!first) {
    put("tanda.metric.firstDay", today);
    put("tanda.metric.lastDay", today);
    return metric("started", props);
  }
  if (has("tanda.metric.lastDay") === today) return;
  put("tanda.metric.lastDay", today);
  metric("returned", { ...props, days: Math.round((Date.parse(today) - Date.parse(first)) / 864e5) });
}
