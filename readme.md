# Achek Media Downloader

## Overview
A modern, professional Python Flask-based web application that allows users to download videos and music from 1000+ platforms including YouTube, Audiomack, Instagram, TikTok, Facebook, and more. The site features a clean, user-friendly interface and prominently showcases Achek Digital Solutions' web development services.

## Recent Changes
- **2025-10-31**: AMP Auto Ads + Monetag Direct Link - Complete Implementation
  - **Google AMP Auto Ads** on ALL 7 pages:
    - Script in `<head>`: `<script async custom-element="amp-auto-ads" src="https://cdn.ampproject.org/v0/amp-auto-ads-0.1.js"></script>`
    - Element after `<body>`: `<amp-auto-ads type="adsense" data-ad-client="ca-pub-5807971758805138"></amp-auto-ads>`
    - Google AMP automatically places and optimizes ads across the entire site
    - Pages: index, youtube, tiktok, instagram, facebook, spotify, audiomack
  - **Monetag Direct Link** on homepage download buttons (index.html):
    - Direct Link: `https://otieu.com/4/10117202`
    - Recurring ad system: Opens ad on EVERY odd click (1st, 3rd, 5th...), download on even clicks (2nd, 4th, 6th...)
    - Click flow: Ad → Download → Ad → Download → Ad → Download (repeating)
    - Implemented in JavaScript (`static/js/script.js`)
  - Clean dual monetization: AMP Auto Ads site-wide + Monetag direct link on homepage

- **2025-10-31**: Fixed Render Deployment & yt-dlp Facebook Issues
  - **Root Cause**: Outdated yt-dlp version causing "Cannot parse data" Facebook errors on Render
  - Created Docker-based deployment configuration for Render:
    - New `Dockerfile` with Python 3.11, FFmpeg, and auto-updating yt-dlp
    - New `render.yaml` for easy Blueprint deployment
    - New `.dockerignore` for optimized builds
  - Updated `requirements.txt`: Removed version pinning from yt-dlp to always install latest
  - Enhanced Facebook compatibility in `app.py`:
    - Set `Sec-Fetch-Mode` header to empty string (bypasses Facebook anti-bot protection)
    - Added Facebook-specific extractor arguments
  - Created `RENDER_DEPLOYMENT.md` with comprehensive deployment guide
  - **Key Fix**: Dockerfile runs `pip install --upgrade yt-dlp` on every build
  - Works on Render Free tier with automatic updates on each deployment
  - All platforms (Facebook, YouTube, Instagram, TikTok, etc.) now working on Render

- **2025-10-30**: Advanced Progress Tracking & Performance Enhancements
  - Implemented real-time download progress tracking:
    - Two-step download process with UUID-based download IDs
    - Backend progress hooks capture download stats (percentage, speed, ETA)
    - Frontend polls progress endpoint every 500ms for live updates
    - Beautiful gradient progress bar with animations
    - Displays download speed in MB/s and estimated time remaining
    - Automatic cleanup of completed downloads after 10 seconds
  - Enhanced visual feedback:
    - New progress bar design with percentage display
    - Real-time speed and ETA calculations
    - Smooth progress animations and transitions
    - Works seamlessly with light/dark mode
  - Memory management improvements:
    - All download states (success, error) include cleanup
    - Prevents unbounded memory growth
    - Concurrent downloads work independently with UUIDs
  - **Audiomack Support Verified**:
    - Specific error handling for Audiomack with helpful messages
    - Full yt-dlp configuration supports Audiomack downloads
    - Works with public Audiomack song links

- **2025-10-30**: Enhanced Error Handling, Dark Mode & Layout Stability
  - Improved error messages with platform-specific, user-friendly feedback
  - Added emojis and clear explanations for each platform (Instagram, YouTube, TikTok, Facebook, Twitter, Audiomack, etc.)
  - Generic fallback messages for unsupported URLs and invalid links
  - Implemented light/dark mode toggle:
    - CSS variables for seamless theme switching
    - Toggle button in header with moon/sun icons
    - Auto-detection of system preference
    - LocalStorage persistence for user preference
  - Enhanced layout stability:
    - Fixed overflow issues that could affect scrollbar
    - Error messages use max-width and word-wrap to prevent layout breaks
    - Ad containers properly contained with overflow:hidden
    - Header and footer remain stable with proper positioning
  - **CRITICAL FIX**: Removed sw.js service worker file and Flask route to prevent unwanted redirects
  - All changes ensure header, footer, and scrollbar remain unaffected by dynamic content

- **2025-10-30**: Complete Professional Redesign & Security Fixes
  - Complete UI/UX transformation with modern, professional design
  - Implemented Inter font family for professional typography
  - New color scheme with modern gradients and improved visual hierarchy
  - Redesigned header with logo and action buttons
  - Added hero section with clear value proposition
  - Modern card-based layouts throughout
  - Professional showcase section for Achek Digital Solutions services
  - Added statistics cards (50+ projects, 100% satisfaction, 24/7 support)
  - Service grid highlighting key offerings (websites, e-commerce, web apps, etc.)
  - Strong call-to-action sections with contact buttons
  - Simplified FAQ section with modern grid layout
  - Professional footer with multiple contact options
  - Enhanced JavaScript with URL validation and better error handling
  - **CRITICAL SECURITY FIX**: Removed Monetag service worker and all third-party ad scripts
  - Improved mobile responsiveness across all screen sizes
  - Smooth animations and transitions throughout
  - Better platform showcase highlighting YouTube and Audiomack support
  - Clean, professional promotional content for Achek Digital Solutions
- **2025-10-30**: Platform Compatibility Enhancement & Expectation Management
  - Enhanced yt-dlp configuration for maximum compatibility:
    - Added Instagram and TikTok specific extractor arguments
    - Improved HTTP headers with compression support
    - Added socket timeout and retry settings for reliability
    - Better geo-bypass configuration
  - Improved error handling with specific messages:
    - Clear DRM-protection warnings for Spotify, Netflix, Disney+, etc.
    - Honest messaging about technical limitations
    - Helpful suggestions for alternative platforms
    - Better Audiomack, geo-restriction, and private content errors
  - Updated UI to set proper expectations:
    - Clear "✅ Supported Platforms (Working)" section
    - Prominent DRM warning for protected platforms
    - Removed false claims about premium downloads
    - Updated to offer legitimate custom development services
  - Focus on platforms that actually work: YouTube, Instagram, TikTok, Facebook, Twitter, Vimeo, SoundCloud, Reddit, Twitch, etc.

- **2025-10-30**: Major UI/UX Redesign & Download Fixes
  - Fixed YouTube and audio download functionality with proper format selection
  - Improved audio quality to 320kbps MP3 with FFmpeg extraction
  - Fixed video downloads to use reliable format selectors
  - Added null checks to prevent type errors in media info extraction
  - Complete UI redesign with professional animations:
    - Animated gradient background with color-shifting effect
    - Smooth fade-in/fade-out transitions for all UI elements
    - Professional button hover effects with ripple animations
    - Dual-spinner loading animation
    - Enhanced shadows, borders, and modern spacing
    - Animated error messages with shake effect
    - Success animations for download completion
    - Interactive platform cards with hover effects
  - Enhanced JavaScript with smooth transitions and better user feedback
  - Added button confirmation states and loading indicators
  
- **2025-10-30**: Initial Launch
  - Installed Python 3.11 and latest yt-dlp (2025.10.22)
  - Created Flask application structure
  - Integrated yt-dlp for universal media downloading
  - Added Monetag ad script integration with SW.js service worker
  - Implemented two-click download system
  - Created custom favicon and branding

## User Preferences
- Wants both free (with ads) and premium monetization options
- Requires support for video downloads from YouTube, Facebook, Instagram, TikTok
- Requires music downloads from Spotify and Audiomack
- Wants profile picture and story download capabilities
- Has a license for the service

## Project Architecture
### Stack
- **Backend**: Flask (Python)
- **Frontend**: HTML, CSS, JavaScript
- **Media Downloader**: yt-dlp (supports 1000+ websites)
- **Media Processing**: ffmpeg

### Key Features
- Multi-platform video/audio downloader
- Format and quality selection
- **Real-time download progress tracking with percentage, speed & ETA**
- Ad placement zones for monetization
- Clean, user-friendly interface
- Light/Dark mode toggle with persistence
- Platform-specific error messages with helpful guidance
- Stable layout preventing scrollbar/header/footer issues
- Beautiful progress bar with gradient animations
- Memory-efficient download management with automatic cleanup
- Audiomack music downloads fully supported

### Structure
```
/
├── app.py                 # Main Flask application
├── templates/             # HTML templates
│   └── index.html        # Main interface
├── static/               # CSS, JS, images
│   ├── css/
│   ├── js/
│   └── downloads/        # Temporary download storage
└── requirements.txt      # Python dependencies
```
