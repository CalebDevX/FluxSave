// FluxSave – main UI logic

const els = {
  mediaInput: document.getElementById("mediaInput"),
  pasteBtn: document.getElementById("pasteBtn"),
  fetchBtn: document.getElementById("fetchBtn"),
  detectText: document.getElementById("detectText"),
  errorText: document.getElementById("errorText"),
  loader: document.getElementById("loader"),
  loaderText: document.getElementById("loaderText"),
  resultCard: document.getElementById("resultCard"),
  mediaMeta: document.getElementById("mediaMeta"),
  videoButtons: document.getElementById("videoButtons"),
  audioButtons: document.getElementById("audioButtons"),
  toast: document.getElementById("toast"),
  // Spotify search on home page
  spotifySearchInput: document.getElementById("spotifySearchInput"),
  spotifySearchBtn: document.getElementById("spotifySearchBtn"),
  spotifySearchLoader: document.getElementById("spotifySearchLoader"),
  spotifySearchError: document.getElementById("spotifySearchError"),
  spotifyResultsList: document.getElementById("spotifyResultsList"),
};

const MONETAG_URL = "https://omg10.com/4/10753737";
let lastInfo = null;
let activeDownload = { downloadId: null, pollTimer: null };

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(message, ms = 2400) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => els.toast.classList.add("hidden"), ms);
}

// ─── Error / Detect helpers ───────────────────────────────────────────────────
function setError(message = "") {
  if (els.errorText) els.errorText.textContent = message;
}
function setDetect(message = "") {
  if (els.detectText) els.detectText.textContent = message;
}
function setLoading(isLoading, label = "Processing...") {
  if (els.loader) els.loader.classList.toggle("hidden", !isLoading);
  if (els.loaderText) els.loaderText.textContent = label;
  if (els.fetchBtn) els.fetchBtn.disabled = isLoading;
  if (els.pasteBtn) els.pasteBtn.disabled = isLoading;
}
function showResults(show) {
  if (els.resultCard) els.resultCard.classList.toggle("hidden", !show);
}

// ─── Platform detection ───────────────────────────────────────────────────────
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

function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c] || c)
  );
}

// ─── Quality helpers ──────────────────────────────────────────────────────────
const HD_QUALITIES = ["4k", "2160", "1440", "1080", "hd"];
const HIGH_AUDIO = ["320", "256", "flac", "wav"];

function isHighQuality(qualityStr, type) {
  const q = (qualityStr || "").toLowerCase();
  if (type === "video") return HD_QUALITIES.some((k) => q.includes(k));
  if (type === "audio") return HIGH_AUDIO.some((k) => q.includes(k));
  return false;
}

function qualityIcon(qualityStr, type) {
  const q = (qualityStr || "").toLowerCase();
  if (type === "video") {
    if (q.includes("4k") || q.includes("2160")) return "4K";
    if (q.includes("1440")) return "2K";
    if (q.includes("1080")) return "FHD";
    if (q.includes("720")) return "HD";
    if (q.includes("480")) return "SD";
  }
  if (type === "audio") {
    if (q.includes("320")) return "HQ";
    if (q.includes("256")) return "HQ";
  }
  return null;
}

// ─── Button builder ───────────────────────────────────────────────────────────
function buildButton({ label, formatId, type, isBest }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "format-btn" + (isBest ? " format-btn-primary" : "");
  btn.dataset.formatId = formatId || "";
  btn.dataset.type = type || "video";
  btn.dataset.initialVariant = isBest ? "format-btn-primary" : "";
  btn.dataset.originalLabel = label;

  // Parse label into quality + ext parts
  // Label format: "Best Video", "1080p (mp4)", "320kbps (mp3)", etc.
  const match = label.match(/^(.+?)\s*\(([^)]+)\)$/);
  let qualityText = label;
  let extText = "";
  if (match) {
    qualityText = match[1].trim();
    extText = match[2].trim().toUpperCase();
  }

  const hdIcon = qualityIcon(qualityText, type);
  const isHQ = isHighQuality(qualityText, type);

  btn.innerHTML = `
    ${(hdIcon || isHQ) ? `<span class="btn-hd-badge">${hdIcon || "HQ"}</span>` : ""}
    <span class="btn-quality-label">${escapeHtml(qualityText)}</span>
    ${extText ? `<span class="btn-ext-badge">${escapeHtml(extText)}</span>` : ""}
  `;

  btn.addEventListener("click", async () => {
    if (btn.dataset.isStarting === "1") return;
    btn.dataset.isStarting = "1";

    try { window.open(MONETAG_URL, "_blank", "noopener,noreferrer"); } catch {}
    showToast("Starting download…");

    const initialVariant = btn.dataset.initialVariant || "";
    if (initialVariant) btn.classList.remove(initialVariant);
    btn.classList.add("format-btn-ad");
    btn.innerHTML = `<span class="btn-quality-label">Downloading…</span><span class="btn-ext-badge">Please wait</span>`;
    btn.disabled = true;

    try {
      const url = (els.mediaInput?.value || "").trim();
      if (!url) throw new Error("Please paste a link first.");
      await startDownloadAndWait({ url, formatId, type });
      restoreBtn(btn);
    } catch (e) {
      setError(e?.message || "Download failed.");
      restoreBtn(btn);
    } finally {
      btn.disabled = false;
      btn.dataset.isStarting = "0";
    }
  });

  return btn;
}

function restoreBtn(btn) {
  const label = btn.dataset.originalLabel || "";
  const initialVariant = btn.dataset.initialVariant || "";
  btn.classList.remove("format-btn-ad");
  if (initialVariant) btn.classList.add(initialVariant);

  const match = label.match(/^(.+?)\s*\(([^)]+)\)$/);
  let qualityText = label;
  let extText = "";
  if (match) { qualityText = match[1].trim(); extText = match[2].trim().toUpperCase(); }
  const type = btn.dataset.type;
  const hdIcon = qualityIcon(qualityText, type);
  const isHQ = isHighQuality(qualityText, type);

  btn.innerHTML = `
    ${(hdIcon || isHQ) ? `<span class="btn-hd-badge">${hdIcon || "HQ"}</span>` : ""}
    <span class="btn-quality-label">${escapeHtml(qualityText)}</span>
    ${extText ? `<span class="btn-ext-badge">${escapeHtml(extText)}</span>` : ""}
  `;
}

// ─── Render meta info ─────────────────────────────────────────────────────────
function renderMeta(info) {
  if (!els.mediaMeta) return;
  const title = escapeHtml(info?.title || "Unknown Title");
  const uploader = escapeHtml(info?.uploader || "");
  const duration = escapeHtml(info?.duration || "");
  const thumb = escapeHtml(info?.thumbnail || "");

  els.mediaMeta.innerHTML = `
    <div class="media-meta-block">
      ${thumb ? `<img class="meta-thumb" src="${thumb}" alt="Thumbnail" />` : ""}
      <div class="meta-details">
        <div class="meta-title">${title}</div>
        ${uploader ? `<div class="meta-sub">By: ${uploader}</div>` : ""}
        ${duration ? `<div class="meta-sub">Duration: ${duration}</div>` : ""}
      </div>
    </div>
  `;
}

// ─── Render download buttons ──────────────────────────────────────────────────
function renderButtons(info) {
  if (!els.videoButtons || !els.audioButtons) return;
  els.videoButtons.innerHTML = "";
  els.audioButtons.innerHTML = "";

  const v = Array.isArray(info?.video_formats) ? info.video_formats : [];
  const a = Array.isArray(info?.audio_formats) ? info.audio_formats : [];

  // Best Video — prominent
  els.videoButtons.appendChild(buildButton({
    label: "Best Quality",
    formatId: "bestvideo+bestaudio/best",
    type: "video",
    isBest: true,
  }));

  // Best Audio options
  els.audioButtons.appendChild(buildButton({
    label: "Best MP3",
    formatId: "bestaudio/best",
    type: "audio",
    isBest: true,
  }));

  // Additional explicit audio quality presets
  const audioPresets = [
    { label: "MP3 (320kbps)", formatId: "bestaudio[ext=mp3]/bestaudio/best", type: "audio" },
    { label: "MP3 (128kbps)", formatId: "worstaudio[ext=mp3]/worstaudio/worst", type: "audio" },
    { label: "M4A (AAC)", formatId: "bestaudio[ext=m4a]/bestaudio/best", type: "audio" },
    { label: "OGG (Vorbis)", formatId: "bestaudio[ext=ogg]/bestaudio/best", type: "audio" },
    { label: "WAV (Lossless)", formatId: "bestaudio[ext=wav]/bestaudio/best", type: "audio" },
  ];

  for (const preset of audioPresets) {
    els.audioButtons.appendChild(buildButton(preset));
  }

  // Video quality presets
  const videoPresets = [
    { label: "4K (2160p)", formatId: "bestvideo[height<=2160]+bestaudio/best[height<=2160]", type: "video" },
    { label: "1080p (HD)", formatId: "bestvideo[height<=1080]+bestaudio/best[height<=1080]", type: "video" },
    { label: "720p (HD)", formatId: "bestvideo[height<=720]+bestaudio/best[height<=720]", type: "video" },
    { label: "480p (SD)", formatId: "bestvideo[height<=480]+bestaudio/best[height<=480]", type: "video" },
    { label: "360p", formatId: "bestvideo[height<=360]+bestaudio/best[height<=360]", type: "video" },
    { label: "240p", formatId: "bestvideo[height<=240]+bestaudio/best[height<=240]", type: "video" },
  ];

  for (const preset of videoPresets) {
    els.videoButtons.appendChild(buildButton(preset));
  }

  // Append any extra formats from the backend (up to 4 extra per type)
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

  addFormats(v, "video", 4, els.videoButtons);
  addFormats(a, "audio", 3, els.audioButtons);
}

// ─── Fetch info ───────────────────────────────────────────────────────────────
async function fetchInfo(url) {
  setError("");
  showResults(false);
  setLoading(true, "Fetching media info…");
  try {
    const r = await fetch("/fetch_info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success) throw new Error(data?.error || "Could not fetch media info.");
    lastInfo = data;
    renderMeta(data);
    renderButtons(data);
    showResults(true);
    showToast("Choose a format below to download.");
    // Scroll into view
    els.resultCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    setLoading(false);
  }
}

// ─── Download polling ─────────────────────────────────────────────────────────
function stopPolling() {
  if (activeDownload.pollTimer) window.clearInterval(activeDownload.pollTimer);
  activeDownload.pollTimer = null;
  activeDownload.downloadId = null;
}

async function pollUntilComplete(downloadId, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    activeDownload.pollTimer = window.setInterval(async () => {
      try {
        if (Date.now() - started > timeoutMs) {
          stopPolling();
          reject(new Error("Download timed out. Please try again."));
          return;
        }
        const r = await fetch(`/progress/${downloadId}`);
        const p = await r.json().catch(() => ({}));
        if (p?.status === "error") { stopPolling(); reject(new Error(p?.message || "Download failed.")); return; }
        if (p?.status === "complete" && p?.download_url) { stopPolling(); resolve(p.download_url); return; }
        if (["downloading","processing","queued","starting"].includes(p?.status)) {
          const pct = typeof p.percentage === "number" ? Math.round(p.percentage) : 0;
          setDetect(`Downloading… ${pct}%`);
          if (els.loaderText) els.loaderText.textContent = `Downloading… ${pct}%`;
        }
      } catch {}
    }, 700);
  });
}

async function startDownloadAndWait({ url, formatId, type }) {
  setError("");
  setDetect("Preparing download…");
  stopPolling();

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

  const dlR = await fetch("/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, format_id: formatId, type, download_id: downloadId }),
  });
  await dlR.json().catch(() => ({}));

  const downloadUrl = await pollUntilComplete(downloadId);
  setDetect("Download ready!");
  showToast("Download starting…");
  window.location.href = downloadUrl;
}

// ─── Spotify search on home page ──────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function createSpotifyTrackItem(track) {
  const item = document.createElement("div");
  item.className = "spotify-track-item";

  const thumb = track.thumbnail || "";
  const artists = Array.isArray(track.artists) ? track.artists.join(", ") : (track.artists || "Unknown Artist");
  const dur = formatDuration(track.duration);

  item.innerHTML = `
    ${thumb ? `<img class="spotify-track-thumb" src="${escapeHtml(thumb)}" alt="Album art" onerror="this.style.display='none'" />` : ""}
    <div class="spotify-track-info">
      <div class="spotify-track-title">${escapeHtml(track.title || "Unknown")}</div>
      <div class="spotify-track-artist">${escapeHtml(artists)}</div>
    </div>
    ${dur ? `<div class="spotify-track-duration">${escapeHtml(dur)}</div>` : ""}
    <button class="spotify-dl-btn" data-url="${escapeHtml(track.spotify_url || "")}">⬇ Download</button>
  `;

  const dlBtn = item.querySelector(".spotify-dl-btn");
  dlBtn.addEventListener("click", async () => {
    const url = dlBtn.dataset.url;
    if (!url) return;
    dlBtn.disabled = true;
    dlBtn.textContent = "Loading…";
    // Put the URL into the main input and fetch
    if (els.mediaInput) els.mediaInput.value = url;
    setDetect("Detected: Spotify");
    try {
      await fetchInfo(url);
      showToast("Scroll up to choose your download format.");
    } catch (e) {
      setError(e?.message || "Failed to fetch track info.");
    }
    dlBtn.disabled = false;
    dlBtn.textContent = "⬇ Download";
  });

  return item;
}

async function performSpotifySearch() {
  const query = (els.spotifySearchInput?.value || "").trim();
  if (!query) {
    if (els.spotifySearchError) els.spotifySearchError.textContent = "Enter a song name or artist to search.";
    return;
  }
  if (els.spotifySearchError) els.spotifySearchError.textContent = "";
  if (els.spotifySearchLoader) els.spotifySearchLoader.classList.remove("hidden");
  if (els.spotifyResultsList) { els.spotifyResultsList.innerHTML = ""; els.spotifyResultsList.classList.remove("hidden"); }
  if (els.spotifySearchBtn) els.spotifySearchBtn.disabled = true;

  try {
    const r = await fetch("/spotify-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) throw new Error(data.error || "Search failed.");
    const results = data.results || [];
    if (!results.length) {
      if (els.spotifyResultsList) els.spotifyResultsList.innerHTML = `<p class="tiny" style="text-align:center;padding:12px 0;">No results found. Try a different search.</p>`;
    } else {
      results.forEach((track) => {
        els.spotifyResultsList?.appendChild(createSpotifyTrackItem(track));
      });
    }
  } catch (e) {
    if (els.spotifySearchError) els.spotifySearchError.textContent = e.message || "Search failed.";
    if (els.spotifyResultsList) els.spotifyResultsList.classList.add("hidden");
  } finally {
    if (els.spotifySearchLoader) els.spotifySearchLoader.classList.add("hidden");
    if (els.spotifySearchBtn) els.spotifySearchBtn.disabled = false;
  }
}

// ─── Wire events ──────────────────────────────────────────────────────────────
function wireEvents() {
  els.mediaInput?.addEventListener("input", () => {
    const url = (els.mediaInput.value || "").trim();
    const p = detectPlatform(url);
    setDetect(url ? `Detected: ${p}` : "");
    setError("");
  });

  els.pasteBtn?.addEventListener("click", async () => {
    setError("");
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { showToast("Clipboard is empty."); return; }
      els.mediaInput.value = text.trim();
      setDetect(`Detected: ${detectPlatform(els.mediaInput.value)}`);
      showToast("Pasted from clipboard.");
    } catch {
      showToast("Paste blocked by browser. Long-press and paste manually.");
    }
  });

  els.fetchBtn?.addEventListener("click", async () => {
    const url = (els.mediaInput?.value || "").trim();
    if (!url) { setError("Paste a media link first."); return; }
    setDetect(`Detected: ${detectPlatform(url)}`);
    try { await fetchInfo(url); } catch (e) { setError(e?.message || "Failed to fetch."); }
  });

  // Spotify search
  els.spotifySearchBtn?.addEventListener("click", performSpotifySearch);
  els.spotifySearchInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") performSpotifySearch();
  });
}

wireEvents();
