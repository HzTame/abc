"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 10000);
const ROOT = __dirname;
const DISCORD_WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || "").trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
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
  "upload.js",
  "security.js",
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

function serveFile(req, res, pathname) {
  const fileName = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
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

  if (rawUrl.split("?")[0] === "/api/security-event") {
    return handleSecurityApi(req, res, ip);
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
