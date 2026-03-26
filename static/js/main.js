// FluxSave UI logic + downloader flow (polls /progress until download_url exists)

const els = {
  mediaInput: document.getElementById("mediaInput"),
  pasteBtn: document.getElementById("pasteBtn"),
  fetchBtn: document.getElementById("fetchBtn"),
  detectText: document.getElementById("detectText"),
  errorText: document.getElementById("errorText"),
  loader: document.getElementById("loader"),
  resultCard: document.getElementById("resultCard"),
  mediaMeta: document.getElementById("mediaMeta"),
  videoButtons: document.getElementById("videoButtons"),
  audioButtons: document.getElementById("audioButtons"),
  toast: document.getElementById("toast"),
};

// Monetag redirect (opened in a new tab). We start download immediately too.
const MONETAG_URL = "https://omg10.com/4/10753737";

let lastInfo = null;
let activeDownload = { downloadId: null, pollTimer: null };

function showToast(message, ms = 2200) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    els.toast.classList.add("hidden");
  }, ms);
}

function setError(message = "") {
  if (!els.errorText) return;
  els.errorText.textContent = message || "";
}

function setDetect(message = "") {
  if (!els.detectText) return;
  els.detectText.textContent = message || "";
}

function setLoading(isLoading) {
  if (!els.loader) return;
  els.loader.classList.toggle("hidden", !isLoading);
  if (els.fetchBtn) els.fetchBtn.disabled = isLoading;
  if (els.pasteBtn) els.pasteBtn.disabled = isLoading;
}

function showResults(show) {
  if (!els.resultCard) return;
  els.resultCard.classList.toggle("hidden", !show);
}

function normalizeUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  return v;
}

function detectPlatform(url) {
  const u = (url || "").toLowerCase();
  if (!u) return null;
  if (u.includes("tiktok.com") || u.includes("vm.tiktok.com")) return "TikTok";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("facebook.com") || u.includes("fb.watch") || u.includes("fb.me")) return "Facebook";
  if (u.includes("x.com") || u.includes("twitter.com")) return "X (Twitter)";
  if (u.includes("spotify.com")) return "Spotify";
  if (u.includes("audiomack.com")) return "Audiomack";
  if (u.includes("pinterest.") || u.includes("pin.it")) return "Pinterest";
  if (u.includes("snapchat.com")) return "Snapchat";
  if (u.includes("soundcloud.com")) return "SoundCloud";
  if (u.includes("vimeo.com")) return "Vimeo";
  return "Supported site";
}

function fmtDuration(d) {
  if (!d) return "Unknown";
  if (typeof d === "string") return d;
  if (typeof d === "number") return `${d}s`;
  return "Unknown";
}

function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return c;
    }
  });
}

function buildButton({ label, formatId, type }) {
  const btn = document.createElement("button");
  btn.type = "button";
  const initialVariant = String(label || "").toLowerCase().includes("best")
    ? "format-btn-primary"
    : "";
  btn.className = `format-btn${initialVariant ? ` ${initialVariant}` : ""}`;
  btn.textContent = label;
  btn.dataset.formatId = formatId || "";
  btn.dataset.type = type || "video";
  btn.dataset.initialVariant = initialVariant;
  btn.dataset.originalLabel = label;

  btn.addEventListener("click", async () => {
    // Prevent double-download on rapid taps
    if (btn.dataset.isStarting === "1") return;
    btn.dataset.isStarting = "1";

    // Monetag: open redirect and start download immediately (single click)
    try {
      window.open(MONETAG_URL, "_blank", "noopener,noreferrer");
    } catch {
      // Ignore popup blockers; download can still continue.
    }
    showToast("Starting download...");

    const initial = btn.dataset.initialVariant || "";
    if (initial) btn.classList.remove(initial);
    btn.classList.add("format-btn-ad");
    btn.textContent = "Starting download...";

    btn.disabled = true;
    try {
      const url = normalizeUrl(els.mediaInput?.value);
      if (!url) throw new Error("Please paste a link first.");
      await startDownloadAndWait({ url, formatId, type });
      btn.textContent = btn.dataset.originalLabel || label;
      const initial = btn.dataset.initialVariant || "";
      btn.classList.remove("format-btn-ad");
      if (initial) btn.classList.add(initial);
    } catch (e) {
      setError(e?.message || "Download failed.");
      btn.textContent = btn.dataset.originalLabel || label;
      const initial = btn.dataset.initialVariant || "";
      btn.classList.remove("format-btn-ad");
      if (initial) btn.classList.add(initial);
    } finally {
      btn.disabled = false;
      btn.dataset.isStarting = "0";
    }
  });

  return btn;
}

function renderMeta(info) {
  if (!els.mediaMeta) return;
  const title = escapeHtml(info?.title || "Unknown Title");
  const uploader = escapeHtml(info?.uploader || "Unknown");
  const duration = escapeHtml(info?.duration || "Unknown");
  const thumb = escapeHtml(info?.thumbnail || "");

  els.mediaMeta.innerHTML = `
    <div style="display:flex; gap:12px; align-items:flex-start;">
      ${thumb ? `<img src="${thumb}" alt="Thumbnail" style="width:84px;height:84px;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,0.08);" />` : ""}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; color:white; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
        <div style="color: var(--text-dim);">By: ${uploader}</div>
        <div style="color: var(--text-dim);">Duration: ${duration}</div>
      </div>
    </div>
  `;
}

function renderButtons(info) {
  if (!els.videoButtons || !els.audioButtons) return;
  els.videoButtons.innerHTML = "";
  els.audioButtons.innerHTML = "";

  const v = Array.isArray(info?.video_formats) ? info.video_formats : [];
  const a = Array.isArray(info?.audio_formats) ? info.audio_formats : [];

  // Always provide "Best" options (prominent)
  els.videoButtons.appendChild(
    buildButton({
      label: "Best Video",
      formatId: "bestvideo+bestaudio/best",
      type: "video",
    })
  );
  els.audioButtons.appendChild(
    buildButton({
      label: "Best Audio (MP3)",
      formatId: "bestaudio/best",
      type: "audio",
    })
  );

  // Add top formats from backend
  const addFormats = (arr, type, cap, mountEl) => {
    for (const f of arr.slice(0, cap)) {
      const q = f?.quality ? String(f.quality) : type === "audio" ? "Audio" : "Video";
      const ext = f?.ext ? String(f.ext) : "";
      const label = ext && ext !== "none" ? `${q} (${ext})` : q;
      const fid = f?.format_id ? String(f.format_id) : "";
      if (!fid) continue;
      mountEl.appendChild(buildButton({ label, formatId: fid, type }));
    }
  };

  addFormats(v, "video", 5, els.videoButtons);
  addFormats(a, "audio", 5, els.audioButtons);
}

async function fetchInfo(url) {
  setError("");
  showResults(false);
  setLoading(true);

  try {
    const r = await fetch("/fetch_info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success) {
      throw new Error(data?.error || "Could not fetch media info.");
    }
    lastInfo = data;
    renderMeta(data);
    renderButtons(data);
    showResults(true);
    showToast("Options ready. Tap a button to download.");
  } finally {
    setLoading(false);
  }
}

function stopPolling() {
  if (activeDownload.pollTimer) window.clearInterval(activeDownload.pollTimer);
  activeDownload.pollTimer = null;
  activeDownload.downloadId = null;
}

async function pollUntilComplete(downloadId, timeoutMs = 120000) {
  const started = Date.now();

  return await new Promise((resolve, reject) => {
    activeDownload.pollTimer = window.setInterval(async () => {
      try {
        if (Date.now() - started > timeoutMs) {
          stopPolling();
          reject(new Error("Timed out while downloading. Please try again."));
          return;
        }
        const r = await fetch(`/progress/${downloadId}`);
        const p = await r.json().catch(() => ({}));

        if (p?.status === "error") {
          stopPolling();
          reject(new Error(p?.message || "Download failed."));
          return;
        }

        if (p?.status === "complete" && p?.download_url) {
          stopPolling();
          resolve(p.download_url);
          return;
        }

        if (p?.status === "downloading" || p?.status === "processing" || p?.status === "queued" || p?.status === "starting") {
          const pct = typeof p.percentage === "number" ? p.percentage : 0;
          setDetect(`Downloading… ${pct}%`);
        }
      } catch {
        // keep polling
      }
    }, 700);
  });
}

async function startDownloadAndWait({ url, formatId, type }) {
  setError("");
  setDetect("Starting download…");
  stopPolling();

  // 1) Get download_id
  const startR = await fetch("/start_download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, format_id: formatId, type }),
  });
  const startData = await startR.json().catch(() => ({}));
  if (!startR.ok || !startData?.success || !startData?.download_id) {
    throw new Error(startData?.error || "Failed to start download.");
  }

  const downloadId = startData.download_id;
  activeDownload.downloadId = downloadId;

  // 2) Trigger background worker
  const dlR = await fetch("/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, format_id: formatId, type, download_id: downloadId }),
  });
  // backend returns 202; we don't rely on its JSON beyond "accepted"
  await dlR.json().catch(() => ({}));

  // 3) Wait for progress endpoint to expose download_url
  const downloadUrl = await pollUntilComplete(downloadId);
  setDetect("Download ready.");
  showToast("Download ready. Starting…");

  // Start download in browser
  window.location.href = downloadUrl;
}

function wireEvents() {
  if (els.mediaInput) {
    els.mediaInput.addEventListener("input", () => {
      const url = normalizeUrl(els.mediaInput.value);
      const p = detectPlatform(url);
      setDetect(url ? `Detected: ${p}` : "");
      setError("");
    });
  }

  if (els.pasteBtn) {
    els.pasteBtn.addEventListener("click", async () => {
      setError("");
      try {
        const text = await navigator.clipboard.readText();
        if (!text) {
          showToast("Clipboard is empty.");
          return;
        }
        els.mediaInput.value = text.trim();
        const p = detectPlatform(els.mediaInput.value);
        setDetect(`Detected: ${p}`);
        showToast("Pasted from clipboard.");
      } catch {
        showToast("Paste blocked by browser. Long-press and paste manually.");
      }
    });
  }

  if (els.fetchBtn) {
    els.fetchBtn.addEventListener("click", async () => {
      const url = normalizeUrl(els.mediaInput?.value);
      if (!url) {
        setError("Paste a media link first.");
        return;
      }
      const p = detectPlatform(url);
      setDetect(`Detected: ${p}`);
      try {
        await fetchInfo(url);
      } catch (e) {
        setError(e?.message || "Failed to fetch.");
      }
    });
  }
}

wireEvents();
