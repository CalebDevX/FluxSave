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
