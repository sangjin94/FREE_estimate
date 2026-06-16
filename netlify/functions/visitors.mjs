// 실시간 방문자 카운터 — Netlify Functions v2 + Netlify Blobs (비공개 버전)
// POST /api/visitors          → 방문자 핑 (기록만, 통계 노출 안 함)
// GET  /api/visitors?key=KEY  → 통계 조회 (비밀키 DASH_KEY 일치할 때만)
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const ONLINE_WINDOW = 60_000;
const SALT = process.env.VISITOR_SALT || "gjkong";
const DASH_KEY = process.env.DASH_KEY || "";   // 넷리파이 환경변수에 설정

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });

export default async (req) => {
  const store = getStore("visitors");
  const url = new URL(req.url);
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0";
  const hash = createHash("sha256").update(ip + SALT).digest("hex").slice(0, 16);
  const now = Date.now();

  let data =
    (await store.get("stats", { type: "json" })) ||
    { views: 0, uniques: {}, presence: {} };

  // 방문자 핑: 기록만 하고 ok만 반환 (통계 노출 X)
  if (req.method === "POST") {
    data.views += 1;
    if (!data.uniques[hash]) data.uniques[hash] = now;
    data.presence[hash] = now;
    for (const k in data.presence)
      if (now - data.presence[k] > ONLINE_WINDOW) delete data.presence[k];
    await store.setJSON("stats", data);
    return json({ ok: true });
  }

  // 통계 조회: 비밀키 필요 (없거나 틀리면 403)
  const key = url.searchParams.get("key") || req.headers.get("x-dash-key") || "";
  if (!DASH_KEY || key !== DASH_KEY) return json({ error: "unauthorized" }, 403);

  const online = Object.values(data.presence).filter((ts) => now - ts <= ONLINE_WINDOW).length;
  const unique = Object.keys(data.uniques).length;
  return json({ online, unique, views: data.views, ts: now });
};

export const config = { path: "/api/visitors" };
