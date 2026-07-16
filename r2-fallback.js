"use strict";

(function installR2Fallback() {
  const itemsNode = document.querySelector("#items");
  const searchInput = document.querySelector("#searchInput");
  const resultCount = document.querySelector("#resultCount");
  const statTotal = document.querySelector("#statTotal");
  if (!itemsNode || !searchInput) return;

  let r2Items = [];
  let activeFilter = "all";

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const amount = bytes / Math.pow(1024, index);
    return (amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)) + " " + units[index];
  }

  function isAudio(item) {
    return /^(MP3|WAV|FLAC|AIFF?|M4A|OGG|OGA|AAC|WEBM)$/i.test(item.format || "");
  }

  function render() {
    if (!r2Items.length) return;
    const query = searchInput.value.trim().toLowerCase();
    const visible = r2Items.filter((item) => {
      const filterMatches = activeFilter === "all" || item.category === activeFilter;
      const queryMatches = !query || [item.title, item.fileName, item.format, item.category].join(" ").toLowerCase().includes(query);
      return filterMatches && queryMatches;
    });

    itemsNode.innerHTML = visible.map((item) => {
      const title = escapeHtml(item.title || item.fileName || "ไฟล์จาก R2");
      const category = escapeHtml(item.category || "sample");
      const format = escapeHtml(item.format || "FILE");
      const size = escapeHtml(formatBytes(item.sizeBytes));
      const publicUrl = escapeHtml(item.publicUrl || "");
      const downloadUrl = escapeHtml(item.downloadUrl || item.publicUrl || "#");
      const modified = item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString("th-TH") : "";
      return `<article class="asset-card no-cover" data-type="${category}">
        <div class="asset-body">
          <div class="asset-meta"><span>${format} · R2</span><span>${size}</span></div>
          <h3>${title}</h3>
          <p>ไฟล์จริงจาก Cloudflare R2${modified ? ` · อัปเดต ${escapeHtml(modified)}` : ""}</p>
          ${isAudio(item) && publicUrl ? `<audio controls preload="none" src="${publicUrl}" style="width:100%;margin:10px 0"></audio>` : ""}
          <div class="tag-row"><span>R2</span><span>${format}</span></div>
          <div class="asset-foot"><span>Cloudflare R2</span><span>${size}</span></div>
          <div class="asset-actions download-only"><a class="download-button" href="${downloadUrl}">ดาวน์โหลด</a></div>
        </div>
      </article>`;
    }).join("");

    if (!visible.length) itemsNode.innerHTML = '<p class="empty-state">ไม่พบไฟล์ที่ตรงกับการค้นหา</p>';
    if (resultCount) resultCount.textContent = visible.length + " รายการจาก R2";
    if (statTotal) statTotal.textContent = String(r2Items.length);
  }

  async function start() {
    try {
      const response = await fetch("/api/r2-files", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("R2 list failed: " + response.status);
      const payload = await response.json();
      r2Items = Array.isArray(payload.items) ? payload.items : [];
      if (!r2Items.length) return;
      document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
        activeFilter = button.dataset.filter || "all";
        window.setTimeout(render, 0);
      }));
      document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => window.setTimeout(render, 0)));
      searchInput.addEventListener("input", () => window.setTimeout(render, 0));
      window.setTimeout(render, 900);
    } catch (error) {
      console.warn("R2 fallback unavailable:", error?.message || error);
    }
  }

  void start();
})();
