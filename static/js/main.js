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
  videoGroup: document.getElementById("videoGroup"),
  audioGroup: document.getElementById("audioGroup"),
  toast: document.getElementById("toast"),
  // Music card (Spotify / Audiomack)
  musicCard: document.getElementById("musicCard"),
  musicMeta: document.getElementById("musicMeta"),
  musicDownloadBtn: document.getElementById("musicDownloadBtn"),
  musicStatus: document.getElementById("musicStatus"),
  // Spotify search on home page
  spotifySearchInput: document.getElementById("spotifySearchInput"),
  spotifySearchBtn: document.getElementById("spotifySearchBtn"),
  spotifySearchLoader: document.getElementById("spotifySearchLoader"),
  spotifySearchError: document.getElementById("spotifySearchError"),
  spotifyResultsList: document.getElementById("spotifyResultsList"),
};

let lastInfo = null;
let lastMediaUrl = null;
let activeDownload = { downloadId: null, pollTimer: null };

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(message, ms = 3000) {
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
function setLoading(isLoading, label = "Working on it…") {
  if (els.loader) els.loader.classList.toggle("hidden", !isLoading);
  if (els.loaderText) els.loaderText.textContent = label;
  if (els.fetchBtn) els.fetchBtn.disabled = isLoading;
  if (els.pasteBtn) els.pasteBtn.disabled = isLoading;
}
function showResults(show) {
  if (els.resultCard) els.resultCard.classList.toggle("hidden", !show);
}
function showMusicCard(show) {
  if (els.musicCard) els.musicCard.classList.toggle("hidden", !show);
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

    showToast("Getting your file ready, please wait…");

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
      setError(e?.message || "Something went wrong. Please try again.");
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
  const rawDur = info?.duration;
  const duration = (rawDur && rawDur !== "Unknown") ? escapeHtml(String(rawDur)) : "";
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

// ─── Render music card (Spotify / Audiomack) ──────────────────────────────────
function renderMusicCard(info, url) {
  if (!els.musicMeta) return;
  const title = escapeHtml(info?.title || "Unknown Track");
  const uploader = escapeHtml(info?.uploader || "");
  const rawDur = info?.duration;
  const duration = (rawDur && rawDur !== "Unknown") ? escapeHtml(String(rawDur)) : "";
  const thumb = escapeHtml(info?.thumbnail || "");

  els.musicMeta.innerHTML = `
    <div class="media-meta-block">
      ${thumb ? `<img class="meta-thumb" src="${thumb}" alt="Album art" />` : ""}
      <div class="meta-details">
        <div class="meta-title">${title}</div>
        ${uploader ? `<div class="meta-sub">Artist: ${uploader}</div>` : ""}
        ${duration ? `<div class="meta-sub">Duration: ${duration}</div>` : ""}
      </div>
    </div>
  `;

  if (els.musicDownloadBtn) {
    els.musicDownloadBtn._musicUrl = url;
  }
}

// ─── Music download handler ───────────────────────────────────────────────────
async function triggerMusicDownload(url, btn, statusEl) {
  if (!url) { showToast("No track loaded. Paste a link and tap Fetch first."); return; }

  btn.disabled = true;
  btn.textContent = "Fetching your track…";
  if (statusEl) statusEl.textContent = "Getting download link, please wait…";

  try {
    const r = await fetch("/get_direct_url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, type: "audio" }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success || !data?.url) {
      throw new Error(data?.error || "Could not get the download link. Please try again.");
    }

    const filename = data.filename || "audio.mp3";
    if (statusEl) statusEl.textContent = "Starting your download…";
    showToast("Your download has started! Check your downloads folder.", 4000);

    const proxyUrl = `/download-proxy?url=${encodeURIComponent(data.url)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = proxyUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (statusEl) statusEl.textContent = "Download started! Check your downloads folder.";
  } catch (e) {
    showToast(e.message || "Download failed. Please try again.", 4000);
    if (statusEl) statusEl.textContent = "Download failed. Please try again.";
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "⬇ Download MP3";
      if (statusEl) statusEl.textContent = "";
    }, 6000);
  }
}

// ─── Render download buttons ──────────────────────────────────────────────────
function renderButtons(info) {
  if (!els.videoButtons || !els.audioButtons) return;
  els.videoButtons.innerHTML = "";
  els.audioButtons.innerHTML = "";
  if (els.videoGroup) els.videoGroup.style.display = "";

  const v = Array.isArray(info?.video_formats) ? info.video_formats : [];
  const a = Array.isArray(info?.audio_formats) ? info.audio_formats : [];

  // Best Video — muxed MP4 only (no server-side merging required).
  // YouTube caps muxed streams at 720p; 1080p/4K are adaptive-only and
  // cannot be delivered as a single CDN redirect URL.
  els.videoButtons.appendChild(buildButton({
    label: "Best MP4",
    formatId: "best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]/18",
    type: "video",
    isBest: true,
  }));

  els.audioButtons.appendChild(buildButton({
    label: "Best MP3",
    formatId: "bestaudio/best",
    type: "audio",
    isBest: true,
  }));

  const audioPresets = [
    { label: "MP3", formatId: "bestaudio[ext=mp3]/bestaudio/best", type: "audio" },
    { label: "M4A (AAC)", formatId: "bestaudio[ext=m4a]/bestaudio/best", type: "audio" },
    { label: "OGG (Vorbis)", formatId: "bestaudio[ext=ogg]/bestaudio/best", type: "audio" },
    { label: "WebM Audio", formatId: "bestaudio[ext=webm]/bestaudio/best", type: "audio" },
  ];
  for (const preset of audioPresets) els.audioButtons.appendChild(buildButton(preset));

  // Muxed-only video presets — single stream, no merging, direct browser download.
  // 1080p and 4K are NOT listed because YouTube only offers those as separate
  // video+audio adaptive streams which cannot be joined without server processing.
  const videoPresets = [
    { label: "720p (HD)", formatId: "best[height<=720][ext=mp4][vcodec!=none][acodec!=none]/best[height<=720][vcodec!=none][acodec!=none]/18", type: "video" },
    { label: "480p (SD)", formatId: "best[height<=480][ext=mp4][vcodec!=none][acodec!=none]/best[height<=480][vcodec!=none][acodec!=none]/18", type: "video" },
    { label: "360p", formatId: "18/best[height<=360][ext=mp4][vcodec!=none][acodec!=none]", type: "video" },
    { label: "240p", formatId: "best[height<=240][ext=mp4][vcodec!=none][acodec!=none]/best[height<=240][vcodec!=none][acodec!=none]", type: "video" },
  ];
  for (const preset of videoPresets) els.videoButtons.appendChild(buildButton(preset));

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
  const urlLower = (url || "").toLowerCase();
  const isSpotify = urlLower.includes("spotify.com");
  const isAudiomack = urlLower.includes("audiomack.com");
  const isMusicPlatform = isSpotify || isAudiomack;

  setError("");
  showResults(false);
  showMusicCard(false);
  setLoading(true, isMusicPlatform ? "Looking up your track…" : "Fetching media info…");

  try {
    const r = await fetch("/fetch_info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success) throw new Error(data?.error || "Could not fetch media info. Please check the link and try again.");

    lastInfo = data;
    lastMediaUrl = url;

    if (isMusicPlatform) {
      renderMusicCard(data, url);
      showMusicCard(true);
      showToast("Track found! Tap the button below to download it to your device.", 4000);
      els.musicCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      renderMeta(data);
      renderButtons(data);
      showResults(true);
      showToast("Ready! Pick a quality below to start your download.");
      els.resultCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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

async function startDownloadAndWait({ url, formatId, type }) {
  setError("");
  setDetect("Getting your download link…");
  stopPolling();

  if (els.loaderText) els.loaderText.textContent = "Getting your download link…";
  setLoading(true, "Getting your download link…");

  try {
    const r = await fetch("/get_direct_url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, format_id: formatId, type }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success || !data?.url) {
      throw new Error(data?.error || "Could not get the download link. Please try again.");
    }

    setDetect("Opening your download…");
    showToast("Your download is opening — check your downloads folder!", 4000);
    window.open(data.url, "_blank", "noopener,noreferrer");
  } finally {
    setLoading(false);
    setDetect("");
  }
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
    <button class="spotify-dl-btn">⬇ Download MP3</button>
  `;

  const dlBtn = item.querySelector(".spotify-dl-btn");
  dlBtn.addEventListener("click", async () => {
    if (dlBtn.dataset.busy === "1") return;
    dlBtn.dataset.busy = "1";
    dlBtn.disabled = true;
    dlBtn.textContent = "Getting your track…";

    try {
      const spotifyUrl = track.spotify_url || track.spotifyUrl || "";
      let directUrl = "";
      let filename = "audio.mp3";

      if (spotifyUrl && spotifyUrl.includes("spotify.com")) {
        const r = await fetch("/get_direct_url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: spotifyUrl, type: "audio" }),
        });
        const d = await r.json().catch(() => ({}));
        if (d?.success && d?.url) { directUrl = d.url; filename = d.filename || filename; }
      }

      if (!directUrl) {
        const artistStr = Array.isArray(track.artists) ? track.artists.join(", ") : (track.artists || "");
        const query = [track.title, artistStr].filter(Boolean).join(" ");
        if (!query) { showToast("Track info is missing. Please try another song.", 3000); return; }
        const safeName = ([track.title, artistStr].filter(Boolean).join(" - "))
          .replace(/[\\/:*?"<>|]/g, "_").substring(0, 150) || "audio";
        directUrl = `/stream-spotify/${encodeURIComponent(safeName)}.mp3?q=${encodeURIComponent(query)}`;
        filename = `${safeName}.mp3`;
      }

      showToast("Your download has started! Check your downloads folder.", 4000);

      const isProxy = directUrl.startsWith("/stream-spotify") ? false : true;
      if (isProxy) {
        const proxyUrl = `/download-proxy?url=${encodeURIComponent(directUrl)}&filename=${encodeURIComponent(filename)}`;
        const a = document.createElement("a");
        a.href = proxyUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const a = document.createElement("a");
        a.href = directUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      showToast("Download failed. Please try again.", 3000);
    } finally {
      setTimeout(() => {
        dlBtn.disabled = false;
        dlBtn.dataset.busy = "0";
        dlBtn.textContent = "⬇ Download MP3";
      }, 5000);
    }
  });

  return item;
}

async function performSpotifySearch() {
  const query = (els.spotifySearchInput?.value || "").trim();
  if (!query) {
    if (els.spotifySearchError) els.spotifySearchError.textContent = "Type a song name or artist name to search.";
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
    if (!r.ok || !data.success) throw new Error(data.error || "Search failed. Please try again.");
    const results = data.results || [];
    if (!results.length) {
      if (els.spotifyResultsList) els.spotifyResultsList.innerHTML = `<p class="tiny" style="text-align:center;padding:12px 0;">Nothing came up — try a different song or artist name.</p>`;
    } else {
      results.forEach((track) => {
        els.spotifyResultsList?.appendChild(createSpotifyTrackItem(track));
      });
    }
  } catch (e) {
    if (els.spotifySearchError) els.spotifySearchError.textContent = e.message || "Search failed. Please try again.";
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
      if (!text) { showToast("Your clipboard is empty — copy a link first!"); return; }
      els.mediaInput.value = text.trim();
      setDetect(`Detected: ${detectPlatform(els.mediaInput.value)}`);
      showToast("Link pasted! Tap Fetch Media to continue.");
    } catch {
      showToast("Browser blocked clipboard access. Please long-press the box and paste manually.");
    }
  });

  els.fetchBtn?.addEventListener("click", async () => {
    const url = (els.mediaInput?.value || "").trim();
    if (!url) { setError("Please paste a media link first."); return; }
    setDetect(`Detected: ${detectPlatform(url)}`);
    try { await fetchInfo(url); } catch (e) { setError(e?.message || "Something went wrong. Please try again."); }
  });

  // Music card download button
  els.musicDownloadBtn?.addEventListener("click", () => {
    const url = els.musicDownloadBtn._musicUrl;
    triggerMusicDownload(url, els.musicDownloadBtn, els.musicStatus);
  });

  // Spotify search
  els.spotifySearchBtn?.addEventListener("click", performSpotifySearch);
  els.spotifySearchInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") performSpotifySearch();
  });
}

wireEvents();
