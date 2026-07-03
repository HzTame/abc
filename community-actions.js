(function () {
  const PROJECT_REF = "khvbvnpiifhbekqdtldm";
  const LIKE_STORAGE_KEY = "audioVaultCommunityPostLikes";
  const LIKE_COUNT_STORAGE_KEY = "audioVaultCommunityPostLikeCounts";
  const TARGET_HASH_PREFIX = "post-";

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

  function likedPosts() {
    return new Set(readJson(LIKE_STORAGE_KEY, []));
  }

  function likeCounts() {
    return readJson(LIKE_COUNT_STORAGE_KEY, {});
  }

  function sessionToken() {
    const directKey = `sb-${PROJECT_REF}-auth-token`;
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

  function isSignedIn() {
    return Boolean(sessionToken());
  }

  function openLoginPrompt() {
    if (typeof window.openAuth === "function") {
      window.openAuth("signin");
      return;
    }

    const loginButton = document.querySelector("#communityLoginButton, #loginButton");
    if (loginButton) loginButton.click();
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

  function postIdFrom(article) {
    const node = article.querySelector(
      "[data-reply-toggle], [data-edit-post], [data-delete-own-post], [data-reply-form], [data-edit-post-form]"
    );
    if (!node) return "";
    return (
      node.dataset.replyToggle ||
      node.dataset.editPost ||
      node.dataset.deleteOwnPost ||
      node.dataset.replyForm ||
      node.dataset.editPostForm ||
      ""
    );
  }

  function anchorFor(postId) {
    return TARGET_HASH_PREFIX + String(postId).replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  function shareUrlFor(article, postId) {
    const url = new URL(window.location.href);
    url.hash = article.id || anchorFor(postId);
    return url.toString();
  }

  function updateLikeButton(button, postId) {
    const likes = likedPosts();
    const counts = likeCounts();
    const signedIn = isSignedIn();
    const isLiked = signedIn && likes.has(postId);
    const count = Math.max(0, Number(counts[postId] || 0));
    const icon = button.querySelector(".post-like-icon");
    const label = button.querySelector(".post-like-label");
    const countNode = button.querySelector(".post-like-count");

    button.classList.toggle("is-liked", isLiked);
    button.classList.toggle("is-locked", !signedIn);
    button.setAttribute("aria-pressed", String(isLiked));
    button.setAttribute("aria-disabled", String(!signedIn));
    button.title = signedIn ? (isLiked ? "เลิกถูกใจโพสต์นี้" : "กดใจโพสต์นี้") : "สมัครหรือเข้าสู่ระบบก่อนกดถูกใจโพสต์";
    if (icon) icon.textContent = isLiked ? "♥" : "♡";
    if (label) label.textContent = isLiked ? "ชอบแล้ว" : "ถูกใจ";
    if (countNode) countNode.textContent = count.toLocaleString("th-TH");
  }

  function ensureActions(article) {
    const postId = postIdFrom(article);
    const actions = article.querySelector(".post-actions");
    if (!postId || !actions) return;

    article.id = article.id || anchorFor(postId);
    article.dataset.communityPostId = postId;

    let group = article.querySelector(".post-social-actions");
    if (!group) {
      group = document.createElement("div");
      group.className = "post-social-actions";
      group.setAttribute("aria-label", "ปุ่มตอบสนองโพสต์");

      const likeButton = document.createElement("button");
      likeButton.className = "post-like-button";
      likeButton.type = "button";
      likeButton.dataset.communityLike = postId;
      likeButton.setAttribute("aria-pressed", "false");

      const likeIcon = document.createElement("span");
      likeIcon.className = "post-like-icon";
      likeIcon.setAttribute("aria-hidden", "true");
      likeIcon.textContent = "♡";

      const likeLabel = document.createElement("span");
      likeLabel.className = "post-like-label";
      likeLabel.textContent = "ถูกใจ";

      const likeCount = document.createElement("strong");
      likeCount.className = "post-like-count";
      likeCount.textContent = "0";

      const shareButton = document.createElement("button");
      shareButton.className = "post-share-button";
      shareButton.type = "button";
      shareButton.dataset.communityShare = postId;
      shareButton.textContent = "แชร์";

      likeButton.append(likeIcon, likeLabel, likeCount);
      group.append(likeButton, shareButton);

      const ownerActions = actions.querySelector(".post-owner-actions");
      actions.insertBefore(group, ownerActions || null);
    }

    const likeButton = group.querySelector("[data-community-like]");
    if (likeButton) updateLikeButton(likeButton, postId);
  }

  function syncPosts() {
    document.querySelectorAll("#communityPosts .community-post").forEach(ensureActions);
    focusSharedPost();
  }

  function toggleLike(postId) {
    if (!isSignedIn()) {
      notify("สมัครหรือเข้าสู่ระบบก่อนกดถูกใจโพสต์");
      openLoginPrompt();
      syncPosts();
      return;
    }

    const likes = likedPosts();
    const counts = likeCounts();
    const currentCount = Math.max(0, Number(counts[postId] || 0));

    if (likes.has(postId)) {
      likes.delete(postId);
      counts[postId] = Math.max(0, currentCount - 1);
      notify("ยกเลิกถูกใจแล้ว");
    } else {
      likes.add(postId);
      counts[postId] = currentCount + 1;
      notify("กดใจโพสต์นี้แล้ว");
    }

    writeJson(LIKE_STORAGE_KEY, Array.from(likes));
    writeJson(LIKE_COUNT_STORAGE_KEY, counts);
    syncPosts();
  }

  async function sharePost(postId, article) {
    const url = shareUrlFor(article, postId);
    const message = article.querySelector(".post-message")?.textContent.trim() || "โพสต์จาก The Audio Vault";
    const data = {
      title: "โพสต์จาก The Audio Vault",
      text: message.slice(0, 120),
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        notify("คัดลอกลิงก์โพสต์แล้ว");
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }

    window.prompt("คัดลอกลิงก์โพสต์", url);
  }

  function focusSharedPost() {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith(TARGET_HASH_PREFIX)) return;

    const target = document.getElementById(hash);
    if (!target || target.dataset.sharedFocused === "true") return;

    target.dataset.sharedFocused = "true";
    target.classList.add("is-shared-target");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target.classList.remove("is-shared-target"), 2600);
  }

  function injectStyles() {
    if (document.querySelector("#communityActionsStyles")) return;

    const style = document.createElement("style");
    style.id = "communityActionsStyles";
    style.textContent = `
      .post-social-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        flex-wrap: wrap;
      }

      .post-like-button,
      .post-share-button {
        min-height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid rgba(78, 90, 135, .12);
        border-radius: 999px;
        background: #f6f7fb;
        color: #5b647b;
        padding: 6px 12px;
        font-size: .82rem;
        font-weight: 800;
        line-height: 1;
        transition: transform 150ms, background 150ms, border-color 150ms, color 150ms;
      }

      .post-like-button:hover,
      .post-share-button:hover {
        transform: translateY(-1px);
        border-color: rgba(100, 117, 255, .22);
        background: #eef0ff;
        color: #5360b5;
      }

      .post-like-button.is-liked {
        border-color: rgba(201, 79, 89, .2);
        background: #fff0f2;
        color: #b34d57;
      }

      .post-like-button.is-locked {
        border-color: rgba(78, 90, 135, .1);
        background: #f8f8fb;
        color: #9aa1b1;
      }

      .post-like-button.is-locked:hover {
        border-color: rgba(255, 98, 54, .18);
        background: #fff7f4;
        color: #b7644d;
      }

      .post-like-icon {
        min-width: 1em;
        color: currentColor;
        font-size: 1rem;
        line-height: 1;
      }

      .post-like-count {
        min-width: 1.4em;
        border-radius: 999px;
        background: rgba(255, 255, 255, .7);
        color: currentColor;
        padding: 2px 6px;
        font-size: .76rem;
        text-align: center;
      }

      .community-post.is-shared-target {
        border-color: rgba(255, 98, 54, .55);
        box-shadow: 0 18px 50px rgba(255, 98, 54, .16);
      }

      @media (max-width: 520px) {
        .post-social-actions {
          width: 100%;
          margin-left: 0;
        }

        .post-social-actions > * {
          flex: 1 1 130px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function start() {
    const postsNode = document.querySelector("#communityPosts");
    if (!postsNode) return;

    injectStyles();
    syncPosts();

    const observer = new MutationObserver(syncPosts);
    observer.observe(postsNode, { childList: true });

    postsNode.addEventListener("click", (event) => {
      const likeButton = event.target.closest("[data-community-like]");
      const shareButton = event.target.closest("[data-community-share]");

      if (likeButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleLike(likeButton.dataset.communityLike);
        return;
      }

      if (shareButton) {
        event.preventDefault();
        event.stopPropagation();
        const article = shareButton.closest(".community-post");
        if (article) void sharePost(shareButton.dataset.communityShare, article);
      }
    });

    window.addEventListener("hashchange", focusSharedPost);
    window.addEventListener("storage", syncPosts);
    window.addEventListener("focus", syncPosts);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
