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

  ["dragstart"].forEach((eventName) => {
    window.addEventListener(
      eventName,
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      },
      true
    );
  });

  function lockPageIfDevtoolsOpen() {
    const widthGap = Math.abs(window.outerWidth - window.innerWidth);
    const heightGap = Math.abs(window.outerHeight - window.innerHeight);
    const devtoolsOpen = widthGap > 220 || heightGap > 220;
    document.documentElement.classList.toggle("source-guard-locked", devtoolsOpen);
  }

  window.addEventListener("resize", lockPageIfDevtoolsOpen, true);
  window.setInterval(lockPageIfDevtoolsOpen, 900);
})();

const SUPABASE_URL = "https://khvbvnpiifhbekqdtldm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sFwmcOAlRvzhyULupo4KcQ_UAxqDOQV";
const TABLE_NAME = "shared_assets";
const ACTIVITY_TABLE = "activity_logs";
const STORAGE_BUCKET = "share-files";
const ADMIN_EMAILS = ["mameenokair@gmail.com"];
const COMMUNITY_POSTS_TABLE = "community_posts";
const COMMUNITY_REPLIES_TABLE = "community_replies";
const PENDING_CONFIRMATION_EMAIL_KEY = "audioVaultPendingConfirmationEmail";
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".oga", ".flac", ".m4a", ".aac", ".webm"];
const soundWaveBars = Array.from({ length: 76 }, (_, index) => {
  const mainShape = Math.abs(Math.sin(index * 0.72)) * 34;
  const detailShape = Math.abs(Math.cos(index * 1.37)) * 22;
  const height = Math.round(18 + mainShape + detailShape);
  return `<span style="--wave-height:${height}%;--wave-delay:${index * 14}ms"></span>`;
}).join("");

const demoItems = [
  {
    id: "loop-01",
    title: "Velvet Break Loop",
    category: "loop",
    format: "WAV · 92 BPM",
    description: "ลูปกลองโทนอุ่น มี swing เบา ๆ เหมาะกับ R&B และ lo-fi",
    tags: ["warm", "break", "lofi"],
    creator: "Nara Sound",
    size: "18 MB",
    downloads: 428,
    coverUrl: "",
    pattern: "loop",
  },
  {
    id: "plugin-01",
    title: "Soft Clip Bloom",
    category: "plugin",
    format: "VST3 · AU",
    description: "ปลั๊กอิน soft clipper โทนละมุนสำหรับดัน drum bus และ bass",
    tags: ["vst3", "clipper", "free"],
    creator: "Tone Garden",
    size: "42 MB",
    downloads: 804,
    coverUrl: "",
    pattern: "plugin",
  },
  {
    id: "project-01",
    title: "House Starter Project",
    category: "project",
    format: "Ableton · 124 BPM",
    description: "โปรเจกต์ตั้งต้นพร้อม group, sidechain และ drum rack สำหรับทำ house",
    tags: ["ableton", "house", "template"],
    creator: "Mellow Grid",
    size: "96 MB",
    downloads: 316,
    coverUrl: "",
    pattern: "project",
  },
  {
    id: "sample-01",
    title: "Glass Hat Pack",
    category: "sample",
    format: "24-bit WAV",
    description: "ชุด hi-hat สั้น สว่าง แต่ไม่บาดหู สำหรับ trap และ pop",
    tags: ["hat", "bright", "short"],
    creator: "zxcvza67",
    size: "12 MB",
    downloads: 611,
    coverUrl: "",
    pattern: "hat",
  },
  {
    id: "loop-02",
    title: "Rainy Perc Texture",
    category: "loop",
    format: "WAV · 110 BPM",
    description: "percussion loop แบบ organic เติม movement ให้ beat ไม่แห้ง",
    tags: ["perc", "organic", "texture"],
    creator: "Field Notes",
    size: "24 MB",
    downloads: 189,
    coverUrl: "",
    pattern: "perc",
  },
  {
    id: "sample-02",
    title: "Deep Mono Kick",
    category: "sample",
    format: "WAV · One-shot",
    description: "kick หนักแต่หัวนุ่ม เหลือพื้นที่ให้ vocal และ bass",
    tags: ["kick", "deep", "mono"],
    creator: "Low Room",
    size: "4 MB",
    downloads: 532,
    coverUrl: "",
    pattern: "kick",
  },
];

const categoryLabels = {
  all: "ทั้งหมด",
  plugin: "Plugin",
  loop: "Loop",
  project: "Project",
  sample: "ไฟล์เสียง",
};

const itemsNode = document.querySelector("#items");
const resultCount = document.querySelector("#resultCount");
const statTotal = document.querySelector("#statTotal");
const searchInput = document.querySelector("#searchInput");
const filterButtons = document.querySelectorAll("[data-filter]");
const viewButtons = document.querySelectorAll("[data-view]");
const siteHeader = document.querySelector(".site-header");
const listSection = document.querySelector("#list");
const listNavLinks = document.querySelectorAll("[data-list-link]");
const authModal = document.querySelector("#authModal");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authSubmit = document.querySelector("#authSubmit");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const signupOnlyFields = document.querySelectorAll(".signup-only");
const resetOnlyFields = document.querySelectorAll(".reset-only");
const authTabsPanel = document.querySelector(".auth-tabs");
const passwordField = document.querySelector("#passwordField");
const accountBox = document.querySelector("#accountBox");
const accountName = document.querySelector("#accountName");
const accountEmail = document.querySelector("#accountEmail");
const profileAvatar = document.querySelector("#profileAvatar");
const profileForm = document.querySelector("#profileForm");
const emailForm = document.querySelector("#emailForm");
const passwordForm = document.querySelector("#passwordForm");
const loginButtons = [document.querySelector("#loginButton"), document.querySelector("#heroLoginButton")].filter(Boolean);
const closeAuth = document.querySelector("#closeAuth");
const logoutButton = document.querySelector("#logoutButton");
const loginLabel = document.querySelector("#loginLabel");
const authOnlyLinks = document.querySelectorAll("[data-auth-only]");
const adminOnlyLinks = document.querySelectorAll("[data-admin-only]");
const toast = document.querySelector("#toast");
const displayNameInput = document.querySelector("#displayName");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const profileNameInput = document.querySelector("#profileName");
const newEmailInput = document.querySelector("#newEmail");
const forgotPasswordButton = document.querySelector("#forgotPasswordButton");
const resendConfirmationButton = document.querySelector("#resendConfirmationButton");
const recoveryPasswordForm = document.querySelector("#recoveryPasswordForm");
const recoveryPasswordInput = document.querySelector("#recoveryPassword");
const recoveryPasswordConfirmInput = document.querySelector("#recoveryPasswordConfirm");
const postComposer = document.querySelector("#postComposer");
const postMessageInput = document.querySelector("#postMessage");
const communityLogin = document.querySelector("#communityLogin");
const communityLoginButton = document.querySelector("#communityLoginButton");
const communityPostsNode = document.querySelector("#communityPosts");

const supabaseConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  SUPABASE_ANON_KEY &&
  SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY" &&
  window.supabase;

const db = supabaseConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let items = [];
let activeFilter = "all";
let activePreviewId = "";
let authMode = "signin";
let session = null;
let passwordRecoveryActive = false;
let demoUser = JSON.parse(localStorage.getItem("soundshareDemoUser") || "null");
let communityMessages = [];
let audioCtx;
let previewAudio;
let previewTimer;
let playerTimer;
let toastTimer;
let activePreviewIsAudio = false;
let previewPaused = false;
const savedPreviewVolume = Number(localStorage.getItem("soundsharePreviewVolume"));
let previewVolume = Number.isFinite(savedPreviewVolume) ? savedPreviewVolume : 0.9;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug(value) {
  return String(value || "file")
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeItem(row) {
  const tags = Array.isArray(row.tags)
    ? row.tags
    : String(row.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    id: row.id,
    title: row.title || "Untitled",
    category: row.category || row.type || "sample",
    format: row.format || row.meta || row.file_type || "Download",
    description: row.description || row.desc || "",
    tags,
    creator: row.creator || row.creator_name || row.author || "Community",
    size: row.size || row.file_size_label || "",
    downloads: Number(row.downloads || 0),
    coverUrl: row.cover_url || row.coverUrl || "",
    audioUrl: row.audio_url || row.preview_url || row.audioUrl || "",
    downloadUrl: row.download_url || row.downloadUrl || "",
    fileName: row.file_name || row.fileName || row.original_name || row.originalName || "",
    filePath: row.file_path || row.storage_path || row.filePath || "",
    pattern: row.pattern || row.category || "loop",
    createdAt: row.created_at || row.createdAt || "",
  };
}

function stableSortItems(list) {
  return [...list].sort((a, b) => {
    const timeA = Date.parse(a.createdAt || "");
    const timeB = Date.parse(b.createdAt || "");
    const hasTimeA = Number.isFinite(timeA);
    const hasTimeB = Number.isFinite(timeB);

    if (hasTimeA && hasTimeB && timeA !== timeB) return timeB - timeA;
    if (hasTimeA !== hasTimeB) return hasTimeA ? -1 : 1;

    const titleSort = String(a.title || "").localeCompare(String(b.title || ""), ["th", "en"], {
      numeric: true,
      sensitivity: "base",
    });
    if (titleSort) return titleSort;

    return String(a.id || "").localeCompare(String(b.id || ""), ["th", "en"], {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function isAudioAsset(item) {
  const sourceText = [
    item.audioUrl,
    item.downloadUrl,
    item.filePath,
    item.format,
    item.title,
  ]
    .join(" ")
    .toLowerCase();

  return sourceText.includes("audio/") || AUDIO_EXTENSIONS.some((extension) => sourceText.includes(extension));
}

async function getPreviewUrl(item) {
  if (item.audioUrl) return item.audioUrl;
  if (!isAudioAsset(item)) return "";

  if (db && item.filePath) {
    const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 120);
    if (!error && data?.signedUrl) return data.signedUrl;
  }

  return item.downloadUrl || "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function startPlayerTicker() {
  clearInterval(playerTimer);
  playerTimer = window.setInterval(syncPlayerUi, 300);
}

function syncPlayerUi() {
  const card = document.querySelector(".asset-card.is-playing");
  if (card) card.classList.toggle("is-paused", Boolean(activePreviewIsAudio && previewAudio?.paused));

  const player = document.querySelector(".mini-player");
  if (!player || !previewAudio) return;

  const duration = Number.isFinite(previewAudio.duration) ? previewAudio.duration : 0;
  const current = Number.isFinite(previewAudio.currentTime) ? previewAudio.currentTime : 0;
  const progress = duration ? Math.round((current / duration) * 1000) : 0;

  const currentNode = player.querySelector("[data-current-time]");
  const durationNode = player.querySelector("[data-duration]");
  const seekNode = player.querySelector("[data-seek]");
  const toggleNode = player.querySelector("[data-toggle-play]");
  const muteNode = player.querySelector("[data-mute]");
  const volumeNode = player.querySelector("[data-volume]");

  if (currentNode) currentNode.textContent = formatTime(current);
  if (durationNode) durationNode.textContent = formatTime(duration);
  if (seekNode && document.activeElement !== seekNode) seekNode.value = progress;
  if (toggleNode) toggleNode.textContent = previewAudio.paused ? "เล่นต่อ" : "พัก";
  if (muteNode) muteNode.textContent = previewAudio.muted || previewAudio.volume === 0 ? "เปิดเสียง" : "ปิดเสียง";
  if (volumeNode && document.activeElement !== volumeNode) {
    volumeNode.value = Math.round((previewAudio.muted ? 0 : previewAudio.volume) * 100);
  }
}

async function toggleActiveAudio() {
  if (!previewAudio || !activePreviewId) return;
  try {
    if (previewAudio.paused) {
      await previewAudio.play();
    } else {
      previewAudio.pause();
    }
    previewPaused = previewAudio.paused;
    syncPlayerUi();
  } catch (error) {
    showToast("ไม่สามารถเล่นไฟล์เสียงนี้ได้");
  }
}

function restartActiveAudio() {
  if (!previewAudio || !activePreviewId) return;
  previewAudio.currentTime = 0;
  syncPlayerUi();
}

function seekActiveAudio(value) {
  if (!previewAudio || !activePreviewId) return;
  const duration = Number.isFinite(previewAudio.duration) ? previewAudio.duration : 0;
  if (!duration) return;
  previewAudio.currentTime = (Number(value) / 1000) * duration;
  syncPlayerUi();
}

function setActiveVolume(value) {
  if (!previewAudio) return;
  const nextVolume = Number(value);
  previewVolume = Number.isFinite(nextVolume) ? clamp(nextVolume / 100, 0, 1) : previewVolume;
  previewAudio.volume = previewVolume;
  previewAudio.muted = previewVolume === 0;
  localStorage.setItem("soundsharePreviewVolume", String(previewVolume));
  syncPlayerUi();
}

function toggleMute() {
  if (!previewAudio) return;
  previewAudio.muted = !previewAudio.muted;
  syncPlayerUi();
}

function currentUser() {
  if (session?.user) {
    const metadata = session.user.user_metadata || {};
    return {
      id: session.user.id,
      email: session.user.email || "",
      name:
        metadata.display_name ||
        metadata.full_name ||
        metadata.name ||
        metadata.user_name ||
        metadata.preferred_username ||
        session.user.email ||
        "Social user",
    };
  }
  return demoUser;
}

async function loadCommunityMessages() {
  if (!communityPostsNode) return true;
  if (!db) {
    communityMessages = [];
    renderCommunity();
    return false;
  }

  const [postsResult, repliesResult] = await Promise.all([
    db
      .from(COMMUNITY_POSTS_TABLE)
      .select("id,user_id,author,message,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from(COMMUNITY_REPLIES_TABLE)
      .select("id,post_id,user_id,author,message,created_at")
      .order("created_at", { ascending: true }),
  ]);

  const error = postsResult.error || repliesResult.error;
  if (error) {
    console.error("Could not load community posts:", error);
    communityMessages = [];
    renderCommunity();
    showToast("โหลดโพสต์ไม่สำเร็จ กรุณาตรวจตารางและ RLS ใน Supabase", 6200);
    return false;
  }

  const repliesByPost = new Map();
  (repliesResult.data || []).forEach((reply) => {
    const replies = repliesByPost.get(reply.post_id) || [];
    replies.push({
      id: reply.id,
      userId: reply.user_id,
      author: reply.author,
      message: reply.message,
      createdAt: reply.created_at,
    });
    repliesByPost.set(reply.post_id, replies);
  });

  communityMessages = (postsResult.data || []).map((post) => ({
    id: post.id,
    userId: post.user_id,
    author: post.author,
    message: post.message,
    createdAt: post.created_at,
    views: 0,
    replies: repliesByPost.get(post.id) || [],
  }));
  renderCommunity();
  return true;
}

function communityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "เมื่อสักครู่";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderCommunity() {
  if (!postComposer || !communityLogin || !communityPostsNode) return;
  const user = currentUser();
  postComposer.hidden = !user;
  communityLogin.hidden = Boolean(user);

  if (!communityMessages.length) {
    communityPostsNode.innerHTML = `<div class="community-empty">ยังไม่มีข้อความ เริ่มบทสนทนาแรกของชุมชนได้เลย</div>`;
    return;
  }

  communityPostsNode.innerHTML = communityMessages
    .map((post) => {
      const replies = Array.isArray(post.replies) ? post.replies : [];
      return `
        <article class="community-post">
          <div class="post-head">
            <span class="post-author">${esc(post.author || "สมาชิก")}</span>
            <div class="post-meta">
              <span class="post-views" title="จำนวนผู้ชมโพสต์">👁 ${Number(post.views || 0).toLocaleString("th-TH")} คนเห็นโพสต์นี้</span>
              <time class="post-time">${esc(communityTime(post.createdAt))}</time>
            </div>
          </div>
          <p class="post-message">${esc(post.message)}</p>
          <div class="post-actions">
            <button class="reply-toggle" type="button" data-reply-toggle="${esc(post.id)}">ตอบกลับ${replies.length ? ` (${replies.length})` : ""}</button>
          </div>
          ${
            replies.length
              ? `<div class="replies">
                  ${replies
                    .map(
                      (reply) => `
                        <div class="reply-item">
                          <div class="reply-head">
                            <span class="reply-author">${esc(reply.author || "สมาชิก")}</span>
                            <time class="post-time">${esc(communityTime(reply.createdAt))}</time>
                          </div>
                          <p class="reply-message">${esc(reply.message)}</p>
                        </div>
                      `
                    )
                    .join("")}
                </div>`
              : ""
          }
          <form class="reply-form" data-reply-form="${esc(post.id)}" hidden>
            <textarea maxlength="500" rows="2" placeholder="เขียนข้อความตอบกลับ..." aria-label="ข้อความตอบกลับ" required></textarea>
            <button class="reply-submit" type="submit">ส่งคำตอบ</button>
          </form>
        </article>
      `;
    })
    .join("");
}

async function handlePostSubmit(event) {
  event.preventDefault();
  const user = currentUser();
  const message = postMessageInput?.value.trim();
  if (!user) {
    openAuth("signin");
    return;
  }
  if (!message) return;
  if (!db) {
    showToast("ยังไม่ได้เชื่อมต่อ Supabase");
    return;
  }

  const submitButton = postComposer.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  const { error } = await db.from(COMMUNITY_POSTS_TABLE).insert({
    user_id: user.id,
    author: user.name || user.email || "สมาชิก",
    message: message.slice(0, 800),
  });
  submitButton.disabled = false;

  if (error) {
    console.error("Could not create community post:", error);
    showToast(`โพสต์ไม่สำเร็จ: ${error.message}`, 6200);
    return;
  }

  postComposer.reset();
  await loadCommunityMessages();
  showToast("โพสต์ข้อความแล้ว");
}

function handleCommunityClick(event) {
  const toggle = event.target.closest("[data-reply-toggle]");
  if (!toggle) return;
  if (!currentUser()) {
    openAuth("signin");
    showToast("เข้าสู่ระบบก่อนตอบกลับข้อความ");
    return;
  }

  const form = communityPostsNode.querySelector(`[data-reply-form="${CSS.escape(toggle.dataset.replyToggle)}"]`);
  if (!form) return;
  form.hidden = !form.hidden;
  if (!form.hidden) form.querySelector("textarea")?.focus();
}

async function handleReplySubmit(event) {
  const form = event.target.closest("[data-reply-form]");
  if (!form) return;
  event.preventDefault();
  const user = currentUser();
  if (!user) {
    openAuth("signin");
    return;
  }

  const input = form.querySelector("textarea");
  const message = input?.value.trim();
  const post = communityMessages.find((entry) => entry.id === form.dataset.replyForm);
  if (!message || !post) return;
  if (!db) {
    showToast("ยังไม่ได้เชื่อมต่อ ระบบหลังบ้าน");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  const { error } = await db.from(COMMUNITY_REPLIES_TABLE).insert({
    post_id: post.id,
    user_id: user.id,
    author: user.name || user.email || "สมาชิก",
    message: message.slice(0, 500),
  });
  submitButton.disabled = false;

  if (error) {
    console.error("Could not create community reply:", error);
    showToast(`ตอบกลับไม่สำเร็จ: ${error.message}`, 6200);
    return;
  }

  await loadCommunityMessages();
  showToast("ตอบกลับข้อความแล้ว");
}

function isAdminUser(user = currentUser()) {
  const email = (user?.email || "").toLowerCase();
  return ADMIN_EMAILS.includes(email);
}

async function recordActivityLog(payload) {
  if (!db) return;
  const { error } = await db.from(ACTIVITY_TABLE).insert(payload);
  if (error) console.warn("Could not record activity log:", error.message);
}

function visibleItems() {
  const query = searchInput.value.trim().toLowerCase();
  return items.filter((item) => {
    const filterMatch = activeFilter === "all" || item.category === activeFilter;
    const text = `${item.title} ${item.category} ${item.format} ${item.description} ${item.creator} ${item.tags.join(" ")}`.toLowerCase();
    return filterMatch && text.includes(query);
  });
}

function downloadCountLabel(count) {
  return `${Number(count || 0).toLocaleString("th-TH")} โหลด`;
}

function renderItems() {
  const visible = visibleItems();
  resultCount.textContent = `พบ ${visible.length} รายการ`;
  statTotal.textContent = items.length;

  if (!visible.length) {
    itemsNode.innerHTML = `<div class="empty">ไม่พบรายการที่ตรงกัน</div>`;
    return;
  }

  itemsNode.innerHTML = visible
    .map((item) => {
      const active = item.id === activePreviewId;
      const hasPlayer = active && activePreviewIsAudio;
      const canPreview = isAudioAsset(item);
      const hasCover = Boolean(item.coverUrl);
      const cardClass = `asset-card${active ? " is-playing" : ""}${active && previewPaused ? " is-paused" : ""}${hasCover ? "" : " no-cover"}`;
      const downloadCountAttr = item.size ? "" : ` data-download-count="${esc(item.id)}"`;
      const canDownload = Boolean(currentUser());
      const downloadClass = `download-button${canDownload ? "" : " is-locked"}`;
      const downloadState = canDownload ? "" : ' disabled aria-disabled="true" title="ล็อกอินก่อนดาวน์โหลด"';
      const downloadLabel = canDownload ? "ดาวน์โหลด" : "ล็อกอินก่อนโหลด";
      return `
        <article class="${cardClass}" data-type="${esc(item.category)}">
          ${
            hasCover
              ? `
                <div class="asset-cover">
                  <img src="${esc(item.coverUrl)}" alt="${esc(item.title)}" loading="lazy" />
                  <span class="asset-badge">${esc(categoryLabels[item.category] || item.category)}</span>
                  <div class="wave-meter" aria-hidden="true">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                </div>
              `
              : ""
          }
          <div class="asset-body">
            <div class="asset-meta">
              <span>${esc(item.format)}</span>
              <span${downloadCountAttr}>${esc(item.size || downloadCountLabel(item.downloads))}</span>
            </div>
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.description)}</p>
            <div class="sound-wave" aria-hidden="true">
              ${soundWaveBars}
            </div>
            ${
              hasPlayer
                ? `
                  <div class="mini-player" data-player="${esc(item.id)}">
                    <div class="player-time">
                      <span>PREVIEW</span>
                      <span><span data-current-time>0:00</span> / <span data-duration>0:00</span></span>
                    </div>
                    <input class="seek-slider" type="range" min="0" max="1000" step="1" value="0" data-seek="${esc(item.id)}" aria-label="เลื่อนตำแหน่งเสียง" />
                    <div class="player-controls">
                      <button class="player-icon" type="button" data-toggle-play="${esc(item.id)}" aria-label="${previewPaused ? "เล่นต่อ" : "พัก"}" title="${previewPaused ? "เล่นต่อ" : "พัก"}">${previewPaused ? "▶" : "⏸"}</button>
                      <button class="player-icon" type="button" data-restart="${esc(item.id)}" aria-label="เริ่มใหม่" title="เริ่มใหม่">↺</button>
                      <button class="player-icon" type="button" data-mute="${esc(item.id)}" aria-label="${previewAudio?.muted ? "เปิดเสียง" : "ปิดเสียง"}" title="${previewAudio?.muted ? "เปิดเสียง" : "ปิดเสียง"}">${previewAudio?.muted ? "🔇" : "🔊"}</button>
                      <label class="volume-control">
                        <span aria-hidden="true">🔉</span>
                        <input type="range" min="0" max="100" step="1" value="${Math.round((previewAudio?.muted ? 0 : previewVolume) * 100)}" data-volume="${esc(item.id)}" aria-label="ปรับเสียง" />
                      </label>
                    </div>
                  </div>
                `
                : ""
            }
            <div class="tag-row">
              ${item.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}
            </div>
            <div class="asset-foot">
              <span>โดย ${esc(item.creator)}</span>
              <span data-download-count="${esc(item.id)}">${downloadCountLabel(item.downloads)}</span>
            </div>
            <div class="asset-actions${canPreview ? "" : " download-only"}">
              ${canPreview ? `<button class="preview-button icon-preview" type="button" data-preview="${esc(item.id)}" aria-label="${active ? "หยุดเสียงตัวอย่าง" : "ฟังเสียงตัวอย่าง"}" title="${active ? "หยุด" : "ฟัง"}">${active ? "■" : "▶"}</button>` : ""}
              <button class="${downloadClass}" type="button" data-download="${esc(item.id)}"${downloadState}>${downloadLabel}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), duration);
}

async function loadItems() {
  if (!db) {
    items = demoItems.map(normalizeItem);
    renderItems();
    return;
  }

  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .order("created_at", { ascending: false })
    .order("title", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    items = demoItems.map(normalizeItem);
    showToast("โหลดข้อมูลจากหลังบ้านไม่สำเร็จโปรดรอสักแป๊บ");
  } else {
    items = stableSortItems((data || []).map(normalizeItem));
  }
  renderItems();
}

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function noise(ctx, duration) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
  return buffer;
}

function tone(ctx, start, frequency, duration, type = "sine", level = 0.25) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(level, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function hat(ctx, start) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise(ctx, 0.06);
  filter.type = "highpass";
  filter.frequency.value = 7600;
  gain.gain.setValueAtTime(0.22, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(start);
}

function snare(ctx, start) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise(ctx, 0.16);
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  gain.gain.setValueAtTime(0.36, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(start);
}

function kick(ctx, start) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(132, start);
  osc.frequency.exponentialRampToValueAtTime(42, start + 0.34);
  gain.gain.setValueAtTime(0.75, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.44);
}

function playDemoPattern(pattern) {
  const ctx = getAudioContext();
  const start = ctx.currentTime + 0.02;
  const kind = pattern || "loop";

  if (kind === "plugin") {
    kick(ctx, start);
    snare(ctx, start + 0.22);
    tone(ctx, start + 0.36, 196, 0.25, "triangle", 0.22);
  } else if (kind === "kick") {
    kick(ctx, start);
  } else if (kind === "hat") {
    hat(ctx, start);
    hat(ctx, start + 0.12);
    hat(ctx, start + 0.24);
  } else if (kind === "perc") {
    tone(ctx, start, 520, 0.08, "square", 0.16);
    tone(ctx, start + 0.18, 430, 0.08, "square", 0.14);
    hat(ctx, start + 0.32);
  } else {
    kick(ctx, start);
    hat(ctx, start + 0.14);
    snare(ctx, start + 0.28);
    hat(ctx, start + 0.42);
    kick(ctx, start + 0.56);
  }
}

function stopPreview() {
  if (previewAudio) {
    previewAudio.onended = null;
    previewAudio.onerror = null;
    previewAudio.ontimeupdate = null;
    previewAudio.onloadedmetadata = null;
    previewAudio.onplay = null;
    previewAudio.onpause = null;
    previewAudio.pause();
    previewAudio.currentTime = 0;
  }
  clearTimeout(previewTimer);
  clearInterval(playerTimer);
  activePreviewId = "";
  activePreviewIsAudio = false;
  previewPaused = false;
  renderItems();
}

async function previewItem(item) {
  if (!isAudioAsset(item)) {
    showToast("ไฟล์นี้ไม่ใช่ไฟล์เสียง สามารถดาวน์โหลดได้อย่างเดียว");
    return;
  }

  if (activePreviewId === item.id) {
    stopPreview();
    return;
  }

  stopPreview();
  activePreviewId = item.id;
  renderItems();

  const selectedId = item.id;
  const previewUrl = await getPreviewUrl(item);
  if (activePreviewId !== selectedId) return;

  if (previewUrl) {
    previewAudio = previewAudio || new Audio();
    previewAudio.volume = previewVolume;
    activePreviewIsAudio = true;
    previewPaused = false;
    renderItems();
    previewAudio.src = previewUrl;
    previewAudio.onended = stopPreview;
    previewAudio.ontimeupdate = syncPlayerUi;
    previewAudio.onloadedmetadata = syncPlayerUi;
    previewAudio.onplay = () => {
      previewPaused = false;
      syncPlayerUi();
    };
    previewAudio.onpause = () => {
      previewPaused = true;
      syncPlayerUi();
    };
    previewAudio.onerror = () => {
      if (activePreviewId !== selectedId) return;
      stopPreview();
      showToast("ไม่สามารถเล่นไฟล์เสียงนี้ได้");
    };
    try {
      await previewAudio.play();
      startPlayerTicker();
      syncPlayerUi();
    } catch (error) {
      stopPreview();
      showToast("ไม่สามารถเล่นไฟล์เสียงนี้ได้");
    }
    return;
  }

  playDemoPattern(item.pattern);
  previewTimer = window.setTimeout(stopPreview, 1800);
}

function downloadFileName(item) {
  const originalName = safeDownloadName(item.fileName);
  if (originalName) return originalName;

  const source = item.filePath || item.downloadUrl || item.audioUrl || "";
  const cleanSource = source.split("?")[0];
  let name = cleanSource.split("/").filter(Boolean).pop() || `${slug(item.title)}.txt`;

  try {
    name = decodeURIComponent(name);
  } catch (error) {
    name = `${slug(item.title)}.txt`;
  }

  const ext = fileExtension(name);
  const titleName = safeDownloadName(item.title);
  if (titleName) return ext && !titleName.toLowerCase().endsWith(ext.toLowerCase()) ? `${titleName}${ext}` : titleName;

  return safeDownloadName(name.replace(/^\d+-/, "")) || "download";
}

function fileExtension(fileName) {
  return String(fileName || "").match(/\.[a-z0-9]{1,8}$/i)?.[0] || "";
}

function safeDownloadName(fileName) {
  return String(fileName || "")
    .normalize("NFC")
    .replace(/[\\/\u0000-\u001f\u007f]+/g, "-")
    .trim();
}

function saveBlob(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function recordDownload(item) {
  const nextDownloads = Number(item.downloads || 0) + 1;
  item.downloads = nextDownloads;

  document.querySelectorAll("[data-download-count]").forEach((node) => {
    if (node.dataset.downloadCount === String(item.id)) node.textContent = downloadCountLabel(nextDownloads);
  });

  if (!db || !item.id) return;

  const { data, error } = await db.rpc("increment_download_count", { asset_id: item.id });
  if (error) {
    console.warn("Could not update download count:", error.message);
    return;
  }

  const savedDownloads = Number(data || nextDownloads);
  item.downloads = savedDownloads;
  document.querySelectorAll("[data-download-count]").forEach((node) => {
    if (node.dataset.downloadCount === String(item.id)) node.textContent = downloadCountLabel(savedDownloads);
  });
}

async function downloadItem(item) {
  if (!currentUser()) {
    showToast("กรุณาล็อกอินก่อนดาวน์โหลด");
    openAuth("signin");
    return;
  }

  const fileName = downloadFileName(item);

  try {
    if (db && item.filePath) {
      const { data, error } = await db.storage.from(STORAGE_BUCKET).download(item.filePath);
      if (error) throw error;
      saveBlob(data, fileName);
      await recordDownload(item);
      showToast("เริ่มดาวน์โหลดแล้ว");
      return;
    }

    if (item.downloadUrl) {
      const response = await fetch(item.downloadUrl);
      if (!response.ok) throw new Error("ดาวน์โหลดไฟล์ไม่สำเร็จ");
      const blob = await response.blob();
      saveBlob(blob, fileName);
      await recordDownload(item);
      showToast("เริ่มดาวน์โหลดแล้ว");
      return;
    }
  } catch (error) {
    showToast(error.message || "ดาวน์โหลดไฟล์ไม่สำเร็จ");
    return;
  }

  const blob = new Blob(
    [`The Audio Vault\nTitle: ${item.title}\nCategory: ${item.category}\nCreator: ${item.creator}\nTags: ${item.tags.join(", ")}\n`],
    { type: "text/plain" }
  );
  saveBlob(blob, `${slug(item.title)}.txt`);
  await recordDownload(item);
}

function openAuth(mode = "signin") {
  setAuthMode(mode);
  authModal.classList.add("open");
  authModal.setAttribute("aria-hidden", "false");
}

function closeAuthModal() {
  authModal.classList.remove("open");
  authModal.setAttribute("aria-hidden", "true");
}

function jumpToList() {
  if (!listSection) return;
  const headerHeight = siteHeader?.offsetHeight || 0;
  const top = listSection.getBoundingClientRect().top + window.scrollY - headerHeight - 14;
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}

function recoveryUrlState() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = search.get("code") || hash.get("code") || "";
  const tokenHash = search.get("token_hash") || hash.get("token_hash") || "";
  const type = search.get("type") || hash.get("type") || "";
  const errorDescription = search.get("error_description") || hash.get("error_description") || "";
  // A confirmation link can also contain `code` or access tokens. Only treat
  // the callback as password recovery when it is explicitly marked as such.
  const isRecovery = search.get("reset_password") === "1" || type === "recovery";

  return {
    isRecovery,
    code,
    tokenHash,
    type,
    accessToken: hash.get("access_token") || "",
    refreshToken: hash.get("refresh_token") || "",
    errorDescription,
  };
}

async function restoreRecoverySession(state) {
  if (!db || !state?.isRecovery) return { session: null, error: null };

  if (state.errorDescription) {
    return { session: null, error: new Error(state.errorDescription) };
  }

  if (state.code) {
    const { data, error } = await db.auth.exchangeCodeForSession(state.code);
    return { session: data?.session || null, error };
  }

  if (state.tokenHash) {
    const { data, error } = await db.auth.verifyOtp({
      token_hash: state.tokenHash,
      type: "recovery",
    });
    return { session: data?.session || null, error };
  }

  if (state.accessToken && state.refreshToken) {
    const { data, error } = await db.auth.setSession({
      access_token: state.accessToken,
      refresh_token: state.refreshToken,
    });
    return { session: data?.session || null, error };
  }

  return { session: null, error: null };
}

function passwordRecoveryRedirectUrl() {
  const url = new URL("./index.html", window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("reset_password", "1");
  return url.href;
}

function emailConfirmationRedirectUrl() {
  const url = new URL("./index.html", window.location.href);
  url.search = "";
  url.hash = "";
  return url.href;
}

function updateResendConfirmationButton() {
  if (!resendConfirmationButton) return;
  const pendingEmail = localStorage.getItem(PENDING_CONFIRMATION_EMAIL_KEY) || "";
  resendConfirmationButton.hidden = authMode !== "signin" || Boolean(currentUser()) || !pendingEmail;
}

async function handleResendConfirmation() {
  const email = (localStorage.getItem(PENDING_CONFIRMATION_EMAIL_KEY) || emailInput.value || "")
    .trim()
    .toLowerCase();

  if (!email) {
    showToast("กรุณาใส่อีเมลที่ใช้สมัครก่อน");
    return;
  }
  if (!db) {
    showToast("ยังไม่ได้เชื่อมต่อ ระบบหลังบ้าน");
    return;
  }

  resendConfirmationButton.disabled = true;
  try {
    const { error } = await db.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: emailConfirmationRedirectUrl() },
    });
    if (error) throw error;

    localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, email);
    showToast("ส่งอีเมลยืนยันอีกครั้งแล้ว กรุณาเช็ก ในกล่องข้อความอีเมล", 7200);
  } catch (error) {
    console.error("Confirmation resend failed:", error);
    showToast(authErrorMessage(error, email), 7200);
  } finally {
    resendConfirmationButton.disabled = false;
    updateResendConfirmationButton();
  }
}

function cleanRecoveryUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("reset_password");
  url.searchParams.delete("code");
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  url.hash = "";
  window.history.replaceState(null, "", url.pathname + url.search);
}

function showPasswordRecoveryPanel() {
  if (!currentUser() || !recoveryPasswordForm) return false;

  passwordRecoveryActive = true;
  recoveryPasswordForm.reset();
  authModal.classList.add("open");
  authModal.setAttribute("aria-hidden", "false");
  updateAuthPanelState();
  showToast("ยืนยันอีเมลแล้ว ตั้งรหัสผ่านใหม่ได้เลย", 6200);
  window.setTimeout(() => {
    recoveryPasswordForm.scrollIntoView({ block: "center" });
    recoveryPasswordInput.focus();
  }, 100);
  return true;
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";
  const isReset = mode === "reset";
  authTitle.textContent = isReset ? "ลืมรหัสผ่าน" : isSignup ? "สร้างบัญชี" : "ล็อกอิน";
  authSubmit.textContent = isReset ? "ส่งลิงก์รีเซ็ต" : isSignup ? "สร้างบัญชี" : "ล็อกอิน";
  authTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  signupOnlyFields.forEach((field) => {
    field.hidden = !isSignup;
  });
  resetOnlyFields.forEach((field) => {
    field.hidden = !isReset;
  });
  passwordField.hidden = isReset;
  passwordInput.disabled = isReset;
  passwordInput.required = !isReset;
  forgotPasswordButton.hidden = isSignup;
  forgotPasswordButton.textContent = isReset ? "กลับไปล็อกอิน" : "ลืมรหัสผ่าน?";
  document.body.classList.toggle("signup-mode", isSignup);
  updateAuthPanelState();
  updateResendConfirmationButton();
}

function updateAccountUI() {
  const user = currentUser();
  authOnlyLinks.forEach((link) => {
    link.hidden = !user;
  });
  adminOnlyLinks.forEach((link) => {
    link.hidden = !isAdminUser(user);
  });
  loginLabel.textContent = user ? user.name : "ล็อกอิน";
  accountName.textContent = user ? user.name : "ยังไม่ได้เข้าสู่ระบบ";
  accountEmail.textContent = user?.email || "ไม่มีอีเมลในบัญชีนี้";
  profileAvatar.textContent = (user?.name || user?.email || "A").trim().slice(0, 1).toUpperCase();
  profileNameInput.value = user?.name || "";
  newEmailInput.value = user?.email || "";
  updateAuthPanelState();
  updateResendConfirmationButton();
  renderItems();
  renderCommunity();
}

function updateAuthPanelState() {
  const user = currentUser();
  const isSignedIn = Boolean(user);

  if (passwordRecoveryActive && recoveryPasswordForm) {
    authTabsPanel.hidden = true;
    authForm.hidden = true;
    accountBox.hidden = true;
    recoveryPasswordForm.hidden = false;
    authTitle.textContent = "ตั้งรหัสผ่านใหม่";
    document.body.classList.remove("signup-mode");
    return;
  }

  authTabsPanel.hidden = isSignedIn;
  authForm.hidden = isSignedIn;
  accountBox.hidden = !isSignedIn;
  if (recoveryPasswordForm) recoveryPasswordForm.hidden = true;

  if (isSignedIn) {
    authTitle.textContent = "ข้อมูลส่วนตัว";
    document.body.classList.remove("signup-mode");
    return;
  }

  const isSignup = authMode === "signup";
  const isReset = authMode === "reset";
  authTitle.textContent = isReset ? "ลืมรหัสผ่าน" : isSignup ? "สร้างบัญชี" : "ล็อกอิน";
  authSubmit.textContent = isReset ? "ส่งลิงก์รีเซ็ต" : isSignup ? "สร้างบัญชี" : "ล็อกอิน";
}

async function initAuth() {
  if (!db) {
    updateAccountUI();
    return;
  }

  const recoveryState = recoveryUrlState();
  const recoveryResult = await restoreRecoverySession(recoveryState);

  const { data } = await db.auth.getSession();
  session = recoveryResult.session || data.session;
  updateAccountUI();
  if (recoveryState.isRecovery && !showPasswordRecoveryPanel()) {
    const detail = recoveryResult.error?.message ? `: ${recoveryResult.error.message}` : "";
    showToast(`ลิงก์รีเซ็ตไม่สมบูรณ์หรือหมดอายุ ลองขอลิงก์ใหม่อีกครั้ง${detail}`, 7600);
  }

  db.auth.onAuthStateChange((event, nextSession) => {
    session = nextSession;
    updateAccountUI();
    if (event === "PASSWORD_RECOVERY") {
      showPasswordRecoveryPanel();
    }
  });
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const displayName = displayNameInput.value.trim() || email.split("@")[0];

  if (authMode === "reset") {
    if (!email) {
      showToast("กรุณาใส่อีเมลสำหรับรีเซ็ตรหัสผ่าน");
      return;
    }

    if (!db) {
      showToast("โหมดตัวอย่างไม่สามารถส่งอีเมลรีเซ็ตได้");
      return;
    }

    authSubmit.disabled = true;
    try {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: passwordRecoveryRedirectUrl(),
      });
      if (error) throw error;

      setAuthMode("signin");
      authForm.reset();
      showToast("ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว", 5600);
    } catch (error) {
      console.error("Password reset request failed:", error);
      showToast(authErrorMessage(error, email, "reset"), 7200);
    } finally {
      authSubmit.disabled = false;
    }
    return;
  }

  if (!db) {
    demoUser = { id: "demo-user", email, name: displayName };
    localStorage.setItem("soundshareDemoUser", JSON.stringify(demoUser));
    updateAccountUI();
    closeAuthModal();
    showToast("เข้าสู่ระบบโหมดตัวอย่างแล้ว");
    authForm.reset();
    return;
  }

  const isSignup = authMode === "signup";
  authSubmit.disabled = true;
  try {
    const request = isSignup
      ? db.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: emailConfirmationRedirectUrl(),
            data: { display_name: displayName },
          },
        })
      : db.auth.signInWithPassword({ email, password });

    const { data, error } = await request;
    if (error) throw error;

    if (isSignup && Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
      localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, email);
      setAuthMode("signin");
      authForm.reset();
      showToast("อีเมลนี้เคยสมัครแล้ว หากยังไม่ได้ยืนยันให้กดส่งอีเมลยืนยันอีกครั้ง", 7200);
      return;
    }

    if (isSignup && !data?.session) {
      localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, email);
      setAuthMode("signin");
      authForm.reset();
      showToast("ส่งอีเมลยืนยันแล้ว กรุณาเช็กในกล่องข้อความ หรือกดส่งอีกครั้ง", 7200);
      return;
    }

    localStorage.removeItem(PENDING_CONFIRMATION_EMAIL_KEY);
    updateResendConfirmationButton();
    closeAuthModal();
    authForm.reset();
    showToast(isSignup ? "สมัครและเข้าสู่ระบบแล้ว" : "เข้าสู่ระบบแล้ว");
  } catch (error) {
    console.error(isSignup ? "Sign up failed:" : "Sign in failed:", error);
    showToast(authErrorMessage(error, email), 7200);
  } finally {
    authSubmit.disabled = false;
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const user = currentUser();
  const displayName = profileNameInput.value.trim();
  if (!user || !displayName) return;
  const oldName = user.name || "";

  if (!db) {
    demoUser = { ...demoUser, name: displayName };
    localStorage.setItem("soundshareDemoUser", JSON.stringify(demoUser));
    updateAccountUI();
    showToast("แก้ไขชื่อเสร็จสิ้น");
    return;
  }

  const submitButton = profileForm.querySelector("button");
  submitButton.disabled = true;
  const { data, error } = await db.auth.updateUser({ data: { display_name: displayName } });
  submitButton.disabled = false;

  if (error) {
    showToast(authErrorMessage(error, ""), 5200);
    return;
  }

  if (session && data?.user) session = { ...session, user: data.user };
  if (displayName !== oldName) {
    await recordActivityLog({
      action: "profile_name_change",
      user_id: user.id,
      email: user.email || "",
      old_name: oldName,
      new_name: displayName,
    });
  }
  updateAccountUI();
  showToast("แก้ไขชื่อเสร็จสิ้น");
}

async function handleEmailUpdate(event) {
  event.preventDefault();
  const user = currentUser();
  const email = newEmailInput.value.trim().toLowerCase();
  if (!user || !email || email === user.email) return;

  if (!db) {
    demoUser = { ...demoUser, email };
    localStorage.setItem("soundshareDemoUser", JSON.stringify(demoUser));
    updateAccountUI();
    showToast("แก้ไขอีเมลเสร็จสิ้น");
    return;
  }

  const submitButton = emailForm.querySelector("button");
  submitButton.disabled = true;
  const { data, error } = await db.auth.updateUser({ email });
  submitButton.disabled = false;

  if (error) {
    showToast(authErrorMessage(error, email), 5200);
    return;
  }

  if (session && data?.user) session = { ...session, user: data.user };
  updateAccountUI();
  showToast("ส่งคำขอเปลี่ยนอีเมลแล้ว กรุณาเช็กอีเมลเพื่อยืนยัน", 5600);
}

async function handlePasswordUpdate(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user?.email) {
    showToast("ไม่พบอีเมลที่ยืนยันแล้วในบัญชีนี้", 5200);
    return;
  }

  if (!db) {
    showToast("ยังไม่ได้เชื่อมต่อ ระบบหลังบ้าน");
    return;
  }

  const submitButton = passwordForm.querySelector("button");
  submitButton.disabled = true;
  try {
    const { error } = await db.auth.resetPasswordForEmail(user.email, {
      redirectTo: passwordRecoveryRedirectUrl(),
    });
    if (error) throw error;

    passwordForm.classList.remove("is-highlighted");
    showToast(`ส่งลิงก์เปลี่ยนรหัสผ่านไปที่ ${user.email} แล้ว`, 7200);
  } catch (error) {
    console.error("Password change email failed:", error);
    showToast(authErrorMessage(error, user.email, "reset"), 7200);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleRecoveryPasswordSubmit(event) {
  event.preventDefault();
  const password = recoveryPasswordInput.value;
  const confirmation = recoveryPasswordConfirmInput.value;

  if (!db || !currentUser()) {
    showToast("ลิงก์รีเซ็ตหมดอายุ กรุณาขอลิงก์ใหม่อีกครั้ง", 6200);
    return;
  }
  if (password.length < 6) {
    showToast("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", 4200);
    return;
  }
  if (password !== confirmation) {
    showToast("รหัสผ่านทั้งสองช่องไม่ตรงกัน", 4200);
    recoveryPasswordConfirmInput.focus();
    return;
  }

  const submitButton = recoveryPasswordForm.querySelector("button");
  submitButton.disabled = true;
  const { error } = await db.auth.updateUser({ password });
  submitButton.disabled = false;

  if (error) {
    showToast(authErrorMessage(error, ""), 6200);
    return;
  }

  passwordRecoveryActive = false;
  recoveryPasswordForm.reset();
  cleanRecoveryUrl();
  updateAccountUI();
  closeAuthModal();
  showToast("ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว");
}

function authErrorMessage(error, email = "", action = "auth") {
  let message = typeof error === "string" ? error : error?.message;
  if (message && typeof message !== "string") {
    try {
      message = JSON.stringify(message);
    } catch {
      message = String(message);
    }
  }

  const emptyMessage = !message || message.trim() === "{}" || message.trim() === "[object Object]";
  if (emptyMessage) {
    message = action === "reset"
      ? "ส่งอีเมลรีเซ็ตไม่สำเร็จ กรุณาตรวจสอบ ระบบหลังบ้าน แล้วลองใหม่"
      : "ไม่สามารถเข้าสู่ระบบได้";
  }

  if (/email not confirmed/i.test(message)) {
    return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ";
  }
  if (/invalid login credentials/i.test(message)) {
    const typoHint = email.endsWith("@gmall.com") ? " ตรวจดูว่าอีเมลเป็น @gmail.com หรือไม่" : "";
    return `อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ยืนยันอีเมล${typoHint}`;
  }
  if (/smtp|error sending (recovery )?email|unexpected_failure|email rate limit/i.test(message)) {
    return "ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบ Custom SMTP, Gmail และ App Password แล้วลองใหม่";
  }
  return message;
}

async function handleLogout() {
  if (db) {
    await db.auth.signOut();
  }
  demoUser = null;
  localStorage.removeItem("soundshareDemoUser");
  updateAccountUI();
  closeAuthModal();
  window.location.assign("./index.html#home");
}

itemsNode.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-toggle-play]");
  const restartButton = event.target.closest("[data-restart]");
  const muteButton = event.target.closest("[data-mute]");
  const previewButton = event.target.closest("[data-preview]");
  const downloadButton = event.target.closest("[data-download]");

  if (toggleButton) {
    toggleActiveAudio();
    return;
  }

  if (restartButton) {
    restartActiveAudio();
    return;
  }

  if (muteButton) {
    toggleMute();
    return;
  }

  if (previewButton) {
    const item = items.find((entry) => entry.id === previewButton.dataset.preview);
    if (item) previewItem(item);
  }

  if (downloadButton) {
    const item = items.find((entry) => entry.id === downloadButton.dataset.download);
    if (item) downloadItem(item);
  }
});

itemsNode.addEventListener("input", (event) => {
  const seekInput = event.target.closest("[data-seek]");
  const volumeInput = event.target.closest("[data-volume]");

  if (seekInput) {
    seekActiveAudio(seekInput.value);
    return;
  }

  if (volumeInput) {
    setActiveVolume(volumeInput.value);
  }
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderItems();
  });
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    viewButtons.forEach((item) => item.classList.toggle("active", item === button));
    itemsNode.classList.toggle("list-view", button.dataset.view === "list");
  });
});

searchInput.addEventListener("input", renderItems);
postComposer?.addEventListener("submit", handlePostSubmit);
communityLoginButton?.addEventListener("click", () => openAuth("signin"));
communityPostsNode?.addEventListener("click", handleCommunityClick);
communityPostsNode?.addEventListener("submit", handleReplySubmit);
listNavLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.pathname && link.pathname !== window.location.pathname) return;
    event.preventDefault();
    history.replaceState(null, "", "#list");
    jumpToList();
  });
});
authForm.addEventListener("submit", handleAuthSubmit);
profileForm.addEventListener("submit", handleProfileSubmit);
emailForm.addEventListener("submit", handleEmailUpdate);
passwordForm.addEventListener("submit", handlePasswordUpdate);
recoveryPasswordForm?.addEventListener("submit", handleRecoveryPasswordSubmit);
closeAuth.addEventListener("click", closeAuthModal);
logoutButton.addEventListener("click", handleLogout);
authTabs.forEach((tab) => tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode)));
forgotPasswordButton.addEventListener("click", () => setAuthMode(authMode === "reset" ? "signin" : "reset"));
resendConfirmationButton?.addEventListener("click", handleResendConfirmation);
loginButtons.forEach((button) => button.addEventListener("click", () => openAuth(button.id === "heroLoginButton" ? "signup" : "signin")));

authModal.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuthModal();
});

setAuthMode("signin");
renderCommunity();
initAuth();
loadCommunityMessages();
loadItems();

if (window.location.hash === "#list") {
  window.setTimeout(jumpToList, 0);
}
