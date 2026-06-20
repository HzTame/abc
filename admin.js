(() => {
  const blockedPlainKeys = new Set(["o", "p", "s", "u"]);
  const blockedShiftKeys = new Set(["c", "e", "i", "j", "k", "m", "s", "u"]);
  const blockedMacOptionKeys = new Set(["c", "e", "i", "j", "k", "s", "u"]);

  function shouldBlockShortcut(event) {
    const key = event.key || "";
    const code = event.code || "";
    const lowerKey = key.toLowerCase();
    const codeKey = code.startsWith("Key") ? code.slice(3).toLowerCase() : "";
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const keyMatches = (keys) => keys.has(lowerKey) || keys.has(codeKey);

    if (key === "F12" || code === "F12") return true;
    if (event.metaKey && event.altKey && keyMatches(blockedMacOptionKeys)) return true;
    if (ctrlOrMeta && event.shiftKey && keyMatches(blockedShiftKeys)) return true;
    if (ctrlOrMeta && !event.shiftKey && keyMatches(blockedPlainKeys)) return true;
    return false;
  }

  function blockEvent(event) {
    if (!shouldBlockShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  ["keydown", "keypress", "keyup"].forEach((eventName) => {
    window.addEventListener(eventName, blockEvent, true);
    document.addEventListener(eventName, blockEvent, true);
  });

  window.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },
    true
  );
})();

const SUPABASE_URL = "https://khvbvnpiifhbekqdtldm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sFwmcOAlRvzhyULupo4KcQ_UAxqDOQV";
const TABLE_NAME = "shared_assets";
const ACTIVITY_TABLE = "activity_logs";
const STORAGE_BUCKET = "share-files";
const ADMIN_EMAILS = ["mameenokair@gmail.com"];
const COMMUNITY_STORAGE_KEY = "audioVaultCommunityPosts";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  SUPABASE_ANON_KEY &&
  window.supabase;

const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const adminStatus = document.querySelector("#adminStatus");
const adminGate = document.querySelector("#adminGate");
const adminContent = document.querySelector("#adminContent");
const gateMessage = document.querySelector("#gateMessage");
const logoutButton = document.querySelector("#logoutButton");
const authOnlyLinks = document.querySelectorAll("[data-auth-only]");
const adminOnlyLinks = document.querySelectorAll("[data-admin-only]");
const assetList = document.querySelector("#assetList");
const activityList = document.querySelector("#activityList");
const refreshAssets = document.querySelector("#refreshAssets");
const deleteAllAssetsButton = document.querySelector("#deleteAllAssets");
const refreshLogs = document.querySelector("#refreshLogs");
const communityPostList = document.querySelector("#communityPostList");
const refreshPosts = document.querySelector("#refreshPosts");
const deleteAllPostsButton = document.querySelector("#deleteAllPosts");
const adminResetForm = document.querySelector("#adminResetForm");
const adminResetEmail = document.querySelector("#adminResetEmail");
const toast = document.querySelector("#toast");

let session = null;
let assets = [];
let logs = [];
let communityPosts = [];
let toastTimer;

function showToast(message, duration = 3200) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), duration);
}

function currentUser() {
  return session?.user || null;
}

function isAdminUser(user = currentUser()) {
  const email = (user?.email || "").toLowerCase();
  return ADMIN_EMAILS.includes(email);
}

function formatDate(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char];
  });
}

function normalizeAsset(row) {
  return {
    id: row.id,
    title: row.title || "Untitled",
    category: row.category || "sample",
    format: row.format || "Download",
    creator: row.creator || "Community",
    size: row.size || "",
    coverUrl: row.cover_url || "",
    fileName: row.file_name || "",
    filePath: row.file_path || "",
    createdAt: row.created_at || "",
  };
}

function storagePathFromPublicUrl(url) {
  const value = String(url || "");
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const index = value.indexOf(marker);
  if (index < 0) return "";
  const path = value.slice(index + marker.length).split("?")[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function assetStoragePaths(asset) {
  return [
    asset.filePath,
    storagePathFromPublicUrl(asset.coverUrl),
  ]
    .filter(Boolean)
    .filter((path, index, list) => list.indexOf(path) === index);
}

function renderGate() {
  const user = currentUser();
  const isAdmin = isAdminUser(user);

  logoutButton.hidden = !user;
  authOnlyLinks.forEach((link) => {
    link.hidden = !user;
  });
  adminOnlyLinks.forEach((link) => {
    link.hidden = !isAdmin;
  });

  if (!configured) {
    adminStatus.textContent = "ยังไม่ได้ตั้งค่า Supabase";
    gateMessage.textContent = "ยังไม่ได้ตั้งค่าระบบหลังบ้าน จึงเปิดหน้าแอดมินไม่ได้";
    adminGate.hidden = false;
    adminContent.hidden = true;
    return false;
  }

  if (!user) {
    adminStatus.textContent = "ยังไม่ได้เข้าสู่ระบบ";
    gateMessage.textContent = "กรุณาเข้าสู่ระบบด้วยบัญชีแอดมินก่อน";
    adminGate.hidden = false;
    adminContent.hidden = true;
    return false;
  }

  if (!isAdmin) {
    adminStatus.textContent = "ไม่มีสิทธิ์แอดมิน";
    gateMessage.textContent = `บัญชี ${user.email || "-"} ยังไม่มีสิทธิ์แอดมิน`;
    adminGate.hidden = false;
    adminContent.hidden = true;
    return false;
  }

  adminStatus.textContent = `แอดมิน: ${user.email}`;
  adminGate.hidden = true;
  adminContent.hidden = false;
  return true;
}

function renderAssets() {
  if (!assets.length) {
    assetList.innerHTML = `<div class="empty-state">ยังไม่มีรายการอัปโหลด</div>`;
    return;
  }

  assetList.innerHTML = assets
    .map(
      (asset) => `
        <article class="admin-row">
          <div class="admin-row-main">
            <h3>${escapeHtml(asset.title)}</h3>
            <p>${escapeHtml(asset.fileName || asset.filePath || "-")}</p>
            <div class="admin-meta">
              <span>${escapeHtml(asset.category)}</span>
              <span>${escapeHtml(asset.format)}</span>
              <span>${escapeHtml(asset.size || "-")}</span>
              <span>${formatDate(asset.createdAt)}</span>
            </div>
          </div>
          <button class="danger-button admin-delete" type="button" data-delete-id="${escapeHtml(asset.id)}">ลบ</button>
        </article>
      `
    )
    .join("");
}

function renderLogs() {
  if (!logs.length) {
    activityList.innerHTML = `<div class="empty-state">ยังไม่มีบันทึกการเปลี่ยนชื่อ</div>`;
    return;
  }

  activityList.innerHTML = logs
    .map(
      (log) => `
        <article class="activity-item">
          <div>
            <h3>${escapeHtml(log.email || "-")}</h3>
            <p>เปลี่ยนชื่อจาก <strong>${escapeHtml(log.old_name || "-")}</strong> เป็น <strong>${escapeHtml(log.new_name || "-")}</strong></p>
          </div>
          <time>${formatDate(log.created_at)}</time>
        </article>
      `
    )
    .join("");
}

function loadCommunityPosts() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMMUNITY_STORAGE_KEY) || "[]");
    communityPosts = Array.isArray(saved) ? saved : [];
  } catch (error) {
    communityPosts = [];
    showToast("อ่านข้อมูลโพสต์ไม่สำเร็จ", 5200);
  }
  renderCommunityPosts();
}

function saveCommunityPosts() {
  localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(communityPosts));
}

function renderCommunityPosts() {
  if (!communityPostList) return;
  if (!communityPosts.length) {
    communityPostList.innerHTML = `<div class="empty-state">ยังไม่มีโพสต์สมาชิก</div>`;
    return;
  }

  communityPostList.innerHTML = communityPosts
    .map((post) => {
      const replies = Array.isArray(post.replies) ? post.replies.length : 0;
      const views = Number(post.views || 0);
      return `
        <article class="admin-row admin-post-row">
          <div class="admin-row-main">
            <h3>${escapeHtml(post.author || "สมาชิก")}</h3>
            <p>${escapeHtml(post.message || "-")}</p>
            <div class="admin-meta">
              <span>เห็น ${views.toLocaleString("th-TH")} คน</span>
              <span>ตอบกลับ ${replies}</span>
              <span>${formatDate(post.createdAt)}</span>
            </div>
          </div>
          <button class="danger-button admin-delete" type="button" data-delete-post-id="${escapeHtml(post.id)}">ลบโพสต์</button>
        </article>
      `;
    })
    .join("");
}

async function loadAssets() {
  if (!renderGate()) return;
  assetList.innerHTML = `<div class="empty-state">กำลังโหลดรายการ...</div>`;
  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .order("created_at", { ascending: false })
    .order("title", { ascending: true });

  if (error) {
    assetList.innerHTML = `<div class="empty-state">โหลดรายการไม่สำเร็จ: ${error.message}</div>`;
    return;
  }

  assets = (data || []).map(normalizeAsset);
  renderAssets();
}

async function loadLogs() {
  if (!renderGate()) return;
  activityList.innerHTML = `<div class="empty-state">กำลังโหลดบันทึก...</div>`;
  const { data, error } = await db
    .from(ACTIVITY_TABLE)
    .select("id, action, email, old_name, new_name, created_at")
    .eq("action", "profile_name_change")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    activityList.innerHTML = `<div class="empty-state">โหลดบันทึกไม่สำเร็จ: ${error.message}</div>`;
    return;
  }

  logs = data || [];
  renderLogs();
}

async function handleAdminResetPassword(event) {
  event.preventDefault();
  if (!renderGate()) return;

  const email = adminResetEmail.value.trim().toLowerCase();
  if (!email) return;

  const resetUrl = new URL("./index.html", window.location.href);
  resetUrl.searchParams.set("reset_password", "1");
  const redirectTo = resetUrl.href;
  const submitButton = adminResetForm.querySelector("button");
  submitButton.disabled = true;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  submitButton.disabled = false;

  if (error) {
    showToast(error.message || "ส่งลิงก์รีเซ็ตไม่สำเร็จ", 5200);
    return;
  }

  adminResetForm.reset();
  showToast(`ส่งลิงก์รีเซ็ตไปที่ ${email} แล้ว`, 5200);
}

async function deleteAsset(assetId) {
  const asset = assets.find((item) => String(item.id) === String(assetId));
  if (!asset) return;
  const ok = window.confirm(`ลบ "${asset.title}" ออกจากเว็บและ Storage ใช่ไหม?`);
  if (!ok) return;

  const paths = assetStoragePaths(asset);
  const button = document.querySelector(`[data-delete-id="${CSS.escape(String(assetId))}"]`);
  if (button) button.disabled = true;

  try {
    if (paths.length) {
      const { error: storageError } = await db.storage.from(STORAGE_BUCKET).remove(paths);
      if (storageError) throw storageError;
    }

    const { error } = await db.from(TABLE_NAME).delete().eq("id", asset.id);
    if (error) throw error;

    assets = assets.filter((item) => item.id !== asset.id);
    renderAssets();
    showToast("ลบรายการเรียบร้อยแล้ว");
  } catch (error) {
    showToast(error.message || "ลบรายการไม่สำเร็จ", 5200);
    if (button) button.disabled = false;
  }
}

async function deleteAllAssets() {
  if (!renderGate() || !assets.length) {
    showToast("ยังไม่มีไฟล์ให้ลบ");
    return;
  }
  const ok = window.confirm(`ลบไฟล์ทั้งหมด ${assets.length} รายการออกจากเว็บและ Storage ใช่ไหม? การทำงานนี้ย้อนกลับไม่ได้`);
  if (!ok) return;

  deleteAllAssetsButton.disabled = true;
  const paths = [...new Set(assets.flatMap(assetStoragePaths))];
  const ids = assets.map((asset) => asset.id).filter((id) => id !== undefined && id !== null);

  try {
    if (paths.length) {
      const { error: storageError } = await db.storage.from(STORAGE_BUCKET).remove(paths);
      if (storageError) throw storageError;
    }
    if (ids.length) {
      const { error } = await db.from(TABLE_NAME).delete().in("id", ids);
      if (error) throw error;
    }
    assets = [];
    renderAssets();
    showToast("ลบไฟล์ทั้งหมดเรียบร้อยแล้ว");
  } catch (error) {
    showToast(error.message || "ลบไฟล์ทั้งหมดไม่สำเร็จ", 5200);
  } finally {
    deleteAllAssetsButton.disabled = false;
  }
}

function deleteCommunityPost(postId) {
  const post = communityPosts.find((item) => String(item.id) === String(postId));
  if (!post) return;
  const ok = window.confirm(`ลบโพสต์ของ ${post.author || "สมาชิก"} ใช่ไหม?`);
  if (!ok) return;
  communityPosts = communityPosts.filter((item) => String(item.id) !== String(postId));
  saveCommunityPosts();
  renderCommunityPosts();
  showToast("ลบโพสต์เรียบร้อยแล้ว");
}

function deleteAllCommunityPosts() {
  if (!communityPosts.length) {
    showToast("ยังไม่มีโพสต์ให้ลบ");
    return;
  }
  const ok = window.confirm(`ลบโพสต์ทั้งหมด ${communityPosts.length} โพสต์ใช่ไหม?`);
  if (!ok) return;
  communityPosts = [];
  saveCommunityPosts();
  renderCommunityPosts();
  showToast("ลบโพสต์ทั้งหมดเรียบร้อยแล้ว");
}

async function initAuth() {
  if (!configured) {
    renderGate();
    return;
  }

  const { data } = await db.auth.getSession();
  session = data.session;

  if (renderGate()) {
    await Promise.all([loadAssets(), loadLogs()]);
    loadCommunityPosts();
  }

  db.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    if (renderGate()) {
      await Promise.all([loadAssets(), loadLogs()]);
      loadCommunityPosts();
    }
  });
}

assetList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) return;
  deleteAsset(deleteButton.dataset.deleteId);
});

communityPostList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-post-id]");
  if (!deleteButton) return;
  deleteCommunityPost(deleteButton.dataset.deletePostId);
});

refreshAssets.addEventListener("click", loadAssets);
deleteAllAssetsButton.addEventListener("click", deleteAllAssets);
refreshLogs.addEventListener("click", loadLogs);
refreshPosts.addEventListener("click", loadCommunityPosts);
deleteAllPostsButton.addEventListener("click", deleteAllCommunityPosts);
adminResetForm.addEventListener("submit", handleAdminResetPassword);
logoutButton.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  window.location.assign("./index.html");
});

initAuth();
