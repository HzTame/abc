(function () {
  "use strict";

  const projectRef = "khvbvnpiifhbekqdtldm";
  const recentDownloadLogs = new Map();

  function clean(value, max = 300) {
    const result = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return result.length <= max ? result : `${result.slice(0, Math.max(0, max - 3))}...`;
  }

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

  function dedupeKey(payload) {
    return `${payload.asset_id || ""}:${payload.asset_title || ""}`;
  }

  function shouldSkip(store, payload, durationMs = 4000) {
    const key = dedupeKey(payload);
    const now = Date.now();
    const previous = store.get(key) || 0;
    store.set(key, now);
    if (store.size > 80) store.delete(store.keys().next().value);
    return now - previous < durationMs;
  }

  function payloadFromItem(item, fileName) {
    const title = clean(item?.title || item?.name || fileName || "Unknown file");
    return {
      asset_id: clean(item?.id || item?.asset_id || item?.assetId || item?.filePath || item?.downloadUrl || title, 160),
      asset_title: title,
      file_name: clean(fileName || item?.fileName || item?.filePath || item?.downloadUrl || title),
    };
  }

  async function record(item, fileName) {
    const token = sessionToken();
    if (!token) return;

    const payload = payloadFromItem(item, fileName);
    if ((!payload.asset_id && !payload.asset_title) || shouldSkip(recentDownloadLogs, payload)) return;

    try {
      await fetch("/api/download-event", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
    } catch {}
  }

  window.AudioVaultDownloadTracker = { record };
})();
