import { store } from "./_lib/store";

export async function GET(): Promise<Response> {
  const s = store();
  await s.set("health:ping", { at: Date.now() });
  const ok = (await s.get<{ at: number }>("health:ping")) != null;
  return Response.json({ ok, store: s.constructor.name, time: Date.now() });
}
