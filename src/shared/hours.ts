/*
 * Opening hours. The village keeps farmers' hours: the stalls open early and shut after dark, the
 * bank keeps office hours, and the moneylender is always around a little longer than anyone else.
 * The mandir and the candidates' doors are always open.
 */
export type Hours = { open: number; close: number; name: string };
export const SHOP_HOURS: Record<string, Hours> = {
  trader: { open: 7, close: 20, name: "Ganpat Seth's stall" },
  shop: { open: 8, close: 20, name: "Sitabai's shop" },
  land: { open: 9, close: 19, name: "Naik Dhavlu's kacheri" },
  panchayat: { open: 9, close: 18, name: "The Sarpanch's desk at Rathod Bhuvan" },
  bank: { open: 9, close: 18, name: "The Sahakari Bank" },
  sahukar: { open: 7, close: 21, name: "Sahukar Motilal" },
  town: { open: 5, close: 21, name: "The Jalna mandi" },
};

export const isOpen = (kind: string, hour: number) => {
  const h = SHOP_HOURS[kind];
  return !h || (hour >= h.open && hour < h.close);
};
const ampm = (h: number) => (h === 12 ? "12 noon" : h < 12 ? `${h} am` : `${h - 12} pm`);
export const hoursText = (kind: string) => {
  const h = SHOP_HOURS[kind];
  return h ? `${ampm(h.open)} – ${ampm(h.close)}` : "";
};
/** "Closed · opens at 7 am" */
export const closedText = (kind: string) => {
  const h = SHOP_HOURS[kind];
  return h ? `${h.name} is closed · opens at ${ampm(h.open)} (open ${hoursText(kind)})` : "";
};
