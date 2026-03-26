// Spotify search and download functionality

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
  directResultCard: document.getElementById("directResultCard"),
  directMediaMeta: document.getElementById("directMediaMeta"),
  directDownloadButtons: document.getElementById("directDownloadButtons"),
};

let lastInfo = null;
let activeDownload = { downloadId: null, pollTimer: null };

function showToast(message, ms = 2200) {
  // Reuse the main.js toast if available
  if (window.showToast) {
    window.showToast(message, ms);
  }
}

function setError(element, message = "") {
  if (!element) return;
  element.textContent = message || "";
}

function setDetect(element, message = "") {
  if (!element) return;
  element.textContent = message || "";
}

function setLoading(element, isLoading) {
  if (!element) return;
  element.classList.toggle("hidden", !isLoading);
}

function showElement(element, show) {
  if (!element) return;
  element.style.display = show ? "block" : "none";
}

function formatDuration(seconds) {
  if (!seconds) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function createTrackItem(track) {
  const item = document.createElement("div");
  item.className = "track-item";

  const thumbnail = track.thumbnail || "https://via.placeholder.com/80x80/1DB954/ffffff?text=♪";
  const artists = Array.isArray(track.artists) ? track.artists.join(", ") : track.artists || "Unknown Artist";
  const duration = formatDuration(track.duration);

  item.innerHTML = `
    <img src="${thumbnail}" alt="Album Art" class="track-thumbnail" onerror="this.src='https://via.placeholder.com/80x80/1DB954/ffffff?text=♪'">
    <div class="track-info">
      <div class="track-title">${track.title || "Unknown Title"}</div>
      <div class="track-artist">${artists}</div>
      <div class="track-album">${track.album || "Unknown Album"}</div>
    </div>
    <div class="track-duration">${duration}</div>
    <button class="download-btn" data-url="${track.spotify_url}">
      <i class="fas fa-download"></i> Download
    </button>
  `;

  // Add download event listener
  const downloadBtn = item.querySelector(".download-btn");
  downloadBtn.addEventListener("click", () => {
    const url = downloadBtn.dataset.url;
    if (url) {
      downloadTrack(url, downloadBtn);
    }
  });

  return item;
}

async function searchSpotify(query) {
  try {
    const response = await fetch("/spotify-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Search failed");
    }

    return data.results || [];
  } catch (error) {
    console.error("Search error:", error);
    throw error;
  }
}

async function performSearch() {
  const query = spotifyElements.searchInput?.value?.trim();
  if (!query) {
    showElement(spotifyElements.searchError, true);
    setError(spotifyElements.searchError, "Please enter a search query");
    return;
  }

  showElement(spotifyElements.searchError, false);
  setLoading(spotifyElements.searchLoader, true);
  showElement(spotifyElements.resultsSection, true);
  spotifyElements.resultsContainer.innerHTML = "";

  try {
    const results = await searchSpotify(query);

    if (results.length === 0) {
      spotifyElements.resultsContainer.innerHTML = '<div class="no-results">No tracks found. Try a different search query.</div>';
    } else {
      results.forEach(track => {
        const trackItem = createTrackItem(track);
        spotifyElements.resultsContainer.appendChild(trackItem);
      });
    }
  } catch (error) {
    showElement(spotifyElements.searchError, true);
    setError(spotifyElements.searchError, `Search failed: ${error.message}`);
  } finally {
    setLoading(spotifyElements.searchLoader, false);
  }
}

async function downloadTrack(spotifyUrl, button) {
  button.disabled = true;
  button.innerHTML = '<div class="loading-spinner"></div> Processing...';

  try {
    // Use the main fetchInfo function to get download options
    if (window.fetchInfo) {
      await window.fetchInfo(spotifyUrl);
      showToast("Download options ready!");
    } else {
      // Fallback: redirect to main page with the URL
      window.location.href = `/?url=${encodeURIComponent(spotifyUrl)}`;
    }
  } catch (error) {
    showToast(`Download failed: ${error.message}`, 4000);
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-download"></i> Download';
  }
}

async function fetchDirectInfo() {
  const url = spotifyElements.directLinkInput?.value?.trim();
  if (!url) {
    setError(spotifyElements.directErrorText, "Please paste a Spotify link");
    return;
  }

  setError(spotifyElements.directErrorText, "");
  setLoading(spotifyElements.directLoader, true);

  try {
    // Use the main fetchInfo function
    if (window.fetchInfo) {
      const result = await window.fetchInfo(url);
      if (result) {
        showElement(spotifyElements.directResultCard, true);
        // Scroll to results
        spotifyElements.directResultCard.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // Fallback: redirect to main page
      window.location.href = `/?url=${encodeURIComponent(url)}`;
    }
  } catch (error) {
    setError(spotifyElements.directErrorText, error.message);
  } finally {
    setLoading(spotifyElements.directLoader, false);
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Search functionality
  if (spotifyElements.searchBtn) {
    spotifyElements.searchBtn.addEventListener("click", performSearch);
  }

  if (spotifyElements.searchInput) {
    spotifyElements.searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        performSearch();
      }
    });
  }

  // Direct link functionality
  if (spotifyElements.pasteDirectBtn) {
    spotifyElements.pasteDirectBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (spotifyElements.directLinkInput) {
          spotifyElements.directLinkInput.value = text;
          setDetect(spotifyElements.directDetectText, "Link pasted!");
        }
      } catch (error) {
        setDetect(spotifyElements.directDetectText, "Paste manually or allow clipboard access");
      }
    });
  }

  if (spotifyElements.fetchDirectBtn) {
    spotifyElements.fetchDirectBtn.addEventListener("click", fetchDirectInfo);
  }

  if (spotifyElements.directLinkInput) {
    spotifyElements.directLinkInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        fetchDirectInfo();
      }
    });
  }
});