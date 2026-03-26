# FluxSave - Media Downloader

## Project Overview
A Flask-based web application for downloading videos and music from 1000+ platforms including YouTube, Instagram, TikTok, Facebook, Audiomack, and Spotify (via YouTube matching).

## Tech Stack
- **Backend:** Python 3.12 + Flask 3.0.0
- **Media Engine:** yt-dlp (latest)
- **Media Processing:** FFmpeg (system-provided via Nix)
- **Production Server:** Gunicorn 21.2.0
- **Frontend:** HTML5, CSS3, Vanilla JavaScript

## Project Structure
- `app.py` — Main Flask app with all routes and download logic
- `spotify_api.py` / `spotify_utils.py` — Spotify link resolution and metadata
- `audiomack_downloader.py` — Custom Audiomack extraction
- `static/css/` — Stylesheet with dark/light mode support
- `static/js/` — Client-side logic (main.js, script.js, spotify.js)
- `static/downloads/` — Temporary file storage (auto-cleaned after 5 min)
- `templates/` — Jinja2 HTML templates (index, youtube, instagram, tiktok, facebook, audiomack, spotify)

## Running the App
- **Development:** `python app.py` (serves on 0.0.0.0:5000)
- **Production:** `gunicorn --bind=0.0.0.0:5000 --reuse-port app:app`

## Dependencies
Install via: `pip install -r requirements.txt`

Key packages: Flask, yt-dlp, requests, python-dotenv, gunicorn, werkzeug

## Workflow
- Workflow: "Start application" → `python app.py` on port 5000
- Deployment: autoscale via gunicorn

## Features
- Real-time download progress tracking (UUID-based)
- Automatic file cleanup (5-minute TTL)
- Responsive dark/light mode UI
- Support for 1000+ platforms via yt-dlp
