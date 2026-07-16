"use strict";

(function installR2Fallback() {
  const itemsNode = document.querySelector("#items");
  const searchInput = document.querySelector("#searchInput");
  const resultCount = document.querySelector("#resultCount");
  const statTotal = document.querySelector("#statTotal");
  if (!itemsNode || !searchInput) return;

  const categoryLabels = {
    loop: "Loop",
    plugin: "Plugin",
    project: "Project",
    music: "Music",
    sample: "Fx"
  };
  const categoryDescriptions = {
    loop: "ลูปเสียงสำหรับนำไปต่อยอดงานเพลง",
    plugin: "ปลั๊กอินและเครื่องมือสำหรับงานเสียง",
    project: "ไฟล์โปรเจกต์สำหรับศึกษาและต่อยอด",
    music: "ไฟล์เสียงแบ่งปันจากสมาชิก",
    sample: "ซาวด์และเอฟเฟกต์สำหรับงานเพลง"
  };

  let r2Items = [];
  let activeFilter = "all";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const amount = bytes / Math.pow(1024, index);
    return (amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)) + " " + units[index];
  }

  function render() {
    if (!r2Items.length) return;

    const query = searchInput.value.trim().toLowerCase();
    const visible = r2Items.filter(function (item) {
      const filterMatches = activeFilter === "all" || item.category === activeFilter;
      const queryMatches = !query || [item.title, item.fileName, item.format, item.category]
        .join(" ")
        .toLowerCase()
        .includes(query);
      return filterMatches && queryMatches;
    });

    itemsNode.innerHTML = visible.map(function (item) {
      const rawCategory = item.category || "sample";
      const category = escapeHtml(rawCategory);
      const categoryLabel = escapeHtml(categoryLabels[rawCategory] || rawCategory);
      const description = escapeHtml(categoryDescriptions[rawCategory] || "ไฟล์แบ่งปันจากสมาชิก The Audio Vault");
      const title = escapeHtml(item.title || item.fileName || "ไฟล์แบ่งปัน");
      const format = escapeHtml(item.format || "FILE");
      const formatTag = escapeHtml(String(item.format || "file").toLowerCase());
      const size = escapeHtml(formatBytes(item.sizeBytes));
      const downloadUrl = escapeHtml(item.downloadUrl || item.publicUrl || "#");
      const itemId = escapeHtml(item.id || item.key || item.fileName || title);

      return '<article class="asset-card no-cover" data-type="' + category + '">' +
        '<div class="asset-body">' +
          '<div class="asset-meta"><span>' + format + ' · ' + categoryLabel + '</span><span>' + size + '</span></div>' +
          '<h3>' + title + '</h3>' +
          '<p>' + description + '</p>' +
          '<div class="tag-row"><span>' + categoryLabel.toLowerCase() + '</span><span>' + formatTag + '</span><span>free</span></div>' +
          '<div class="asset-foot"><span>โดย The Audio Vault</span><span>💬 0 คอมเมนต์</span></div>' +
          '<p>0 โหลด</p>' +
          '<div class="asset-actions download-only">' +
            '<a class="download-button" href="' + downloadUrl + '" data-download-id="' + itemId + '" data-download-title="' + title + '">ดาวน์โหลด</a>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join("");

    if (!visible.length) {
      itemsNode.innerHTML = '<div class="empty">ไม่พบรายการที่ตรงกัน</div>';
    }
    if (resultCount) resultCount.textContent = "พบ " + visible.length + " รายการ";
    if (statTotal) statTotal.textContent = String(r2Items.length);
  }

  async function start() {
    try {
      const response = await fetch("/api/r2-files", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("R2 list failed: " + response.status);
      const payload = await response.json();
      r2Items = Array.isArray(payload.items) ? payload.items : [];
      if (!r2Items.length) return;

      document.querySelectorAll("[data-filter]").forEach(function (button) {
        button.addEventListener("click", function () {
          activeFilter = button.dataset.filter || "all";
          window.setTimeout(render, 0);
        });
      });
      document.querySelectorAll("[data-view]").forEach(function (button) {
        button.addEventListener("click", function () {
          window.setTimeout(render, 0);
        });
      });
      searchInput.addEventListener("input", function () {
        window.setTimeout(render, 0);
      });
      window.setTimeout(render, 900);
    } catch (error) {
      console.warn("R2 fallback unavailable:", error && error.message ? error.message : error);
    }
  }

  void start();
})();
