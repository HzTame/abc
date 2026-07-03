(function () {
  "use strict";

  const projectRef = "khvbvnpiifhbekqdtldm";
  const searchInput = document.querySelector("#adminAssetSearch");
  const assetList = document.querySelector("#assetList");
  const userList = document.querySelector("#adminUserList");
  const userCount = document.querySelector("#adminUserCount");
  const refreshUsers = document.querySelector("#refreshUsers");
  const onlineList = document.querySelector("#adminOnlineList");
  const onlineCount = document.querySelector("#adminOnlineCount");
  const refreshOnline = document.querySelector("#refreshOnlineUsers");
  let downloadList = null;
  let downloadCount = null;
  let refreshDownloads = null;
  let usersLoaded = false;
  let downloadsLoaded = false;
  let onlineTimer = null;

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function applyAssetSearch() {
    if (!searchInput || !assetList) return;
    const query = normalize(searchInput.value);
    assetList.querySelectorAll(".admin-row").forEach((row) => {
      row.hidden = query ? !normalize(row.textContent).includes(query) : false;
    });
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

  function formatThaiDate(value) {
    if (!value) return "ไม่พบเวลา";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[char]));
  }

  function ensureDownloadPanel() {
    const tabs = document.querySelector(".admin-tabs");
    const content = document.querySelector("#adminContent");
    if (!tabs || !content) return;

    if (!tabs.querySelector('[data-admin-tab="downloads"]')) {
      const button = document.createElement("button");
      button.className = "admin-tab";
      button.type = "button";
      button.setAttribute("aria-controls", "adminDownloadsPanel");
      button.setAttribute("aria-selected", "false");
      button.dataset.adminTab = "downloads";
      button.setAttribute("role", "tab");
      button.textContent = "ประวัติดาวน์โหลด";
      tabs.appendChild(button);
    }

    if (!content.querySelector('[data-admin-panel="downloads"]')) {
      const panel = document.createElement("section");
      panel.className = "admin-panel";
      panel.id = "adminDownloadsPanel";
      panel.dataset.adminPanel = "downloads";
      panel.setAttribute("role", "tabpanel");
      panel.hidden = true;
      panel.innerHTML = `
        <div class="admin-panel-head">
          <div>
            <p class="section-kicker">ดาวน์โหลด</p>
            <h2>บัญชีไหนโหลดไฟล์อะไร</h2>
          </div>
          <div class="admin-panel-actions">
            <p class="admin-user-summary" id="adminDownloadCount">0 รายการ</p>
            <button class="account-action secondary-action" type="button" id="refreshDownloads">รีเฟรช</button>
          </div>
        </div>
        <div class="admin-list" id="adminDownloadList">
          <div class="empty">ยังไม่ได้โหลดประวัติดาวน์โหลด</div>
        </div>
      `;
      const logsPanel = content.querySelector('[data-admin-panel="logs"]');
      content.insertBefore(panel, logsPanel || null);
    }

    downloadList = document.querySelector("#adminDownloadList");
    downloadCount = document.querySelector("#adminDownloadCount");
    refreshDownloads = document.querySelector("#refreshDownloads");
  }

  function setAdminTab(tabName) {
    if (!tabName) return;
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      const active = button.dataset.adminTab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== tabName;
    });
  }

  function renderUsers(users) {
    if (!userList || !userCount) return;
    userCount.textContent = `${users.length} บัญชี`;
    if (!users.length) {
      userList.innerHTML = '<div class="empty">ยังไม่พบบัญชีสมาชิก</div>';
      return;
    }
    userList.innerHTML = users.map((user) => `
      <article class="admin-row admin-user-row">
        <div>
          <strong>${escapeHtml(user.name || user.email || "ไม่มีชื่อ")}</strong>
          <p>${escapeHtml(user.email || "ไม่มีอีเมล")}</p>
        </div>
        <span>${escapeHtml(formatThaiDate(user.created_at))}</span>
      </article>
    `).join("");
  }


  function renderOnlineUsers(users) {
    if (!onlineList || !onlineCount) return;
    onlineCount.textContent = `${users.length} ออนไลน์`;
    if (!users.length) {
      onlineList.innerHTML = '<div class="empty admin-online-empty">ยังไม่มีบัญชีออนไลน์</div>';
      return;
    }
    onlineList.innerHTML = users.map((user) => `
      <article class="admin-online-row">
        <span class="online-dot" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(user.name || user.email || "ไม่มีชื่อ")}</strong>
          <p>${escapeHtml(user.email || "ไม่มีอีเมล")}</p>
          <small>${escapeHtml(user.page || "/")}</small>
        </div>
      </article>
    `).join("");
  }

  function renderDownloadLogs(logs) {
    if (!downloadList || !downloadCount) return;
    downloadCount.textContent = `${logs.length} รายการ`;
    if (!logs.length) {
      downloadList.innerHTML = '<div class="empty">ยังไม่มีประวัติดาวน์โหลด</div>';
      return;
    }
    downloadList.innerHTML = logs.map((log) => `
      <article class="admin-row admin-user-row">
        <div>
          <strong>${escapeHtml(log.asset_title || log.asset_id || "ไม่พบชื่อไฟล์")}</strong>
          <p>${escapeHtml(log.email || "ไม่พบอีเมล")}</p>
          <small>${escapeHtml(log.asset_id || "")}</small>
        </div>
        <span>${escapeHtml(formatThaiDate(log.created_at))}</span>
      </article>
    `).join("");
  }

  async function loadOnlineUsers() {
    if (!onlineList || !onlineCount) return;
    const token = sessionToken();
    if (!token) {
      onlineCount.textContent = "0 ออนไลน์";
      onlineList.innerHTML = '<div class="empty admin-online-empty">ล็อกอินแอดมินก่อนดูออนไลน์</div>';
      return;
    }
    try {
      const response = await fetch("/api/presence", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderOnlineUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error) {
      onlineCount.textContent = "โหลดไม่ได้";
      onlineList.innerHTML = `<div class="empty admin-online-empty">${escapeHtml(error.message || "โหลดออนไลน์ไม่สำเร็จ")}</div>`;
    }
  }

  function startOnlinePolling() {
    if (!onlineList || onlineTimer) return;
    void loadOnlineUsers();
    onlineTimer = window.setInterval(loadOnlineUsers, 8000);
  }
  async function loadUsers() {
    if (!userList || !userCount) return;
    const token = sessionToken();
    if (!token) {
      userCount.textContent = "ยังไม่ได้ล็อกอิน";
      userList.innerHTML = '<div class="empty">กรุณาล็อกอินแอดมินก่อนดูรายชื่อบัญชี</div>';
      return;
    }

    userCount.textContent = "กำลังโหลด...";
    userList.innerHTML = '<div class="empty">กำลังโหลดบัญชีสมาชิก...</div>';
    try {
      const response = await fetch("/api/admin-users", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderUsers(Array.isArray(data.users) ? data.users : []);
      usersLoaded = true;
    } catch (error) {
      userCount.textContent = "โหลดไม่ได้";
      userList.innerHTML = `<div class="empty">${escapeHtml(error.message || "โหลดรายชื่อบัญชีไม่สำเร็จ")}</div>`;
    }
  }

  async function loadDownloadLogs() {
    if (!downloadList || !downloadCount) return;
    const token = sessionToken();
    if (!token) {
      downloadCount.textContent = "ยังไม่ได้ล็อกอิน";
      downloadList.innerHTML = '<div class="empty">กรุณาล็อกอินแอดมินก่อนดูประวัติดาวน์โหลด</div>';
      return;
    }

    downloadCount.textContent = "กำลังโหลด...";
    downloadList.innerHTML = '<div class="empty">กำลังโหลดประวัติดาวน์โหลด...</div>';
    try {
      const response = await fetch("/api/download-logs", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderDownloadLogs(Array.isArray(data.logs) ? data.logs : []);
      downloadsLoaded = true;
    } catch (error) {
      downloadCount.textContent = "โหลดไม่ได้";
      downloadList.innerHTML = `<div class="empty">${escapeHtml(error.message || "โหลดประวัติดาวน์โหลดไม่สำเร็จ")}</div>`;
    }
  }

  if (searchInput && assetList) {
    searchInput.addEventListener("input", applyAssetSearch);
    new MutationObserver(applyAssetSearch).observe(assetList, { childList: true, subtree: true });
  }

  ensureDownloadPanel();
  refreshDownloads?.addEventListener("click", loadDownloadLogs);
  refreshUsers?.addEventListener("click", loadUsers);
  refreshOnline?.addEventListener("click", loadOnlineUsers);
  startOnlinePolling();
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setAdminTab(button.dataset.adminTab);
      if (button.dataset.adminTab === "users" && !usersLoaded) loadUsers();
      if (button.dataset.adminTab === "downloads" && !downloadsLoaded) loadDownloadLogs();
    });
  });
})();
