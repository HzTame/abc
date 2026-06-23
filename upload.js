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
const STORAGE_BUCKET = "share-files";
const ADMIN_EMAILS = ["mameenokair@gmail.com"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".oga", ".flac", ".m4a", ".aac", ".webm"];

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  SUPABASE_ANON_KEY &&
  window.supabase;

const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const configStatus = document.querySelector("#configStatus");
const logoutButton = document.querySelector("#logoutButton");
const assetForm = document.querySelector("#assetForm");
const uploadButton = document.querySelector("#uploadButton");
const uploadState = document.querySelector("#uploadState");
const authOnlyLinks = document.querySelectorAll("[data-auth-only]");
const adminOnlyLinks = document.querySelectorAll("[data-admin-only]");
const progressBar = document.querySelector("#progressBar");
const toast = document.querySelector("#toast");
const titleInput = document.querySelector("#assetTitle");
const categoryInput = document.querySelector("#assetCategory");
const mainFileInput = document.querySelector("#assetFile");
const mainFileType = document.querySelector("#mainFileType");
const fileHelp = document.querySelector("#fileHelp");

function inputValue(selector) {
  return document.querySelector(selector)?.value?.trim() || "";
}

const fileInputs = [
  ["#assetFile", "#fileName"],
  ["#assetCover", "#coverName"],
];
const defaultFileLabels = {
  "#fileName": "ลากไฟล์มาวาง หรือคลิกเลือก",
  "#coverName": "ลากรูปปกมาวาง หรือคลิกเลือก",
};

let session = null;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function setProgress(value, label) {
  progressBar.style.width = `${value}%`;
  if (uploadState) uploadState.textContent = label;
}

function slug(value) {
  return String(value || "file")
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function storageFileName(fileName) {
  const rawName = String(fileName || "file");
  const extensionMatch = rawName.match(/\.([A-Za-z0-9]{1,12})$/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";
  const baseName = extension ? rawName.slice(0, -extension.length) : rawName;
  const safeBase =
    baseName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/\u0000-\u001f\u007f]+/g, "-")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 140) || "file";

  return `${safeBase}${extension}`;
}

function titleFromFileName(fileName) {
  return String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileSizeLabel(bytes) {
  if (!bytes) return "0 KB";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function uploadErrorMessage(error, file) {
  const message = error?.message || String(error || "");
  const fileLabel = file ? ` "${file.name}" (${fileSizeLabel(file.size)})` : "";

  if (/maximum allowed size|exceeded.*size|too large|payload too large/i.test(message)) {
    return `ไฟล์${fileLabel} ใหญ่เกินลิมิตของ Supabase Storage ให้ลดขนาดไฟล์ หรือเพิ่ม File size limit ของ bucket share-files`;
  }

  if (/mime|content type|not allowed/i.test(message)) {
    return `ชนิดไฟล์${fileLabel} ยังไม่ได้รับอนุญาตใน bucket ให้เพิ่มประเภทไฟล์เสียงนี้ใน Allowed MIME types`;
  }

  if (/invalid key|invalid.*path|invalid.*object/i.test(message)) {
    return `ชื่อไฟล์${fileLabel} มีอักขระที่ Supabase Storage ไม่รองรับ ระบบจะเปลี่ยนชื่อไฟล์ใน Storage ให้อัตโนมัติ ลองกดอัปโหลดอีกครั้ง`;
  }

  if (/row-level security|permission|not authorized|unauthorized/i.test(message)) {
    return "สิทธิ์อัปโหลดไม่ผ่าน ตรวจ Storage policy ของ bucket share-files";
  }

  return message || "อัปโหลดไม่สำเร็จ";
}

function selectedFilesLabel(files, fallback) {
  const list = Array.from(files || []);
  if (!list.length) return fallback;
  if (list.length === 1) return list[0].name;
  return `${list.length} ไฟล์: ${list[0].name} +${list.length - 1}`;
}

function syncTitleInputFromFiles(files, inputSelector) {
  if (inputSelector !== "#assetFile" || !titleInput) return;

  const list = Array.from(files || []);
  titleInput.readOnly = false;
  titleInput.classList.remove("is-locked");
  titleInput.removeAttribute("title");

  if (!list.length) {
    titleInput.dataset.autoTitle = "false";
    titleInput.dataset.multiFileTitle = "false";
    return;
  }

  if (list.length > 1) {
    titleInput.value = `ใช้ชื่อไฟล์แต่ละไฟล์อัตโนมัติ (${list.length} ไฟล์)`;
    titleInput.dataset.autoTitle = "true";
    titleInput.dataset.multiFileTitle = "true";
    titleInput.readOnly = true;
    titleInput.classList.add("is-locked");
    titleInput.title = list.map((file) => titleFromFileName(file.name)).join("\n");
    return;
  }

  titleInput.dataset.multiFileTitle = "false";
  if (!titleInput.value.trim() || titleInput.dataset.autoTitle === "true") {
    titleInput.value = titleFromFileName(list[0].name);
    titleInput.dataset.autoTitle = "true";
  }
}

function isAudioFile(file) {
  const name = file?.name?.toLowerCase() || "";
  return file?.type?.startsWith("audio/") || AUDIO_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function syncUploadMode() {
  const musicMode = categoryInput?.value === "music";
  if (musicMode) {
    mainFileInput.accept = "audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.oga,.webm";
    mainFileInput.dataset.audioOnly = "true";
    mainFileType.textContent = "ไฟล์เพลงสำหรับแจก";
    fileHelp.textContent = "MP3, WAV, FLAC, M4A, AAC, OGG หรือ WEBM · เลือกได้หลายเพลง";
    defaultFileLabels["#fileName"] = "ลากเพลงมาวาง หรือคลิกเลือก";
  } else {
    mainFileInput.removeAttribute("accept");
    delete mainFileInput.dataset.audioOnly;
    mainFileType.textContent = "ไฟล์ดาวน์โหลด";
    fileHelp.textContent = "รองรับไฟล์ทั่วไปและเลือกได้หลายไฟล์";
    defaultFileLabels["#fileName"] = "ลากไฟล์มาวาง หรือคลิกเลือก";
  }

  const selectedFiles = Array.from(mainFileInput.files || []);
  if (musicMode && selectedFiles.some((file) => !isAudioFile(file))) {
    mainFileInput.value = "";
    document.querySelector("#fileName").textContent = defaultFileLabels["#fileName"];
    syncTitleInputFromFiles([], "#assetFile");
  } else if (!selectedFiles.length) {
    document.querySelector("#fileName").textContent = defaultFileLabels["#fileName"];
  }
}

function currentUser() {
  return session?.user || null;
}

function isAdminUser(user = currentUser()) {
  const email = (user?.email || "").toLowerCase();
  return ADMIN_EMAILS.includes(email);
}

function userName() {
  const user = currentUser();
  if (!user) return "";
  const metadata = user.user_metadata || {};
  return (
    metadata.display_name ||
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    metadata.preferred_username ||
    user.email?.split("@")[0] ||
    "Community"
  );
}

function renderAccount() {
  const user = currentUser();
  const locked = !configured || !user;

  void window.AudioVaultSecurity?.detectProtectedPageAccess?.(user, isAdminUser(user));

  logoutButton.hidden = !user;
  authOnlyLinks.forEach((link) => {
    link.hidden = !user;
  });
  adminOnlyLinks.forEach((link) => {
    link.hidden = !isAdminUser(user);
  });
  assetForm.classList.toggle("locked", locked);
  uploadButton.disabled = locked;

  if (!configured) {
    configStatus.textContent = "ยังไม่ได้ตั้งค่าระบบหลังบ้าน";
    if (uploadState) uploadState.textContent = "รอการตั้งค่า";
    return;
  }

  if (!user) {
    configStatus.textContent = "กรุณาล็อกอินก่อนอัปโหลด";
    if (uploadState) uploadState.textContent = "ต้องล็อกอินก่อน";
    return;
  }

  configStatus.textContent = "เชื่อมต่อระบบพร้อมใช้งาน";
  if (uploadState) uploadState.textContent = "พร้อมอัปโหลด";
}

async function initAuth() {
  if (!configured) {
    renderAccount();
    return;
  }

  const { data } = await db.auth.getSession();
  session = data.session;
  renderAccount();

  db.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    renderAccount();
  });
}

async function uploadFile(file, folder) {
  const user = currentUser();
  const ownerFolder = user?.id || "public";
  const path = `${ownerFolder}/${folder}/${Date.now()}-${storageFileName(file.name)}`;
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(uploadErrorMessage(error, file));

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

async function handleUpload(event) {
  event.preventDefault();

  if (!configured) {
    showToast("ตั้งค่าระบบหลังบ้า่นก่อนอัปโหลด");
    return;
  }

  if (!currentUser()) {
    showToast("กรุณาล็อกอินก่อนอัปโหลด");
    renderAccount();
    return;
  }

  const mainFiles = Array.from(document.querySelector("#assetFile")?.files || []);
  const coverFile = document.querySelector("#assetCover")?.files?.[0] || null;
  if (!mainFiles.length) return;
  const selectedCategory = inputValue("#assetCategory") || "sample";
  const invalidAudioFiles = selectedCategory === "music" ? mainFiles.filter((file) => !isAudioFile(file)) : [];
  if (invalidAudioFiles.length) {
    showToast(`เลือกได้เฉพาะไฟล์เพลงเท่านั้น: ${invalidAudioFiles[0].name}`);
    return;
  }

  uploadButton.disabled = true;

  try {
    let storedCover = null;
    if (coverFile) {
      setProgress(8, "กำลังอัปโหลด cover...");
      storedCover = await uploadFile(coverFile, "covers");
    }

    const manualTitle = titleInput?.readOnly ? "" : titleInput?.value?.trim() || "";
    const category = selectedCategory;
    const formatInput = inputValue("#assetFormat");
    const description = inputValue("#assetDescription");
    const creator = inputValue("#assetCreator") || userName();
    const tags = inputValue("#assetTags")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payloads = [];
    for (const [index, mainFile] of mainFiles.entries()) {
      const uploadPercent = 12 + Math.round((index / mainFiles.length) * 64);
      setProgress(uploadPercent, `กำลังอัปโหลดไฟล์ ${index + 1}/${mainFiles.length}...`);
      const storedMain = await uploadFile(mainFile, category === "music" ? "songs" : "downloads");
      const title = mainFiles.length === 1 && manualTitle ? manualTitle : titleFromFileName(mainFile.name);
      const format = formatInput || mainFile.type || mainFile.name.split(".").pop()?.toUpperCase() || "Download";

      payloads.push({
        id: makeId(),
        title,
        category,
        description,
        tags,
        format,
        creator,
        size: fileSizeLabel(mainFile.size),
        downloads: 0,
        cover_url: storedCover?.publicUrl || "",
        file_name: mainFile.name,
        file_path: storedMain.path,
        download_url: storedMain.publicUrl,
        audio_url: isAudioFile(mainFile) ? storedMain.publicUrl : "",
      });
    }

    setProgress(84, `กำลังบันทึกข้อมูล ${payloads.length} รายการ...`);
    const { error } = await db.from(TABLE_NAME).insert(payloads);
    if (error) throw error;

    setProgress(100, "อัปโหลดสำเร็จ");
    assetForm.reset();
    syncTitleInputFromFiles([], "#assetFile");
    fileInputs.forEach(([, labelSelector]) => {
      const label = document.querySelector(labelSelector);
      label.textContent = defaultFileLabels[labelSelector];
    });
    showToast(`อัปโหลดเสร็จสิ้น ${payloads.length} รายการ`);
    window.setTimeout(() => setProgress(0, "พร้อมอัปโหลด"), 1400);
  } catch (error) {
    setProgress(0, "อัปโหลดไม่สำเร็จ");
    showToast(error.message || "อัปโหลดไม่สำเร็จ");
  } finally {
    renderAccount();
  }
}

fileInputs.forEach(([inputSelector, labelSelector]) => {
  const input = document.querySelector(inputSelector);
  const label = document.querySelector(labelSelector);
  const dropZone = input.closest(".file-drop");
  let ignoreClickAfterDrop = false;

  function stopDropEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function setFiles(nextFiles) {
    const list = Array.from(nextFiles || []).filter(Boolean);
    if (!list.length) return;

    const acceptedFiles = input.accept === "image/*"
      ? list.filter((file) => file.type.startsWith("image/")).slice(0, 1)
      : input.dataset.audioOnly === "true"
        ? list.filter(isAudioFile)
        : list;

    if (input.accept === "image/*" && !acceptedFiles.length) {
      showToast("รูปปกรับเฉพาะไฟล์ภาพ");
      return;
    }

    if (input.dataset.audioOnly === "true" && !acceptedFiles.length) {
      showToast("เลือกได้เฉพาะไฟล์เพลง MP3, WAV, FLAC, M4A, AAC, OGG หรือ WEBM");
      return;
    }

    const files = new DataTransfer();
    acceptedFiles.forEach((file) => files.items.add(file));
    input.files = files.files;
    label.textContent = selectedFilesLabel(input.files, defaultFileLabels[labelSelector]);
    syncTitleInputFromFiles(input.files, inputSelector);
  }

  input.addEventListener("change", () => {
    label.textContent = selectedFilesLabel(input.files, defaultFileLabels[labelSelector]);
    syncTitleInputFromFiles(input.files, inputSelector);
  });

  dropZone.addEventListener(
    "click",
    (event) => {
      if (!ignoreClickAfterDrop) return;
      stopDropEvent(event);
      ignoreClickAfterDrop = false;
    },
    true
  );

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      stopDropEvent(event);
      dropZone.classList.add("drag-over");
    });
  });

  dropZone.addEventListener("dragleave", (event) => {
    stopDropEvent(event);
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", (event) => {
    stopDropEvent(event);
    ignoreClickAfterDrop = true;
    window.setTimeout(() => {
      ignoreClickAfterDrop = false;
    }, 350);
    dropZone.classList.remove("drag-over");
    setFiles(event.dataTransfer.files);
  });
});

["dragover", "drop"].forEach((eventName) => {
  window.addEventListener(
    eventName,
    (event) => {
      if (event.target.closest?.(".file-drop")) return;
      event.preventDefault();
    },
    true
  );
});

titleInput.addEventListener("input", () => {
  titleInput.dataset.autoTitle = "false";
});

categoryInput.addEventListener("change", syncUploadMode);

assetForm.addEventListener("submit", handleUpload);
logoutButton.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  window.location.assign("./index.html");
});

syncUploadMode();
initAuth();
