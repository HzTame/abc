(function () {
  "use strict";

  const projectRef = "khvbvnpiifhbekqdtldm";
  const shareCountsKey = "audioVaultAssetShareCounts";
  const recentDownloadLogs = new Map();
  const recentShareLogs = new Map();

  function clean(value, max = 300) {
    const result = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return result.length <= max ? result : `${result.slice(0, Math.max(0, max - 3))}...`;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "") || fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function notify(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
      return;
    }

    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
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

  function payloadFromShareButton(button) {
    const card = button.closest(".asset-card, .asset-detail-panel") || document;
    const title =
      card.querySelector(".asset-title-button, .asset-detail-head h2, h3, h2")?.textContent?.trim() ||
      button.dataset.shareAsset ||
      "Unknown file";
    return {
      asset_id: clean(button.dataset.shareAsset || card.dataset.assetId || title, 160),
      asset_title: clean(title),
      file_name: clean(title),
    };
  }

  function shareUrlForPayload(payload) {
    const url = new URL("./68145.html", window.location.href);
    url.searchParams.set("asset", payload.asset_id || payload.asset_title || "");
    url.searchParams.set("title", payload.asset_title || payload.asset_id || "Audio Vault file");
    url.searchParams.set("v", "share");
    return url.toString();
  }

  async function sharePayload(payload) {
    const url = shareUrlForPayload(payload);
    const data = {
      title: payload.asset_title || "The Audio Vault",
      text: payload.asset_title || "ไฟล์จาก The Audio Vault",
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(data);
        return true;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        notify("คัดลอกลิงก์แชร์แล้ว");
        return true;
      }
    } catch (error) {
      if (error?.name === "AbortError") return false;
    }

    window.prompt("คัดลอกลิงก์แชร์", url);
    return true;
  }

  function firstDatasetValue(root, names) {
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      for (const name of names) {
        const value = node?.dataset?.[name];
        if (value) return value;
      }
    }
    return "";
  }

  function assetIdFromCard(card) {
    return clean(
      card.dataset.assetId ||
      card.dataset.asset ||
      card.dataset.id ||
      firstDatasetValue(card, ["download", "preview", "detail", "detailDownload", "detailPreview", "asset", "assetId", "openAsset"]) ||
      card.querySelector("[data-download]")?.dataset.download ||
      card.querySelector("[data-preview]")?.dataset.preview ||
      "",
      160
    );
  }

  function assetTitleFromCard(card) {
    return clean(
      card.querySelector(".asset-title-button, h3, h2")?.textContent?.trim() ||
      card.querySelector("[data-download], [data-preview]")?.getAttribute("aria-label") ||
      assetIdFromCard(card) ||
      "Audio Vault file"
    );
  }

  function ensureCardShareButtons() {
    document.querySelectorAll(".asset-card").forEach((card) => {
      const assetId = assetIdFromCard(card);
      if (!assetId) return;

      let button = card.querySelector(".asset-card-share-button[data-share-asset]");
      if (!button) {
        button = document.createElement("button");
        button.className = "share-button asset-card-share-button";
        button.type = "button";
        button.dataset.shareAsset = assetId;

        let actions = card.querySelector(".asset-actions");
        if (!actions) {
          actions = document.createElement("div");
          actions.className = "asset-actions asset-share-actions";
          const body = card.querySelector(".asset-body") || card;
          body.appendChild(actions);
        }
        actions.appendChild(button);
      }

      button.dataset.shareAsset = assetId;
      button.dataset.shareTitle = assetTitleFromCard(card);
    });
    renderShareCounts();
  }

  function shareCounts() {
    return readJson(shareCountsKey, {});
  }

  function applyShareCounts(counts) {
    if (counts && typeof counts === "object") writeJson(shareCountsKey, counts);
    renderShareCounts();
  }

  function renderShareCounts() {
    const counts = shareCounts();
    document.querySelectorAll("[data-share-asset]").forEach((button) => {
      const assetId = button.dataset.shareAsset;
      const count = Math.max(0, Number(counts[assetId] || 0));
      const nextText = count ? `แชร์ ${count.toLocaleString("th-TH")}` : "แชร์";
      const nextTitle = count ? `แชร์แล้ว ${count.toLocaleString("th-TH")} ครั้ง` : "แชร์ไฟล์นี้";
      if (button.textContent !== nextText) button.textContent = nextText;
      if (button.title !== nextTitle) button.title = nextTitle;
    });
  }

  async function fetchShareCounts() {
    try {
      const response = await fetch("/api/share-counts", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      applyShareCounts(data.counts || {});
    } catch (error) {
      renderShareCounts();
    }
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

  async function recordSharePayload(payload) {
    if ((!payload.asset_id && !payload.asset_title) || shouldSkip(recentShareLogs, payload, 2500)) return;

    const counts = shareCounts();
    const countKey = payload.asset_id;
    counts[countKey] = Math.max(0, Number(counts[countKey] || 0)) + 1;
    applyShareCounts(counts);

    const token = sessionToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await fetch("/api/share-event", {
        method: "POST",
        headers,
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.counts) applyShareCounts(data.counts);
    } catch {
      void fetchShareCounts();
    }
  }

  async function handleShareButton(button) {
    const payload = payloadFromShareButton(button);
    if (button.dataset.shareTitle) payload.asset_title = clean(button.dataset.shareTitle);
    const didShare = await sharePayload(payload);
    if (didShare) await recordSharePayload(payload);
  }

  function startShareTracking() {
    ensureCardShareButtons();
    void fetchShareCounts();

    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-share-asset]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void handleShareButton(button);
    }, true);

    const itemsNode = document.querySelector("#items");
    if (itemsNode) {
      new MutationObserver(ensureCardShareButtons).observe(itemsNode, { childList: true });
    }

    window.addEventListener("focus", fetchShareCounts);
  }

  window.AudioVaultDownloadTracker = { record, recordShare: handleShareButton, refreshShareCounts: fetchShareCounts };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startShareTracking);
  } else {
    startShareTracking();
  }
})();
