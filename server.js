"use strict";
const MAINTENANCE_MODE = String(process.env.MAINTENANCE_MODE || "0") !== "0";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 10000);
const ROOT = __dirname;
const DISCORD_WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || "").trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "mameenokair@gmail.com")
  .split(/[,\s]+/)
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const MAX_BODY_BYTES = 16 * 1024;

const PUBLIC_FILES = new Set([
  "index.html",
  "48291.html",
  "73518.html",
  "26974.html",
  "53827.html",
  "91463.html",
  "68145.html",
  "styles.css",
  "script.js",
  "admin.js",
  "admin-extra.js",
  "upload.js",
  "security.js",
  "presence.js",
  "community-actions.js",
  "download-tracker.js",
]);

const FILE_ALIASES = new Map([
  ["home.html", "index.html"],
  ["list.html", "48291.html"],
  ["comm.html", "73518.html"],
  ["community.html", "73518.html"],
  ["about.html", "26974.html"],
  ["upload.html", "91463.html"],
  ["admin.html", "53827.html"],
  ["share.html", "68145.html"],
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const PROBE_RULES = [
  ["WordPress scan", "medium", /(?:^|\/)wp-(?:admin|login|content|includes)|xmlrpc\.php/i],
  ["phpMyAdmin scan", "medium", /phpmyadmin|(?:^|\/)pma(?:\/|$)|mysqladmin/i],
  ["Secret/config scan", "high", /(?:^|\/)\.env(?:\.|$)|config\.php|database\.yml|credentials\.json|\.git(?:\/|$)/i],
  ["Path traversal", "high", /\.\.[/\\]|%2e%2e(?:%2f|\/)|etc[/\\]passwd|windows[/\\]win\.ini/i],
  ["SQL injection", "high", /union(?:\s|\+|%20)+select|or(?:\s|\+|%20)+1\s*=\s*1|sleep\s*\(|benchmark\s*\(|information_schema/i],
  ["XSS probe", "high", /<script|%3cscript|javascript:|onerror\s*=|onload\s*=/i],
  ["Command injection", "critical", /(?:^|[?&])(cmd|exec|command)=|\/bin\/(?:ba)?sh|powershell|base64_decode|eval\s*\(/i],
  ["Web shell scan", "critical", /shell\.php|wso\.php|c99\.php|r57\.php|webshell|backdoor/i],
];

const requestWindows = new Map();
const apiWindows = new Map();
const recentAlerts = new Map();
const networkCache = new Map();
const presenceUsers = new Map();
const PRESENCE_TTL_MS = 45_000;

function text(value, max = 500) {
  const result = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return result.length <= max ? result : `${result.slice(0, Math.max(0, max - 3))}...`;
}

function safeDecode(value) {
  let result = String(value || "");
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(result.replace(/\+/g, " "));
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result;
}

function normalizeIp(value) {
  let ip = text(value, 80).split(",")[0].trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, "");
  return ip || "unknown";
}

function clientIp(req) {
  return normalizeIp(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown");
}

function isPublicIp(ip) {
  if (!ip || ip === "unknown" || ip === "::1" || ip === "127.0.0.1") return false;
  if (/^(10\.|192\.168\.|169\.254\.|0\.|127\.)/.test(ip)) return false;
  const match = ip.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
  if (/^(fc|fd|fe80):/i.test(ip)) return false;
  return true;
}

function checkWindow(store, key, limit, durationMs) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.startedAt >= durationMs) {
    store.set(key, { startedAt: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function cleanDetails(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => cleanDetails(item, depth + 1));
  if (!value || typeof value !== "object") return text(value, 500);

  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 40)) {
    const key = text(rawKey, 80);
    if (/password|passwd|token|authorization|cookie|secret|webhook|api[_-]?key/i.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = cleanDetails(rawValue, depth + 1);
    }
  }
  return output;
}

function classifyRequest(method, rawUrl) {
  if (!["GET", "HEAD"].includes(method)) {
    return { reason: `Unexpected HTTP method: ${method}`, severity: "high" };
  }

  const decoded = safeDecode(rawUrl);
  const hit = PROBE_RULES.find(([, , pattern]) => pattern.test(decoded));
  return hit ? { reason: hit[0], severity: hit[1] } : null;
}

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://khvbvnpiifhbekqdtldm.supabase.co wss://khvbvnpiifhbekqdtldm.supabase.co https://ipwho.is https://ipapi.co https://ipinfo.io https://api.ipify.org https://api64.ipify.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
}

function json(res, status, payload) {
  securityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function fetchJson(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("json") ? response.json() : null;
  } finally {
    clearTimeout(timer);
  }
}

async function networkInfo(ip) {
  if (!isPublicIp(ip)) return {};
  const cached = networkCache.get(ip);
  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) return cached.value;

  try {
    const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/json", "User-Agent": "AudioVault-Security/1.0" },
    }, 2800);
    const value = data?.success === false ? {} : {
      city: text(data?.city, 120),
      region: text(data?.region, 120),
      country: text(data?.country, 120),
      isp: text(data?.connection?.isp || data?.connection?.org, 180).replace(/^AS\d+\s+/i, ""),
    };
    networkCache.set(ip, { savedAt: Date.now(), value });
    if (networkCache.size > 500) networkCache.delete(networkCache.keys().next().value);
    return value;
  } catch {
    return {};
  }
}

function discordConfigured() {
  return /^https:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api\/webhooks\//i.test(DISCORD_WEBHOOK_URL);
}

function eventTitle(event) {
  if (event.event_type === "signup_success") return "สมาชิกใหม่";
  if (event.event_type === "login_failed") return "ล็อกอินไม่สำเร็จ";
  if (event.event_type === "signup_failed") return "สมัครสมาชิกไม่สำเร็จ";
  if (event.event_type === "server_request_probe") return "ตรวจพบการสแกน/โจมตีเว็บ";
  return "แจ้งเตือนความปลอดภัย";
}

function discordFields(event) {
  const location = [event.city, event.region, event.country].filter(Boolean).join(", ") || "ไม่พบ";
  const details = JSON.stringify(event.details || {}, null, 2).replace(/```/g, "'''");
  return [
    { name: "เหตุการณ์", value: text(event.event_type, 100) || "security_event", inline: true },
    { name: "ระดับ", value: text(event.severity, 20), inline: true },
    { name: "IP Address", value: text(event.ip_address, 100) || "ไม่พบ", inline: false },
    { name: "ตำแหน่งโดยประมาณ", value: text(location, 300), inline: false },
    { name: "ค่ายเน็ต / ISP", value: text(event.isp, 300) || "ไม่พบ", inline: false },
    { name: "อีเมล", value: text(event.email, 254) || "ไม่มี", inline: false },
    { name: "หน้า/URL", value: text(event.page, 900) || "/", inline: false },
    { name: "รายละเอียด", value: `\`\`\`json\n${text(details, 900)}\n\`\`\``, inline: false },
    { name: "User-Agent", value: text(event.user_agent, 900) || "ไม่พบ", inline: false },
  ];
}

async function sendDiscord(event) {
  if (!discordConfigured()) return { skipped: true, reason: "Discord webhook is not configured" };
  const colors = { low: 0x3498db, medium: 0xf1c40f, high: 0xe67e22, critical: 0xe74c3c };
  const payload = {
    username: "Audio Vault Security",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: eventTitle(event),
      color: colors[event.severity] || colors.medium,
      fields: discordFields(event),
      timestamp: event.created_at,
      footer: { text: "The Audio Vault • Server Security" },
    }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
    return { sent: true };
  } finally {
    clearTimeout(timer);
  }
}

async function persistEvent(event) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true, reason: "Supabase server credentials are not configured" };
  }

  const row = {
    event_type: event.event_type,
    severity: event.severity,
    user_id: event.user_id || null,
    email: event.email || null,
    ip_address: event.ip_address === "unknown" ? null : event.ip_address,
    city: event.city || null,
    region: event.region || null,
    country: event.country || null,
    isp: event.isp || null,
    page: event.page || null,
    referrer: event.referrer || null,
    user_agent: event.user_agent || null,
    details: event.details || {},
  };

  await fetchJson(`${SUPABASE_URL}/rest/v1/security_events`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  }, 5000);
  return { saved: true };
}

async function deliverEvent(rawEvent) {
  const ip = normalizeIp(rawEvent.ip_address);
  const network = await networkInfo(ip);
  const event = {
    event_type: text(rawEvent.event_type, 80).toLowerCase().replace(/[^a-z0-9_.-]/g, "_") || "security_event",
    severity: ["low", "medium", "high", "critical"].includes(rawEvent.severity) ? rawEvent.severity : "medium",
    user_id: /^[0-9a-f-]{36}$/i.test(String(rawEvent.user_id || "")) ? rawEvent.user_id : null,
    email: text(rawEvent.email, 254),
    ip_address: ip,
    city: network.city || text(rawEvent.city, 120),
    region: network.region || text(rawEvent.region, 120),
    country: network.country || text(rawEvent.country, 120),
    isp: network.isp || text(rawEvent.isp, 180).replace(/^AS\d+\s+/i, ""),
    page: text(rawEvent.page, 700),
    referrer: text(rawEvent.referrer, 700),
    user_agent: text(rawEvent.user_agent, 700),
    details: cleanDetails(rawEvent.details || {}),
    created_at: new Date().toISOString(),
  };

  const dedupeKey = `${event.event_type}:${event.ip_address}:${event.page}:${JSON.stringify(event.details).slice(0, 180)}`;
  const previous = recentAlerts.get(dedupeKey) || 0;
  if (Date.now() - previous < 30_000) return { deduplicated: true };
  recentAlerts.set(dedupeKey, Date.now());
  if (recentAlerts.size > 1000) recentAlerts.delete(recentAlerts.keys().next().value);

  const [discord, database] = await Promise.allSettled([sendDiscord(event), persistEvent(event)]);
  if (discord.status === "rejected") console.error("Discord alert failed:", discord.reason?.message || discord.reason);
  if (database.status === "rejected") console.error("Security event persistence failed:", database.reason?.message || database.reason);
  return {
    discord: discord.status === "fulfilled" ? discord.value : { error: true },
    database: database.status === "fulfilled" ? database.value : { error: true },
  };
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host || "");
  } catch {
    return false;
  }
}

async function handleSecurityApi(req, res, ip) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return json(res, 403, { error: "Origin is not allowed" });
  if (!checkWindow(apiWindows, ip, 12, 5 * 60 * 1000)) {
    return json(res, 429, { error: "Too many security reports" });
  }

  try {
    const input = await readJson(req);
    const result = await deliverEvent({
      ...input,
      ip_address: ip,
      user_agent: req.headers["user-agent"] || input.user_agent,
      referrer: req.headers.referer || input.referrer,
      details: { source: "browser_client", ...cleanDetails(input.details || {}) },
    });
    return json(res, 202, { accepted: true, ...result });
  } catch (error) {
    return json(res, error.status || 400, { error: text(error.message, 200) });
  }
}



async function verifyUserRequest(req) {
  if (!sameOrigin(req)) return { status: 403, error: "Origin is not allowed" };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { status: 503, error: "Supabase server credentials are not configured" };
  }

  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { status: 401, error: "Session is required" };

  try {
    const user = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }, 5000);
    if (!user?.id) return { status: 401, error: "Invalid session" };
    return { ok: true, user };
  } catch (error) {
    return { status: 401, error: text(error.message, 200) || "Invalid session" };
  }
}

async function optionalUserRequest(req) {
  if (!sameOrigin(req)) return { status: 403, error: "Origin is not allowed" };
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { ok: true, user: null };
  return verifyUserRequest(req);
}

function activePresenceUsers() {
  const now = Date.now();
  for (const [id, user] of presenceUsers.entries()) {
    if (now - user.last_seen_ms > PRESENCE_TTL_MS) presenceUsers.delete(id);
  }
  return [...presenceUsers.values()]
    .filter((user) => now - user.last_seen_ms <= PRESENCE_TTL_MS)
    .sort((a, b) => b.last_seen_ms - a.last_seen_ms)
    .map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      page: user.page,
      last_seen_at: new Date(user.last_seen_ms).toISOString(),
    }));
}

async function handlePresenceApi(req, res) {
  if (req.method === "POST") {
    const auth = await verifyUserRequest(req);
    if (!auth.ok) return json(res, auth.status || 401, { error: auth.error || "Unauthorized" });

    try {
      const input = await readJson(req).catch(() => ({}));
      const user = auth.user;
      const name = text(user.user_metadata?.display_name || user.user_metadata?.name || user.user_metadata?.full_name || user.email || "No name", 160);
      presenceUsers.set(String(user.id), {
        id: text(user.id, 80),
        email: text(user.email, 254),
        name,
        page: text(input.page || "/", 220),
        last_seen_ms: Date.now(),
      });
      return json(res, 200, { ok: true, onlineCount: activePresenceUsers().length });
    } catch (error) {
      return json(res, error.status || 400, { error: text(error.message, 200) });
    }
  }

  if (req.method === "GET") {
    const admin = await verifyAdminRequest(req);
    if (!admin.ok) return json(res, admin.status || 403, { error: admin.error || "Forbidden" });
    const users = activePresenceUsers();
    return json(res, 200, { count: users.length, users });
  }

  return json(res, 405, { error: "Method not allowed" });
}
async function verifyAdminRequest(req) {
  if (!sameOrigin(req)) return { status: 403, error: "Origin is not allowed" };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { status: 503, error: "Supabase server credentials are not configured" };
  }

  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { status: 401, error: "Admin session is required" };

  try {
    const user = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }, 5000);

    const email = String(user?.email || "").toLowerCase();
    const hasRole = user?.app_metadata?.role === "admin" || user?.user_metadata?.role === "admin";
    if (!email || (!ADMIN_EMAILS.includes(email) && !hasRole)) {
      const setupHint = ADMIN_EMAILS.length ? "บัญชีนี้ไม่มีสิทธิ์แอดมิน" : "ยังไม่ได้ตั้งค่าอีเมลแอดมินบน Render";
      return { status: 403, error: setupHint };
    }

    return { ok: true, user };
  } catch (error) {
    return { status: 401, error: text(error.message, 200) || "Invalid admin session" };
  }
}

async function handleAdminUsersApi(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const admin = await verifyAdminRequest(req);
  if (!admin.ok) return json(res, admin.status || 403, { error: admin.error || "Forbidden" });

  try {
    const data = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200&page=1`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    }, 7000);

    const rawUsers = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : [];
    const users = rawUsers.map((user) => ({
      id: text(user.id, 80),
      email: text(user.email, 254),
      name: text(user.user_metadata?.display_name || user.user_metadata?.name || user.user_metadata?.full_name || user.email || "No name", 160),
      created_at: text(user.created_at, 80),
    })).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return json(res, 200, { count: users.length, users });
  } catch (error) {
    return json(res, 502, { error: text(error.message, 200) });
  }
}

async function insertActivityLog(row) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/activity_logs`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(text(message, 200) || `HTTP ${response.status}`);
  }
}

async function fetchCommunityLikeState(userId = "") {
  const url = new URL(`${SUPABASE_URL}/rest/v1/activity_logs`);
  url.searchParams.set("select", "action,user_id,old_name,new_name,created_at");
  url.searchParams.set("action", "in.(community_post_like,community_post_unlike)");
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "5000");

  const data = await fetchJson(url.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  }, 7000);

  const counts = {};
  const liked = new Set();
  const seen = new Set();
  for (const entry of Array.isArray(data) ? data : []) {
    const postId = text(entry.old_name, 160);
    const rowUserId = text(entry.user_id, 80);
    if (!postId || !rowUserId) continue;
    const key = `${postId}\n${rowUserId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isLiked = entry.action === "community_post_like" || entry.new_name === "liked";
    if (!isLiked) continue;
    counts[postId] = (counts[postId] || 0) + 1;
    if (userId && rowUserId === userId) liked.add(postId);
  }

  return { counts, liked: [...liked] };
}

async function handleCommunityLikesApi(req, res) {
  if (req.method === "GET") {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(res, 200, { counts: {}, liked: [] });

    const auth = await optionalUserRequest(req);
    if (!auth.ok) return json(res, auth.status || 401, { error: auth.error || "Unauthorized" });

    try {
      const state = await fetchCommunityLikeState(text(auth.user?.id, 80));
      return json(res, 200, state);
    } catch (error) {
      return json(res, 502, { error: text(error.message, 200) });
    }
  }

  if (req.method === "POST") {
    const auth = await verifyUserRequest(req);
    if (!auth.ok) return json(res, auth.status || 401, { error: auth.error || "Unauthorized" });

    try {
      const input = await readJson(req);
      const postId = text(input.post_id || input.postId || input.id || "", 160);
      if (!postId) return json(res, 400, { error: "Post id is required" });

      const liked = input.liked !== false;
      await insertActivityLog({
        action: liked ? "community_post_like" : "community_post_unlike",
        user_id: text(auth.user.id, 80),
        email: text(auth.user.email, 254),
        old_name: postId,
        new_name: liked ? "liked" : "unliked",
      });

      const state = await fetchCommunityLikeState(text(auth.user.id, 80));
      return json(res, 200, { ok: true, ...state });
    } catch (error) {
      return json(res, error.status || 400, { error: text(error.message, 200) });
    }
  }

  return json(res, 405, { error: "Method not allowed" });
}

async function handleDownloadEventApi(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const auth = await verifyUserRequest(req);
  if (!auth.ok) return json(res, auth.status || 401, { error: auth.error || "Unauthorized" });

  try {
    const input = await readJson(req);
    const assetId = text(input.asset_id || input.assetId || input.id || "", 160);
    const fileTitle = text(input.asset_title || input.assetTitle || input.file_name || input.fileName || "Unknown file", 300);
    if (!assetId && !fileTitle) return json(res, 400, { error: "File data is required" });

    await insertActivityLog({
      action: "asset_download",
      user_id: text(auth.user.id, 80),
      email: text(auth.user.email, 254),
      old_name: assetId,
      new_name: fileTitle,
    });
    return json(res, 202, { ok: true });
  } catch (error) {
    return json(res, error.status || 400, { error: text(error.message, 200) });
  }
}

async function handleDownloadLogsApi(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const admin = await verifyAdminRequest(req);
  if (!admin.ok) return json(res, admin.status || 403, { error: admin.error || "Forbidden" });

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/activity_logs`);
    url.searchParams.set("select", "user_id,email,old_name,new_name,created_at");
    url.searchParams.set("action", "eq.asset_download");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "300");
    const data = await fetchJson(url.toString(), {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    }, 7000);

    const logs = (Array.isArray(data) ? data : []).map((entry) => ({
      user_id: text(entry.user_id, 80),
      email: text(entry.email, 254),
      asset_id: text(entry.old_name, 160),
      asset_title: text(entry.new_name, 300),
      created_at: text(entry.created_at, 80),
    }));
    return json(res, 200, { count: logs.length, logs });
  } catch (error) {
    return json(res, 502, { error: text(error.message, 200) });
  }
}

function serveFile(req, res, pathname) {
  const requestName = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const fileName = FILE_ALIASES.get(requestName) || requestName;
  if (!PUBLIC_FILES.has(fileName)) {
    securityHeaders(res);
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Not found");
    return;
  }

  const filePath = path.join(ROOT, fileName);
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      securityHeaders(res);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("Not found");
      return;
    }

    securityHeaders(res);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(fileName)] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": fileName.endsWith(".html") ? "no-cache" : "public, max-age=300",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).on("error", () => res.destroy()).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const ip = clientIp(req);
  const rawUrl = text(req.url, 1600) || "/";
  const method = String(req.method || "GET").toUpperCase();

  if (!checkWindow(requestWindows, ip, 240, 60_000)) {
    void deliverEvent({
      event_type: "server_rate_limit",
      severity: "high",
      ip_address: ip,
      page: rawUrl,
      user_agent: req.headers["user-agent"],
      referrer: req.headers.referer,
      details: { source: "server", reason: "More than 240 requests per minute", method },
    });
    return json(res, 429, { error: "Too many requests" });
  }

  if (rawUrl === "/healthz") {
    return json(res, 200, {
      ok: true,
      discordConfigured: discordConfigured(),
      databaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    });
  }

    if (MAINTENANCE_MODE) {
        const body = '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Audio Vault — กำลังปรับปรุง</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;overflow:hidden;display:grid;place-items:center;padding:20px;background:linear-gradient(#07101f 0 58%,#111827 58%);color:#f8fafc;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.stars{position:fixed;inset:0;background:radial-gradient(circle at 15% 20%,rgba(78,161,255,.22),transparent 28%),radial-gradient(circle at 85% 15%,rgba(255,124,73,.18),transparent 30%);pointer-events:none}.card{position:relative;width:min(820px,100%);padding:36px 34px 32px;text-align:center;border:1px solid rgba(255,255,255,.14);border-radius:30px;background:rgba(9,15,29,.9);box-shadow:0 28px 90px rgba(0,0,0,.5);overflow:hidden}.badge{display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:999px;background:rgba(255,184,77,.12);color:#ffd28d;font-weight:700}.pulse{width:9px;height:9px;border-radius:50%;background:#ff9d3d;box-shadow:0 0 0 0 rgba(255,157,61,.7);animation:pulse 1.6s infinite}h1{margin:18px 0 10px;font-size:clamp(30px,5vw,48px);line-height:1.12}p{margin:0 auto;color:#b9c5dc;font-size:clamp(16px,2.4vw,19px);line-height:1.75;max-width:650px}.scene{position:relative;height:245px;margin:20px -34px -32px;overflow:hidden;background:linear-gradient(#14243d 0 61%,#6b4a2c 61% 69%,#2c3441 69%)}.moon{position:absolute;right:8%;top:20px;width:44px;height:44px;border-radius:50%;background:#fff3c4;box-shadow:0 0 30px rgba(255,243,196,.45)}.city{position:absolute;left:0;right:0;bottom:95px;height:55px;background:linear-gradient(90deg,#172033 6%,transparent 6% 9%,#172033 9% 20%,transparent 20% 23%,#172033 23% 29%,transparent 29% 34%,#172033 34% 49%,transparent 49% 53%,#172033 53% 69%,transparent 69% 73%,#172033 73% 84%,transparent 84% 88%,#172033 88%);opacity:.8}.road{position:absolute;left:0;right:0;bottom:0;height:76px;background:#242b36;border-top:5px solid #d3a641}.road:after{content:"";position:absolute;left:-10%;right:-10%;top:36px;height:4px;background:repeating-linear-gradient(90deg,#f6d05f 0 48px,transparent 48px 82px);animation:road 1.3s linear infinite}.excavator{position:absolute;left:12%;bottom:55px;width:250px;height:125px;animation:rumble .22s ease-in-out infinite alternate}.track{position:absolute;left:18px;bottom:0;width:135px;height:35px;border:7px solid #171b22;border-radius:25px;background:#555f6b;box-shadow:inset 0 0 0 5px #242b33}.track:after{content:"";position:absolute;left:15px;right:15px;top:6px;height:9px;border-radius:9px;background:repeating-linear-gradient(90deg,#9aa4af 0 12px,#4b5563 12px 18px)}.base{position:absolute;left:48px;bottom:33px;width:100px;height:18px;border-radius:8px;background:#e39216}.body{position:absolute;left:55px;bottom:49px;width:92px;height:56px;border-radius:12px 18px 7px 7px;background:#f4a51c;border:4px solid #ce7d09}.cab{position:absolute;left:94px;bottom:73px;width:48px;height:47px;border-radius:9px 16px 4px 4px;background:#86c5e8;border:5px solid #e99a13;clip-path:polygon(10% 0,75% 0,100% 100%,0 100%)}.arm1,.arm2{position:absolute;height:16px;border-radius:12px;background:#f5a91c;border:3px solid #c97808;transform-origin:8px 8px}.arm1{left:61px;bottom:92px;width:112px;transform:rotate(-35deg);animation:arm1 2.8s ease-in-out infinite}.arm2{left:158px;bottom:145px;width:100px;transform:rotate(62deg);animation:arm2 2.8s ease-in-out infinite}.bucket{position:absolute;left:202px;bottom:45px;width:46px;height:34px;background:#d5840e;clip-path:polygon(0 0,100% 18%,82% 100%,16% 84%);border-radius:4px 7px 18px 7px;transform-origin:8px 8px;transform:rotate(-8deg);animation:bucket 2.8s ease-in-out infinite}.dirt{position:absolute;left:258px;bottom:55px;width:10px;height:10px;border-radius:50%;background:#a9703e;box-shadow:18px 8px #8d5b32,35px 1px #b47a46,47px 13px #714726;animation:dirt 2.8s ease-in-out infinite}.truckbed{position:absolute;left:0;bottom:25px;width:92px;height:45px;background:#e77f2a;clip-path:polygon(0 0,100% 12%,86% 100%,10% 100%)}.truckcab{position:absolute;right:0;bottom:25px;width:60px;height:55px;border-radius:10px 13px 4px 4px;background:#f39a32}.window{position:absolute;right:9px;top:9px;width:30px;height:20px;border-radius:5px;background:#8ed0ec}.wheel{position:absolute;bottom:8px;width:27px;height:27px;border:6px solid #141820;border-radius:50%;background:#6b7280}.w1{left:20px}.w2{right:15px}.cone{position:absolute;bottom:66px;width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-bottom:42px solid #ff7139;filter:drop-shadow(0 5px 0 #f5f5f5)}.c1{left:48%}.c2{left:57%;animation:cone 1.3s ease-in-out infinite}.status{margin-top:24px;color:#8290aa;font-size:14px}@keyframes pulse{70%{box-shadow:0 0 0 12px rgba(255,157,61,0)}}@keyframes rumble{to{transform:translateY(2px)}}@keyframes arm1{0%,100%{transform:rotate(-35deg)}50%{transform:rotate(-18deg)}}@keyframes arm2{0%,100%{transform:rotate(62deg)}50%{transform:rotate(82deg)}}@keyframes bucket{0%,100%{transform:translate(0,0) rotate(-8deg)}50%{transform:translate(16px,17px) rotate(18deg)}}@keyframes dirt{0%,35%,100%{opacity:0;transform:translate(0,0)}55%{opacity:1;transform:translate(18px,-22px)}80%{opacity:0;transform:translate(55px,10px)}}@keyframes drive{0%{transform:translateX(0)}100%{transform:translateX(1100px)}}@keyframes road{to{transform:translateX(-82px)}}@keyframes cone{50%{transform:translateY(-3px)}}@media(max-width:600px){.card{padding:28px 20px 24px}.scene{height:220px;margin:18px -20px -24px}.excavator{left:0;transform:scale(.82);transform-origin:left bottom}.truck{animation-duration:6s}p br{display:none}}@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important}}</style></head><body><div class="stars"></div><main class="card"><div class="badge"><span class="pulse"></span>กำลังดำเนินการ</div><h1>เว็บไซต์กำลังปรับปรุง</h1><p>ขณะนี้อยู่ระหว่างการย้ายข้อมูลและปรับปรุงระบบให้เสถียรขึ้น<br>กรุณากลับมาใหม่อีกครั้งเร็ว ๆ นี้ ไม่นานแน่นอน</p><div class="status">ทีมงานกำลังเร่งดำเนินการให้เรียบร้อย</div><div class="scene"><div class="moon"></div><div class="city"></div><div class="excavator"><div class="track"></div><div class="base"></div><div class="body"></div><div class="cab"></div><div class="arm1"></div><div class="arm2"></div><div class="bucket"></div><div class="dirt"></div></div><div class="truck"><div class="truckbed"></div><div class="truckcab"><div class="window"></div></div><div class="wheel w1"></div><div class="wheel w2"></div></div><div class="cone c1"></div><div class="cone c2"></div><div class="road"></div></div></main></body></html>';
    securityHeaders(res);
    res.writeHead(503, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
      "Retry-After": "3600",
    });
    if (method === "HEAD") return res.end();
    return res.end(body);
  }

if (rawUrl.split("?")[0] === "/api/security-event") {
    return handleSecurityApi(req, res, ip);
  }

  if (rawUrl.split("?")[0] === "/api/admin-users") {
    return handleAdminUsersApi(req, res);
  }

  if (rawUrl.split("?")[0] === "/api/community-likes") {
    return handleCommunityLikesApi(req, res);
  }

  if (rawUrl.split("?")[0] === "/api/download-event") {
    return handleDownloadEventApi(req, res);
  }

  if (rawUrl.split("?")[0] === "/api/download-logs") {
    return handleDownloadLogsApi(req, res);
  }

  if (rawUrl.split("?")[0] === "/api/presence") {
    return handlePresenceApi(req, res);
  }

  const probe = classifyRequest(method, rawUrl);
  if (probe) {
    void deliverEvent({
      event_type: "server_request_probe",
      severity: probe.severity,
      ip_address: ip,
      page: rawUrl,
      user_agent: req.headers["user-agent"],
      referrer: req.headers.referer,
      details: { source: "server", reason: probe.reason, method },
    });
    securityHeaders(res);
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("Not found");
  }

  if (!["GET", "HEAD"].includes(method)) return json(res, 405, { error: "Method not allowed" });

  let pathname;
  try {
    pathname = new URL(rawUrl, `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return json(res, 400, { error: "Bad request" });
  }
  return serveFile(req, res, pathname);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`The Audio Vault server listening on port ${PORT}`);
    if (!discordConfigured()) console.warn("DISCORD_WEBHOOK_URL is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn("Supabase server credentials are not configured");
  });

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

module.exports = { server, classifyRequest, cleanDetails, normalizeIp };
