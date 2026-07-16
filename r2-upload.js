"use strict";

(function installR2Uploader() {
  function sessionTokenFromStorage() {
    const directKey = "sb-khvbvnpiifhbekqdtldm-auth-token";
    const keys = [directKey, ...Object.keys(localStorage).filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))];
    for (const key of [...new Set(keys)]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        const token = parsed?.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token;
        if (token) return token;
      } catch {}
    }
    return "";
  }

  async function r2UploadFile(file, folder) {
    const accessToken = sessionTokenFromStorage();
    if (!accessToken) throw new Error("กรุณาล็อกอินใหม่ก่อนอัปโหลด");
    const requestedFolder = folder === "covers" ? "covers" : file.type?.startsWith("audio/") ? "audio" : "files";
    const prepareResponse = await fetch("/api/r2-upload-url", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || "application/octet-stream",
        folder: requestedFolder,
      }),
    });
    const prepared = await prepareResponse.json().catch(() => ({}));
    if (!prepareResponse.ok) throw new Error(prepared.error || "เตรียมอัปโหลด R2 ไม่สำเร็จ (" + prepareResponse.status + ")");
    const uploadResponse = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploadResponse.ok) throw new Error("อัปโหลดเข้า R2 ไม่สำเร็จ (" + uploadResponse.status + ")");
    return {
      path: prepared.objectKey,
      public_id: prepared.objectKey,
      publicId: prepared.objectKey,
      filePath: prepared.objectKey,
      secure_url: prepared.publicUrl,
      secureUrl: prepared.publicUrl,
      url: prepared.publicUrl,
      publicUrl: prepared.publicUrl,
      resourceType: file.type?.startsWith("audio/") ? "video" : "raw",
    };
  }

  window.uploadFile = r2UploadFile;
})();