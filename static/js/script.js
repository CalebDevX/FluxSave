// Modern Media Downloader - Enhanced JavaScript by Achek Digital Solutions

let currentUrl = '';
let mediaInfo = null;

// Dark Mode Toggle
const themeToggle = document.getElementById('themeToggle');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    // Default to light mode - only use dark if explicitly saved as 'dark'
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

themeToggle.addEventListener('click', toggleTheme);
loadTheme();

// Form submission handler
document.getElementById('downloadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    
    if (!url) {
        showError('Please enter a valid URL');
        return;
    }
    
    if (!isValidUrl(url)) {
        showError('Please enter a valid URL format (must start with http:// or https://)');
        return;
    }
    
    currentUrl = url;
    await fetchMediaInfo(url);
});

// URL validation
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// Fetch media information
async function fetchMediaInfo(url) {
    showLoading();
    hideError();
    hideMediaInfo();
    hideDownloadResult();
    
    try {
        const response = await fetch('/fetch_info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mediaInfo = data;
            displayMediaInfo(data);
        } else {
            showError(data.error || 'Failed to fetch media information. Please check the URL and try again.');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showError('Network error. Please check your internet connection and try again.');
    } finally {
        hideLoading();
    }
}

// Display media information - Dynamic & Professional
function displayMediaInfo(info) {
    // Set media details
    document.getElementById('thumbnail').src = info.thumbnail;
    document.getElementById('thumbnail').alt = info.title;
    document.getElementById('mediaTitle').textContent = info.title;
    document.getElementById('uploader').textContent = 'Uploader: ' + info.uploader;
    document.getElementById('duration').textContent = 'Duration: ' + formatDuration(info.duration);
    
    // Check if this is audio-only content (Spotify, Audiomack, etc.)
    const isAudioOnly = (info.video_formats && info.video_formats.length === 0) && 
                       (info.audio_formats && info.audio_formats.length > 0);
    
    // Display video formats - Only show if not audio-only content
    const videoFormats = document.getElementById('videoFormats');
    const videoGroup = document.querySelector('.option-group:nth-child(1)'); // Video Quality group
    
    if (isAudioOnly) {
        // Hide video formats section for audio-only content
        if (videoGroup) videoGroup.style.display = 'none';
    } else {
        // Show video formats section
        if (videoGroup) videoGroup.style.display = 'block';
        videoFormats.innerHTML = '';

        // If backend provided concrete format info, build buttons
        if (info.video_formats && info.video_formats.length > 0) {
            info.video_formats.forEach((format) => {
                const btn = createFormatButton(format, 'video');
                videoFormats.appendChild(btn);
            });
        } else {
            // Fallback presets if no concrete formats were returned
            const bestVideoBtn = document.createElement('button');
            bestVideoBtn.className = 'format-btn best-quality';
            bestVideoBtn.type = 'button';
            bestVideoBtn.innerHTML = '<i class="fas fa-crown"></i> Best Quality';
            bestVideoBtn.dataset.formatId = 'best';
            bestVideoBtn.dataset.type = 'video';
            bestVideoBtn.addEventListener('click', () => handleFormatDownload(bestVideoBtn, 'best', 'video'));
            videoFormats.appendChild(bestVideoBtn);

            const qualityPresets = [
                { id: 'bestvideo[height<=1080]+bestaudio/best', label: '1080P (Full HD)', icon: 'video' },
                { id: 'bestvideo[height<=480]+bestaudio/best', label: '480P (SD)', icon: 'mobile-alt' },
                { id: 'bestvideo[height<=360]+bestaudio/best', label: '360P (Mobile)', icon: 'mobile' }
            ];

            qualityPresets.forEach((quality) => {
                const btn = document.createElement('button');
                btn.className = 'format-btn';
                btn.type = 'button';
                btn.innerHTML = `<i class="fas fa-${quality.icon}"></i> ${quality.label}`;
                btn.dataset.formatId = quality.id;
                btn.dataset.type = 'video';
                btn.addEventListener('click', () => handleFormatDownload(btn, quality.id, 'video'));
                videoFormats.appendChild(btn);
            });
        }
    }
    
    // Display audio formats - DYNAMIC with music-focused styling
    const audioFormats = document.getElementById('audioFormats');
    const audioGroup = document.querySelector('.option-group:nth-child(2)'); // Audio Only group
    
    // Update the audio section header for music content
    const audioHeader = audioGroup.querySelector('h4');
    if (isAudioOnly) {
        audioHeader.innerHTML = '<i class="fas fa-music"></i> Download Music';
        audioHeader.style.color = '#1DB954'; // Spotify green
    } else {
        audioHeader.innerHTML = '<i class="fas fa-music"></i> Audio Only (MP3)';
        audioHeader.style.color = ''; // Reset to default
    }
    
    audioFormats.innerHTML = '';

    if (info.audio_formats && info.audio_formats.length > 0) {
        info.audio_formats.forEach((format) => {
            const btn = createFormatButton(format, 'audio', isAudioOnly);
            audioFormats.appendChild(btn);
        });
    } else {
        // Fallback buttons with music-appropriate labels
        const bestAudioBtn = document.createElement('button');
        bestAudioBtn.className = 'format-btn best-quality';
        bestAudioBtn.type = 'button';
        bestAudioBtn.innerHTML = '<i class="fas fa-crown"></i> Best Quality MP3';
        bestAudioBtn.dataset.formatId = 'bestaudio';
        bestAudioBtn.dataset.type = 'audio';
        bestAudioBtn.addEventListener('click', () => handleFormatDownload(bestAudioBtn, 'bestaudio', 'audio'));
        audioFormats.appendChild(bestAudioBtn);

        const audioPresets = [
            { id: 'bestaudio[abr<=320]', label: 'High Quality (320kbps)', icon: 'music' },
            { id: 'bestaudio[abr<=192]', label: 'Standard (192kbps)', icon: 'headphones' },
            { id: 'bestaudio[abr<=128]', label: 'Mobile (128kbps)', icon: 'mobile' }
        ];

        audioPresets.forEach(quality => {
            const btn = document.createElement('button');
            btn.className = 'format-btn';
            btn.type = 'button';
            btn.innerHTML = `<i class="fas fa-${quality.icon}"></i> ${quality.label}`;
            btn.dataset.formatId = quality.id;
            btn.dataset.type = 'audio';
            btn.addEventListener('click', () => handleFormatDownload(btn, quality.id, 'audio'));
            audioFormats.appendChild(btn);
        });
    }
    
    showMediaInfo();

    // If backend provided a direct downloadable link (Spotify resolver), start download automatically
    if (info && info.direct_download && info.direct_download.download_link) {
        // small delay so UI updates before triggering download
        setTimeout(() => {
            showDownloadResult(info.direct_download.download_link);
        }, 300);
    }
}

// Create format button
function createFormatButton(format, type, isAudioOnly = false) {
    const btn = document.createElement('button');
    btn.className = 'format-btn';
    btn.type = 'button';

    let displayText = `${format.quality || ''}`.trim();
    if (format.ext) {
        displayText += displayText ? ` (${format.ext})` : `${format.ext}`;
    }
    if (format.filesize && format.filesize !== 'Unknown') {
        displayText += ` - ${format.filesize}MB`;
    }

    // For audio-only content, make the buttons more music-focused
    if (isAudioOnly && type === 'audio') {
        if (!displayText || displayText === 'Download MP3') {
            displayText = 'Download Music';
        }
        // Add music icon for audio-only content
        btn.innerHTML = `<i class="fas fa-music"></i> ${displayText}`;
    } else {
        btn.textContent = displayText || (type === 'audio' ? 'Download MP3' : 'Download');
    }

    btn.dataset.formatId = format.format_id || '';
    btn.dataset.type = type;
    btn.dataset.clicked = 'false';
    if (format.direct_url) {
        btn.dataset.directUrl = format.direct_url;
    }
    btn.addEventListener('click', () => handleFormatDownload(btn, format.format_id, type));

    return btn;
}

// Create default button
function createDefaultButton(type, isAudioOnly = false) {
    const btn = document.createElement('button');
    btn.className = 'format-btn';
    btn.type = 'button';

    let buttonText = type === 'audio' ? 'Download as MP3 (Best Quality)' : 'Download Best Quality';

    // For audio-only content, make the button more music-focused
    if (isAudioOnly && type === 'audio') {
        buttonText = 'Download Music (Best Quality)';
        btn.innerHTML = `<i class="fas fa-music"></i> ${buttonText}`;
    } else {
        btn.textContent = buttonText;
    }

    btn.dataset.type = type;
    btn.dataset.clicked = 'false';
    btn.addEventListener('click', () => handleFormatDownload(btn, null, type));

    return btn;
}

// Handle format download with Monetag ad (recurring ad system)
async function handleFormatDownload(button, formatId, type) {
    // Initialize click counter if not exists
    if (!button.dataset.clickCount) {
        button.dataset.clickCount = '0';
    }

    // Store original text if not already stored
    if (!button.dataset.originalText) {
        button.dataset.originalText = button.innerHTML;
    }

    // If this button has a direct URL, skip the ad step and start direct download immediately
    const directUrl = button.dataset.directUrl;
    if (directUrl) {
        // Provide quick UI feedback
        button.disabled = true;
        button.style.pointerEvents = 'none';
        button.innerHTML = '<span>⏳</span> Starting download...';
        button.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
        button.style.color = 'white';

        try {
            await startDirectDownload(directUrl);
        } finally {
            button.disabled = false;
            button.style.pointerEvents = '';
            button.innerHTML = button.dataset.originalText;
            button.style.background = '';
            button.style.color = '';
        }
        return;
    }

    // Increment click counter
    const clickCount = parseInt(button.dataset.clickCount) + 1;
    button.dataset.clickCount = clickCount.toString();

    // Check if this is an odd click (1st, 3rd, 5th, etc.)
    const isOddClick = clickCount % 2 === 1;

    if (isOddClick) {
        // ODD CLICK (1st, 3rd, 5th, etc.): Show Monetag ad redirect

        // Update button to show next step
        button.innerHTML = '<span>✅</span> Click Again to Download';
        button.style.background = 'linear-gradient(135deg, #10B981, #059669)';
        button.style.color = 'white';
        button.style.animation = 'pulse 1.5s infinite';

        // Open Monetag direct link in new tab
        const adUrl = 'https://otieu.com/4/10117202';
        window.open(adUrl, '_blank', 'noopener,noreferrer');

        return;
    }

    // EVEN CLICK (2nd, 4th, 6th, etc.): Start actual download
    button.disabled = true;
    button.style.pointerEvents = 'none';
    button.style.animation = '';
    button.innerHTML = '<span>⏳</span> Downloading...';
    button.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    button.style.color = 'white';

    try {
        await downloadWithFormat(formatId, type);

        // Download successful - restore original state for next ad cycle
        button.innerHTML = button.dataset.originalText;
        button.style.background = '';
        button.style.color = '';

    } catch (error) {
        // Error - restore original state
        button.innerHTML = button.dataset.originalText;
        button.style.background = '';
        button.style.color = '';
    } finally {
        button.disabled = false;
        button.style.pointerEvents = '';
    }
}

async function startDirectDownload(downloadUrl) {
    showDownloadProgress();
    hideError();
    hideDownloadResult();

    // Fire a quick progress update so the user sees something
    updateProgressDisplay(5, 'Preparing download...', 0, 0);

    // Delay briefly to allow UI to update
    await new Promise((resolve) => setTimeout(resolve, 250));

    showDownloadResult(downloadUrl);
}

// Reset single button
function resetButton(btn) {
    btn.dataset.clicked = 'false';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
    btn.style.transform = '';
    btn.style.boxShadow = '';
    
    const formatId = btn.dataset.formatId;
    const type = btn.dataset.type;
    
    if (formatId && mediaInfo) {
        const formats = type === 'audio' ? mediaInfo.audio_formats : mediaInfo.video_formats;
        const format = formats?.find(f => f.format_id === formatId);
        if (format) {
            let displayText = `${format.quality}`;
            if (format.ext) {
                displayText += ` (${format.ext})`;
            }
            if (format.filesize && format.filesize !== 'Unknown') {
                displayText += ` - ${format.filesize}MB`;
            }
            btn.textContent = displayText;
        }
    } else {
        btn.textContent = type === 'audio' ? 'Download as MP3 (Best Quality)' : 'Download Best Quality';
    }
}

// Reset all format buttons
function resetAllFormatButtons() {
    const allButtons = document.querySelectorAll('.format-btn');
    allButtons.forEach(btn => resetButton(btn));
}

// Download with specified format
async function downloadWithFormat(formatId, type) {
    showDownloadProgress();
    hideError();
    hideDownloadResult();

    let progressInterval = null;
    let downloadId = null;

    try {
        // Step 1: Start the download and get the download_id
        const startResponse = await fetch('/start_download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: currentUrl,
                format_id: formatId,
                type: type
            })
        });

        const startData = await startResponse.json();

        if (!startResponse.ok || !startData.success) {
            showError(startData.error || 'Failed to start download');
            hideDownloadProgress();
            return;
        }

        downloadId = startData.download_id;

        // Step 2: Start polling for progress updates with the real download_id
        progressInterval = setInterval(async () => {
            try {
                const progressResponse = await fetch(`/progress/${downloadId}`);
                const progressData = await progressResponse.json();

                if (progressData.status === 'downloading' || progressData.status === 'processing' || progressData.status === 'starting') {
                    updateProgressDisplay(
                        progressData.percentage || 0,
                        progressData.message || 'Downloading...',
                        progressData.speed || 0,
                        progressData.eta || 0
                    );
                } else if (progressData.status === 'complete') {
                    clearInterval(progressInterval);
                    updateProgressDisplay(100, 'Download complete!', 0, 0);
                } else if (progressData.status === 'error') {
                    clearInterval(progressInterval);
                    showError(progressData.message || 'Download failed');
                    hideDownloadProgress();
                }
            } catch (err) {
                console.log('Progress check:', err);
            }
        }, 500); // Poll every 500ms

        // Step 3: Actually perform the download
        const downloadResponse = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: currentUrl,
                format_id: formatId,
                type: type,
                download_id: downloadId
            })
        });

        const downloadData = await downloadResponse.json();

        // Clear the polling interval
        if (progressInterval) {
            clearInterval(progressInterval);
        }

        if (downloadResponse.ok && downloadData.success) {
            updateProgressDisplay(100, 'Download complete!', 0, 0);
            setTimeout(() => {
                showDownloadResult(downloadData.download_url);
                hideDownloadProgress();
            }, 800);
        } else {
            showError(downloadData.error || 'Download failed. Please try again or select a different format.');
            hideDownloadProgress();
        }
    } catch (error) {
        console.error('Download error:', error);
        showError('Download failed. Please check your connection and try again.');
        hideDownloadProgress();
        if (progressInterval) {
            clearInterval(progressInterval);
        }
    }
}

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Helper function to format time
function formatTime(seconds) {
    if (!seconds || seconds <= 0) return 'calculating...';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
}

// Update progress display
function updateProgressDisplay(percentage, message, speed, eta) {
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressSpeed = document.getElementById('progressSpeed');
    const progressEta = document.getElementById('progressEta');
    const progressMessage = document.getElementById('progressMessage');
    
    if (progressBar) {
        progressBar.style.width = percentage + '%';
    }
    if (progressPercentage) {
        progressPercentage.textContent = percentage + '%';
    }
    if (progressSpeed && speed > 0) {
        progressSpeed.textContent = `Speed: ${formatBytes(speed)}/s`;
    }
    if (progressEta && eta > 0) {
        progressEta.textContent = `Time remaining: ${formatTime(eta)}`;
    }
    if (progressMessage && message) {
        progressMessage.textContent = message;
    }
}

// Format duration helper
function formatDuration(duration) {
    if (!duration || duration === 'Unknown') return 'Unknown';
    
    // If duration is a string like "3:45", return it as is
    if (typeof duration === 'string' && duration.includes(':')) {
        return duration;
    }
    
    // If duration is in seconds
    const seconds = parseInt(duration);
    if (isNaN(seconds)) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Smooth fade in animation
function fadeIn(element) {
    element.style.opacity = '0';
    element.style.display = 'block';
    element.style.transition = 'opacity 0.4s ease-in-out';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    });
}

// Smooth fade out animation
function fadeOut(element, callback) {
    element.style.transition = 'opacity 0.3s ease-in-out';
    element.style.opacity = '0';
    setTimeout(() => {
        element.style.display = 'none';
        if (callback) callback();
    }, 300);
}

// UI state management functions
function showLoading() {
    const loadingEl = document.getElementById('loadingIndicator');
    if (loadingEl) fadeIn(loadingEl);
}

function hideLoading() {
    const loadingEl = document.getElementById('loadingIndicator');
    if (loadingEl) fadeOut(loadingEl);
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (!errorEl) return;
    
    errorEl.textContent = '⚠️ ' + message;
    fadeIn(errorEl);
    // Removed auto-scroll to prevent unwanted page jumps
}

function hideError() {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) fadeOut(errorEl);
}

function showMediaInfo() {
    const mediaInfoEl = document.getElementById('mediaInfo');
    if (!mediaInfoEl) return;
    
    fadeIn(mediaInfoEl);
    // Removed auto-scroll to prevent unwanted page jumps
}

function hideMediaInfo() {
    const mediaInfoEl = document.getElementById('mediaInfo');
    if (mediaInfoEl) fadeOut(mediaInfoEl);
}

function showDownloadProgress() {
    const progressEl = document.getElementById('downloadProgress');
    if (progressEl) fadeIn(progressEl);
}

function hideDownloadProgress() {
    const progressEl = document.getElementById('downloadProgress');
    if (progressEl) fadeOut(progressEl);
}

function showDownloadResult(downloadUrl) {
    const downloadLink = document.getElementById('downloadLink');
    if (!downloadLink) return;
    
    downloadLink.href = downloadUrl;
    downloadLink.target = '_blank';
    // Ensure download attribute exists; some cross-origin links may ignore it
    downloadLink.setAttribute('download', '');
    
    const resultEl = document.getElementById('downloadResult');
    if (!resultEl) return;
    
    fadeIn(resultEl);
    // Attempt to auto-start the download. This should be allowed because it follows a user action.
    try {
        // Programmatic click — browsers usually permit this immediately after a user gesture.
        downloadLink.click();
    } catch (err) {
        // Fallback: open in new tab/window
        try { window.open(downloadUrl, '_blank', 'noopener'); } catch (e) { /* ignore */ }
    }
}

function hideDownloadResult() {
    const resultEl = document.getElementById('downloadResult');
    if (resultEl) fadeOut(resultEl);
}

// Download Another Button Handler
document.addEventListener('DOMContentLoaded', () => {
    const downloadAnotherBtn = document.getElementById('downloadAnotherBtn');
    if (downloadAnotherBtn) {
        downloadAnotherBtn.addEventListener('click', () => {
            // Reset the form
            document.getElementById('urlInput').value = '';
            currentUrl = '';
            mediaInfo = null;
            
            // Hide all result sections
            hideDownloadResult();
            hideMediaInfo();
            hideDownloadProgress();
            hideError();
            
            // Reset all format buttons
            resetAllFormatButtons();
            
            // Scroll to top of page
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
            
            // Focus on URL input
            document.getElementById('urlInput').focus();
        });
    }

    // Spotify Search Handler
    const spotifySearchBtn = document.getElementById('spotifySearchBtn');
    const spotifySearchInput = document.getElementById('spotifySearchInput');
    
    if (spotifySearchBtn && spotifySearchInput) {
        spotifySearchBtn.addEventListener('click', () => {
            const query = spotifySearchInput.value.trim();
            if (query) {
                searchSpotify(query);
            }
        });
        
        spotifySearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = spotifySearchInput.value.trim();
                if (query) {
                    searchSpotify(query);
                }
            }
        });
    }
});

// Spotify Search Function
async function searchSpotify(query) {
    const spotifyLoader = document.getElementById('spotifyLoader');
    const spotifyResults = document.getElementById('spotifyResults');
    const spotifyTracks = document.getElementById('spotifyTracks');
    
    // Show loading
    if (spotifyLoader) fadeIn(spotifyLoader);
    if (spotifyResults) fadeOut(spotifyResults);
    
    try {
        const response = await fetch('/spotify-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            displaySpotifyResults(data.results);
        } else {
            showSpotifyError(data.error || 'Search failed');
        }
    } catch (error) {
        console.error('Spotify search error:', error);
        showSpotifyError('Network error. Please try again.');
    } finally {
        if (spotifyLoader) fadeOut(spotifyLoader);
    }
}

// Display Spotify Search Results
function displaySpotifyResults(tracks) {
    const spotifyResults = document.getElementById('spotifyResults');
    const spotifyTracks = document.getElementById('spotifyTracks');
    
    if (!spotifyTracks) return;
    
    spotifyTracks.innerHTML = '';
    
    if (!tracks || tracks.length === 0) {
        spotifyTracks.innerHTML = '<p>No results found. Try a different search term.</p>';
        fadeIn(spotifyResults);
        return;
    }
    
    tracks.forEach(track => {
        const trackElement = document.createElement('div');
        trackElement.className = 'spotify-track';
        trackElement.innerHTML = `
            <div class="track-info">
                <img src="${track.thumbnail || '/static/favicon.png'}" alt="Album Art" class="track-thumbnail" loading="lazy">
                <div class="track-details">
                    <h4 class="track-title">${track.title}</h4>
                    <p class="track-artist">${track.artists ? track.artists.join(', ') : 'Unknown Artist'}</p>
                    <p class="track-album">${track.album || 'Unknown Album'}</p>
                </div>
            </div>
            <div class="track-actions">
                <button class="btn btn-primary download-spotify-btn" data-url="${track.spotify_url}">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        `;
        
        // Add click handler for download button
        const downloadBtn = trackElement.querySelector('.download-spotify-btn');
        downloadBtn.addEventListener('click', () => {
            const url = downloadBtn.dataset.url;
            if (url) {
                // Set the main input to this Spotify URL and trigger fetch
                document.getElementById('urlInput').value = url;
                document.getElementById('downloadForm').dispatchEvent(new Event('submit'));
                
                // Scroll to top to show the download options
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        
        spotifyTracks.appendChild(trackElement);
    });
    
    fadeIn(spotifyResults);
}

// Show Spotify Error
function showSpotifyError(message) {
    const spotifyResults = document.getElementById('spotifyResults');
    const spotifyTracks = document.getElementById('spotifyTracks');
    
    if (spotifyTracks) {
        spotifyTracks.innerHTML = `<p class="error-message">⚠️ ${message}</p>`;
    }
    
    if (spotifyResults) fadeIn(spotifyResults);
}

// Hamburger Menu Toggle
const hamburgerBtn = document.getElementById('hamburgerBtn');
const mainNav = document.getElementById('mainNav');

if (hamburgerBtn && mainNav) {
    hamburgerBtn.addEventListener('click', () => {
        mainNav.classList.toggle('open');
        const isOpen = mainNav.classList.contains('open');
        hamburgerBtn.innerHTML = isOpen ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
    });

    // Close menu when clicking outside or on a link
    document.addEventListener('click', (e) => {
        if (!mainNav.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            mainNav.classList.remove('open');
            hamburgerBtn.innerHTML = '<i class="fas fa-bars"></i>';
        }
    });

    mainNav.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            mainNav.classList.remove('open');
            hamburgerBtn.innerHTML = '<i class="fas fa-bars"></i>';
        }
    });
}

// Paste Button Functionality
const pasteBtn = document.getElementById('pasteBtn');
const urlInput = document.getElementById('urlInput');

if (pasteBtn && urlInput) {
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text.trim();
            urlInput.focus();
            showToast('URL pasted from clipboard!');
        } catch (err) {
            console.error('Failed to read clipboard:', err);
            showToast('Could not access clipboard. Please paste manually.', 'error');
        }
    });
}

// Toast Notification System
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
