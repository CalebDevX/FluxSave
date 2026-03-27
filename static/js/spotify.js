// Spotify downloader page – search + direct link logic

const spotifyElements = {
  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  searchError: document.getElementById("searchError"),
  searchLoader: document.getElementById("searchLoader"),
  resultsSection: document.getElementById("resultsSection"),
  resultsContainer: document.getElementById("resultsContainer"),
  directLinkInput: document.getElementById("directLinkInput"),
  pasteDirectBtn: document.getElementById("pasteDirectBtn"),
  fetchDirectBtn: document.getElementById("fetchDirectBtn"),
  directDetectText: document.getElementById("directDetectText"),
  directErrorText: document.getElementById("directErrorText"),
  directLoader: document.getElementById("directLoader"),
  directMusicCard: document.getElementById("directMusicCard"),
  directMusicMeta: document.getElementById("directMusicMeta"),
  directDownloadBtn: document.getElementById("directDownloadBtn"),
  directMusicStatus: document.getElementById("directMusicStatus"),
};

function showPageToast(message, ms = 3000) {
  const el = document.getElementById("pageToast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showPageToast._t);
  showPageToast._t = setTimeout(() => el.classList.add("hidden"), ms);
}

function escHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c] || c)
  );
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Direct download helper ───────────────────────────────────────────────────
async function downloadSpotifyTrack(spotifyUrl, btn, statusEl) {
  if (!spotifyUrl) { showPageToast("No track loaded. Paste a Spotify link first."); return; }

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting your track…';
  if (statusEl) statusEl.textContent = "Getting download link, please wait…";

  try {
    const r = await fetch("/get_direct_url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: spotifyUrl, type: "audio" }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success || !data?.url) {
      throw new Error(data?.error || "Could not get the download link. Please try again.");
    }

    const filename = data.filename || "audio.mp3";
    if (statusEl) statusEl.textContent = "Starting your download…";
    showPageToast("Your download has started! Check your downloads folder.", 4000);

    const proxyUrl = `/download-proxy?url=${encodeURIComponent(data.url)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = proxyUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (statusEl) statusEl.textContent = "Download started! Check your downloads folder.";
  } catch (e) {
    showPageToast(e.message || "Download failed. Please try again.", 4000);
    if (statusEl) statusEl.textContent = "Download failed. Please try again.";
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = originalText;
      if (statusEl) statusEl.textContent = "";
    }, 6000);
  }
}

// ─── Search results ───────────────────────────────────────────────────────────
function createTrackItem(track) {
  const item = document.createElement("div");
  item.className = "track-item";

  const thumbnail = track.thumbnail || "";
  const artists = Array.isArray(track.artists) ? track.artists.join(", ") : track.artists || "Unknown Artist";
  const duration = formatDuration(track.duration);

  item.innerHTML = `
    ${thumbnail ? `<img src="${escHtml(thumbnail)}" alt="Album Art" class="track-thumbnail" onerror="this.style.display='none'">` : ""}
    <div class="track-info">
      <div class="track-title">${escHtml(track.title || "Unknown Title")}</div>
      <div class="track-artist">${escHtml(artists)}</div>
      <div class="track-album">${escHtml(track.album || "")}</div>
    </div>
    ${duration ? `<div class="track-duration">${escHtml(duration)}</div>` : ""}
    <button class="download-btn" type="button">
      <i class="fas fa-download"></i> Download
    </button>
  `;

  const downloadBtn = item.querySelector(".download-btn");
  downloadBtn.addEventListener("click", () => {
    const url = track.spotify_url || track.spotifyUrl || "";
    if (!url) { showPageToast("Track URL is missing. Please try another song."); return; }
    downloadSpotifyTrack(url, downloadBtn, null);
  });

  return item;
}

async function performSearch() {
  const query = (spotifyElements.searchInput?.value || "").trim();
  if (!query) {
    if (spotifyElements.searchError) {
      spotifyElements.searchError.textContent = "Type a song name or artist to search.";
      spotifyElements.searchError.style.display = "block";
    }
    return;
  }

  if (spotifyElements.searchError) spotifyElements.searchError.style.display = "none";
  if (spotifyElements.searchLoader) spotifyElements.searchLoader.classList.remove("hidden");
  if (spotifyElements.resultsSection) spotifyElements.resultsSection.style.display = "block";
  if (spotifyElements.resultsContainer) spotifyElements.resultsContainer.innerHTML = "";
  if (spotifyElements.searchBtn) spotifyElements.searchBtn.disabled = true;

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
      if (spotifyElements.resultsContainer) {
        spotifyElements.resultsContainer.innerHTML = '<div class="no-results">Nothing came up — try a different song or artist name.</div>';
      }
    } else {
      results.forEach(track => {
        spotifyElements.resultsContainer?.appendChild(createTrackItem(track));
      });
    }
  } catch (error) {
    if (spotifyElements.searchError) {
      spotifyElements.searchError.textContent = error.message || "Search failed. Please try again.";
      spotifyElements.searchError.style.display = "block";
    }
  } finally {
    if (spotifyElements.searchLoader) spotifyElements.searchLoader.classList.add("hidden");
    if (spotifyElements.searchBtn) spotifyElements.searchBtn.disabled = false;
  }
}

// ─── Direct link: fetch → show music card ─────────────────────────────────────
async function fetchDirectInfo() {
  const url = (spotifyElements.directLinkInput?.value || "").trim();
  if (!url) {
    if (spotifyElements.directErrorText) spotifyElements.directErrorText.textContent = "Please paste a Spotify link first.";
    return;
  }

  if (spotifyElements.directErrorText) spotifyElements.directErrorText.textContent = "";
  if (spotifyElements.directLoader) spotifyElements.directLoader.classList.remove("hidden");
  if (spotifyElements.directMusicCard) spotifyElements.directMusicCard.classList.add("hidden");
  if (spotifyElements.fetchDirectBtn) spotifyElements.fetchDirectBtn.disabled = true;

  try {
    const r = await fetch("/fetch_info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success) throw new Error(data?.error || "Could not fetch track info. Please check the link.");

    // Populate music card
    const title = data.title || "Unknown Track";
    const uploader = data.uploader || "";
    const rawDur = data.duration;
    const duration = (rawDur && rawDur !== "Unknown") ? String(rawDur) : "";
    const thumb = data.thumbnail || "";

    if (spotifyElements.directMusicMeta) {
      spotifyElements.directMusicMeta.innerHTML = `
        <div class="media-meta-block" style="display:flex;align-items:center;gap:16px;">
          ${thumb ? `<img class="meta-thumb" src="${escHtml(thumb)}" alt="Album art" style="width:80px;height:80px;border-radius:8px;object-fit:cover;" />` : ""}
          <div>
            <div class="meta-title" style="font-weight:700;font-size:1.1rem;">${escHtml(title)}</div>
            ${uploader ? `<div class="meta-sub" style="color:#666;">Artist: ${escHtml(uploader)}</div>` : ""}
            ${duration ? `<div class="meta-sub" style="color:#888;">Duration: ${escHtml(duration)}</div>` : ""}
          </div>
        </div>
      `;
    }

    if (spotifyElements.directDownloadBtn) {
      spotifyElements.directDownloadBtn._spotifyUrl = url;
    }

    if (spotifyElements.directMusicCard) {
      spotifyElements.directMusicCard.classList.remove("hidden");
      spotifyElements.directMusicCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    showPageToast("Track found! Tap Download MP3 to save it to your device.", 4000);
  } catch (e) {
    if (spotifyElements.directErrorText) spotifyElements.directErrorText.textContent = e.message || "Something went wrong. Please try again.";
  } finally {
    if (spotifyElements.directLoader) spotifyElements.directLoader.classList.add("hidden");
    if (spotifyElements.fetchDirectBtn) spotifyElements.fetchDirectBtn.disabled = false;
  }
}

// ─── Wire events ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  spotifyElements.searchBtn?.addEventListener("click", performSearch);
  spotifyElements.searchInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") performSearch();
  });

  spotifyElements.pasteDirectBtn?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { showPageToast("Your clipboard is empty — copy a Spotify link first!"); return; }
      if (spotifyElements.directLinkInput) spotifyElements.directLinkInput.value = text.trim();
      if (spotifyElements.directDetectText) spotifyElements.directDetectText.textContent = "Link pasted! Tap Fetch Track to continue.";
      showPageToast("Link pasted! Tap Fetch Track to continue.");
    } catch {
      if (spotifyElements.directDetectText) spotifyElements.directDetectText.textContent = "Please long-press and paste the link manually.";
    }
  });

  spotifyElements.fetchDirectBtn?.addEventListener("click", fetchDirectInfo);
  spotifyElements.directLinkInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") fetchDirectInfo();
  });

  spotifyElements.directDownloadBtn?.addEventListener("click", () => {
    const url = spotifyElements.directDownloadBtn._spotifyUrl;
    downloadSpotifyTrack(url, spotifyElements.directDownloadBtn, spotifyElements.directMusicStatus);
  });
});
