(function () {
  "use strict";

  const projectRef = "khvbvnpiifhbekqdtldm";
  const heartbeatMs = 15000;
  let timer = null;
  let lastToken = "";

  function sessionToken() {
    const directKey = `sb-${projectRef}-auth-token`;
    const keys = [directKey, ...Object.keys(localStorage).filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))];
    for (const key of keys) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        const token = parsed?.access_token || parsed?.currentSession?.access_token;
        if (token) return token;
      } catch {}
    }
    return "";
  }

  function currentPage() {
    return `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`.slice(0, 220);
  }

  async function heartbeat(useBeacon) {
    const token = sessionToken();
    lastToken = token;
    if (!token || document.visibilityState === "hidden") return;
    const body = JSON.stringify({ page: currentPage() });
    if (useBeacon && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(`/api/presence?token=${encodeURIComponent(token)}`, blob);
        return;
      } catch {}
    }
    try {
      await fetch("/api/presence", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body,
      });
    } catch {}
  }

  function start() {
    if (timer) window.clearInterval(timer);
    void heartbeat(false);
    timer = window.setInterval(() => heartbeat(false), heartbeatMs);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") start();
  });
  window.addEventListener("focus", start);
  window.addEventListener("storage", () => {
    const token = sessionToken();
    if (token !== lastToken) start();
  });

  start();
})();