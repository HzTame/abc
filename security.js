(() => {
  const SUPABASE_URL = "https://khvbvnpiifhbekqdtldm.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_sFwmcOAlRvzhyULupo4KcQ_UAxqDOQV";
  const SECURITY_EVENTS_TABLE = "security_events";
  const ADMIN_EMAILS = ["mameenokair@gmail.com"];
  const SECURITY_VERSION = "20260623-security-watch";

  const configured = window.supabase && SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY;
  const securityDb = configured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storageKey: "audio-vault-security-watch",
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
  const recentEvents = new Map();

  let networkInfoPromise = null;

  function limitText(value, maxLength = 500) {
    const text = String(value || "").trim();
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
  }

  function safeJson(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch {
      return {};
    }
  }

  function cleanNetworkValue(value, maxLength = 128) {
    const text = String(value || "").trim();
    return text.length <= maxLength ? text : text.slice(0, maxLength);
  }

  function networkScore(info) {
    return ["ip", "city", "region", "country", "isp"].reduce(
      (score, key) => score + (info[key] ? 1 : 0),
      0
    );
  }

  async function fetchNetworkService(service) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), 3500) : null;

    try {
      const response = await fetch(service.url, {
        cache: "no-store",
        signal: controller?.signal,
      });
      if (!response.ok) return {};

      const data = await response.json();
      const info = service.read(data) || {};
      return {
        ip: cleanNetworkValue(info.ip, 64),
        city: cleanNetworkValue(info.city),
        region: cleanNetworkValue(info.region),
        country: cleanNetworkValue(info.country),
        isp: cleanNetworkValue(info.isp, 160),
      };
    } catch (error) {
      console.warn(`Security network lookup failed from ${service.url}:`, error);
      return {};
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function getNetworkInfo() {
    if (networkInfoPromise) return networkInfoPromise;

    networkInfoPromise = (async () => {
      if (typeof fetch !== "function") return {};

      const services = [
        {
          url: "https://ipapi.co/json/",
          read: (data) => ({
            ip: data?.ip,
            city: data?.city,
            region: data?.region,
            country: data?.country_name,
            isp: data?.org || data?.asn,
          }),
        },
        {
          url: "https://ipwho.is/",
          read: (data) => ({
            ip: data?.ip,
            city: data?.city,
            region: data?.region,
            country: data?.country,
            isp: data?.connection?.isp || data?.connection?.org,
          }),
        },
        {
          url: "https://ipinfo.io/json",
          read: (data) => ({
            ip: data?.ip,
            city: data?.city,
            region: data?.region,
            country: data?.country,
            isp: data?.org,
          }),
        },
        {
          url: "https://api.ipify.org?format=json",
          read: (data) => ({ ip: data?.ip }),
        },
        {
          url: "https://api64.ipify.org?format=json",
          read: (data) => ({ ip: data?.ip }),
        },
      ];

      const results = await Promise.allSettled(services.map(fetchNetworkService));
      return (
        results
          .map((result) => (result.status === "fulfilled" ? result.value : {}))
          .filter((info) => networkScore(info) > 0)
          .sort((a, b) => networkScore(b) - networkScore(a))[0] || {}
      );
    })();

    return networkInfoPromise;
  }

  function isAdminUser(user) {
    const email = String(user?.email || "").toLowerCase();
    return ADMIN_EMAILS.includes(email);
  }

  function safeDecode(value) {
    let text = String(value || "");
    for (let index = 0; index < 2; index += 1) {
      try {
        const decoded = decodeURIComponent(text);
        if (decoded === text) break;
        text = decoded;
      } catch {
        break;
      }
    }
    return text;
  }

  function pageValue() {
    return limitText(`${window.location.pathname}${window.location.search}${window.location.hash}`, 700);
  }

  async function reportSecurityEvent(eventType, severity = "medium", details = {}) {
    if (!securityDb) return false;

    const normalizedType = limitText(eventType, 80) || "security_event";
    const normalizedSeverity = ["low", "medium", "high", "critical"].includes(severity) ? severity : "medium";
    const dedupeKey = `${normalizedType}:${normalizedSeverity}:${pageValue()}:${JSON.stringify(details).slice(0, 180)}`;
    const now = Date.now();
    const recentTime = recentEvents.get(dedupeKey) || 0;

    if (now - recentTime < 30000) return false;
    recentEvents.set(dedupeKey, now);

    const network = await getNetworkInfo();
    const payload = {
      event_type: normalizedType,
      severity: normalizedSeverity,
      user_id: details.user_id || null,
      email: limitText(details.email || "", 254),
      ip_address: network.ip || null,
      city: network.city || null,
      region: network.region || null,
      country: network.country || null,
      isp: network.isp ? network.isp.replace(/^AS[0-9]+\s+/i, "") : null,
      page: pageValue(),
      referrer: limitText(document.referrer || "", 700),
      user_agent: limitText(navigator.userAgent || "", 700),
      details: {
        ...safeJson(details),
        security_version: SECURITY_VERSION,
      },
    };

    const { error } = await securityDb.from(SECURITY_EVENTS_TABLE).insert(payload);
    if (error) {
      console.warn("Could not report security event:", error.message);
      return false;
    }
    return true;
  }

  function detectSuspiciousUrl() {
    const rawUrl = `${window.location.pathname} ${window.location.search} ${window.location.hash}`;
    const decodedUrl = safeDecode(rawUrl);
    const suspiciousPatterns = [
      { label: "WordPress admin scan", severity: "medium", re: /wp-admin|wp-login|xmlrpc\.php/i },
      { label: "phpMyAdmin scan", severity: "medium", re: /phpmyadmin|pma\/|mysqladmin/i },
      { label: "env/config file scan", severity: "high", re: /\.env|config\.php|database\.yml|composer\.json|package-lock\.json/i },
      { label: "path traversal probe", severity: "high", re: /\.\.\/|\.\.\\|%2e%2e%2f|etc\/passwd|windows\/win\.ini/i },
      { label: "SQL injection probe", severity: "high", re: /union\s+select|select\s+.+\s+from|or\s+1\s*=\s*1|sleep\s*\(|benchmark\s*\(/i },
      { label: "XSS probe", severity: "high", re: /<script|javascript:|onerror\s*=|onload\s*=|%3cscript/i },
      { label: "command injection probe", severity: "critical", re: /cmd=|exec=|eval\s*\(|base64_decode|\/bin\/sh|powershell/i },
      { label: "shell/backdoor scan", severity: "critical", re: /shell\.php|wso\.php|c99\.php|r57\.php|webshell|backdoor/i },
    ];

    const hit = suspiciousPatterns.find((pattern) => pattern.re.test(decodedUrl));
    if (!hit) return;

    void reportSecurityEvent("suspicious_url_probe", hit.severity, {
      reason: hit.label,
      raw_url: limitText(rawUrl, 700),
      decoded_url: limitText(decodedUrl, 700),
    });
  }

  async function detectProtectedPageAccess(user = null, isAdmin = false) {
    const pageName = window.location.pathname.split("/").pop().toLowerCase();
    if (!["admin.html", "upload.html"].includes(pageName)) return;

    const allowedAdmin = isAdmin || isAdminUser(user);

    if (pageName === "admin.html" && !allowedAdmin) {
      void reportSecurityEvent(user ? "non_admin_opened_admin_page" : "guest_opened_admin_page", "high", {
        page: pageName,
        user_id: user?.id || "",
        email: user?.email || "",
      });
      return;
    }

    if (pageName === "upload.html" && !user) {
      void reportSecurityEvent("guest_opened_upload_page", "medium", {
        page: pageName,
      });
    }
  }

  window.AudioVaultSecurity = {
    report: reportSecurityEvent,
    networkInfo: getNetworkInfo,
    detectSuspiciousUrl,
    detectProtectedPageAccess,
  };

  detectSuspiciousUrl();
})();
