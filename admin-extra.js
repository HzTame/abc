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
  let usersLoaded = false;
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

  if (searchInput && assetList) {
    searchInput.addEventListener("input", applyAssetSearch);
    new MutationObserver(applyAssetSearch).observe(assetList, { childList: true, subtree: true });
  }

  refreshUsers?.addEventListener("click", loadUsers);
  refreshOnline?.addEventListener("click", loadOnlineUsers);
  startOnlinePolling();
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.adminTab === "users" && !usersLoaded) loadUsers();
    });
  });
})();