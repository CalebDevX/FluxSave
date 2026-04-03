# FluxSave – All Media Downloader

A Flask-based media downloader that supports YouTube, TikTok, Instagram, Facebook, Spotify, Audiomack, and 1000+ other platforms.

## Tech Stack
- **Backend**: Python / Flask 3.0.0
- **Media extraction**: yt-dlp, custom Audiomack extractor, Spotify API helpers
- **Audio processing**: ffmpeg (system dependency)
- **Server**: gunicorn (production)

## Project Structure
- `app.py` – Main Flask app with all routes and download logic
- `spotify_api.py` / `spotify_utils.py` – Spotify metadata and search helpers
- `audiomack_downloader.py` – Custom Audiomack extraction
- `templates/` – Jinja2 HTML templates per platform
- `static/css/style.css` – Main stylesheet
- `static/js/main.js` – Home page UI logic (paste, detect, fetch, download)
- `static/js/spotify.js` – Spotify downloader page logic
- `robots.txt` / `sitemap.xml` – SEO files

## Key Routes
| Route | Description |
|-------|-------------|
| `/` | Home – universal media input |
| `/youtube-downloader` | YouTube info page |
| `/tiktok-downloader` | TikTok info page |
| `/instagram-downloader` | Instagram info page |
| `/facebook-downloader` | Facebook info page |
| `/spotify-downloader` | Spotify search + direct link download |
| `/audiomack-downloader` | Audiomack direct link download |
| `/fetch_info` | POST – fetch media metadata |
| `/get_direct_url` | POST – get CDN stream URL |
| `/download-proxy` | GET – proxy remote file as device download |
| `/stream-spotify` | GET – stream Spotify audio to browser |
| `/robots.txt` | SEO robots file |
| `/sitemap.xml` | SEO sitemap |

## Spotify & Audiomack Flow
1. User pastes link → clicks Fetch
2. `/fetch_info` returns track metadata (title, artist, thumbnail)
3. Music card is shown with a single "Download MP3" button
4. Button calls `/get_direct_url` → gets CDN URL → proxies through `/download-proxy` → file saves directly to device

## SEO Setup
- Optimized `<title>`, `<meta description>`, `<meta keywords>` on all pages
- Open Graph + Twitter Card tags on every page
- JSON-LD `WebApplication` structured data on every page
- `robots.txt` and `sitemap.xml` at root

## Environment Variables
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_BEARER_TOKEN` – Optional Spotify API credentials
- `YOUTUBE_COOKIES` / `YOUTUBE_COOKIES_FILE` – YouTube cookie bypass for bot detection
- `INSTAGRAM_COOKIES` / `INSTAGRAM_COOKIES_FILE` – Instagram session cookies (Netscape format). Required as of 2025 — Instagram blocks all server-side requests without a logged-in session. Export from browser with "Get cookies.txt LOCALLY" extension and paste full content into this secret.

## Instagram Download Notes
Instagram requires authenticated session cookies for all content since late 2023. The `INSTAGRAM_COOKIES` env var should contain a Netscape-format cookies.txt file from a logged-in Instagram session. Without it, downloads will fail with "rate-limit reached or login required". The Instagram downloader page shows a clear notice explaining this to site owners.

## Deployment
- Configured for autoscale deployment via gunicorn
- Port 5000 mapped to external port 80
