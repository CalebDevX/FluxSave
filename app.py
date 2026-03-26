from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, Response, stream_with_context
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, Response, stream_with_context
import yt_dlp
import os
import time
import uuid
import re
import subprocess
import tempfile
from threading import Thread
import requests
import audiomack_downloader as amdl
import spotify_utils as spdu
import spotify_api as spa

app = Flask(__name__)

# Configuration
DOWNLOAD_FOLDER = os.path.join(tempfile.gettempdir(), 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
# Global dictionary to store download progress
download_progress = {}

# Cookie file support for bypassing YouTube bot detection on hosted servers.
# Set the YOUTUBE_COOKIES env var to the contents of a Netscape-format cookies.txt file.
# If YOUTUBE_COOKIES_FILE is set, it points directly to a cookies file path.
_COOKIE_FILE_PATH = None

def _get_cookie_file():
    """Return a path to a YouTube cookies file, creating one from env var if needed."""
    global _COOKIE_FILE_PATH
    cookies_content = os.environ.get('YOUTUBE_COOKIES', '')
    cookies_file = os.environ.get('YOUTUBE_COOKIES_FILE', '')
    if cookies_file and os.path.isfile(cookies_file):
        return cookies_file
    if cookies_content:
        if _COOKIE_FILE_PATH is None:
            _COOKIE_FILE_PATH = '/tmp/yt_cookies.txt'
        with open(_COOKIE_FILE_PATH, 'w') as f:
            f.write(cookies_content)
        return _COOKIE_FILE_PATH
    return None


def resolve_spotify_url(url: str) -> str:
    """
    Resolve Spotify short links / redirects to a canonical open.spotify.com URL.
    This helps spotify_utils parsing because it expects a direct path like /track/<id>.
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        }
        # Follow redirects (spotify.link, share links, etc.)
        resp = requests.get(url, allow_redirects=True, timeout=10, headers=headers)
        if resp.url:
            return resp.url
    except Exception:
        # Fall back to original URL if redirect resolution fails.
        return url
    return url

# File cleanup function
def cleanup_old_files():
    """Remove files older than 5 minutes"""
    while True:
        try:
            current_time = time.time()
            for filename in os.listdir(DOWNLOAD_FOLDER):
                filepath = os.path.join(DOWNLOAD_FOLDER, filename)
                if os.path.isfile(filepath):
                    file_age = current_time - os.path.getmtime(filepath)
                    if file_age > 300:  # 5 minutes
                        os.remove(filepath)
                        print(f"Cleaned up old file: {filename}")
        except Exception as e:
            print(f"Cleanup error: {e}")
        time.sleep(60)  # Check every minute

# Start cleanup thread
cleanup_thread = Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/youtube-downloader')
def youtube_downloader():
    return render_template('youtube.html')

@app.route('/tiktok-downloader')
def tiktok_downloader():
    return render_template('tiktok.html')

@app.route('/instagram-downloader')
def instagram_downloader():
    return render_template('instagram.html')

@app.route('/facebook-downloader')
def facebook_downloader():
    return render_template('facebook.html')

@app.route('/spotify-downloader')
def spotify_downloader():
    return render_template('spotify.html')

@app.route('/audiomack-downloader')
def audiomack_downloader():
    return render_template('audiomack.html')

def _parse_duration_to_seconds(val):
    """Convert duration value to seconds. Handles int (ms), float, or string like '3:45'."""
    if not val:
        return 0
    if isinstance(val, (int, float)):
        # If value > 1000 it's probably milliseconds
        return int(val / 1000) if val > 1000 else int(val)
    if isinstance(val, str):
        val = val.strip()
        if ':' in val:
            parts = val.split(':')
            try:
                if len(parts) == 2:
                    return int(parts[0]) * 60 + int(parts[1])
                if len(parts) == 3:
                    return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            except Exception:
                return 0
        try:
            n = float(val)
            return int(n / 1000) if n > 1000 else int(n)
        except Exception:
            return 0
    return 0


@app.route('/spotify-search', methods=['POST'])
def spotify_search():
    """Search Spotify for tracks and return results for the home page search feature."""
    try:
        data = request.get_json()
        query = (data or {}).get('query', '').strip()
        if not query:
            return jsonify({'success': False, 'error': 'Search query is required'}), 400

        results = []

        # Try official Spotify API only if credentials are configured
        client_id = os.environ.get('SPOTIFY_CLIENT_ID')
        bearer = os.environ.get('SPOTIFY_BEARER_TOKEN')
        if client_id or bearer:
            try:
                raw = spdu.search_tracks(query, limit=15)
                for t in raw:
                    thumb = ''
                    images = t.get('images') or []
                    if images:
                        # prefer medium-size image (index 1 if available)
                        thumb = images[min(1, len(images)-1)].get('url', '')
                    artists = t.get('artists') or []
                    if isinstance(artists, str):
                        artists = [artists]
                    results.append({
                        'title': t.get('name') or t.get('title') or '',
                        'artists': artists,
                        'album': t.get('album') or '',
                        'duration': _parse_duration_to_seconds(t.get('duration_ms') or 0),
                        'thumbnail': thumb,
                        'spotify_url': t.get('spotify_url') or t.get('external_urls', {}).get('spotify') or '',
                    })
            except Exception:
                pass

        # Use external search API (jerrycoder / okatsu) - handles different field schemas
        if not results:
            try:
                raw = spa.search_spotify_external(query)
                for t in raw:
                    # jerrycoder schema: trackName, artist (str), image, spotifyUrl, durationMs (str like "3:45")
                    # okatsu schema: title, artists (list), thumbnail, spotify_url, duration_ms (int)
                    title = (t.get('trackName') or t.get('title') or t.get('name') or '').strip()
                    raw_artist = t.get('artist') or t.get('artists') or []
                    if isinstance(raw_artist, str):
                        artists = [raw_artist] if raw_artist else []
                    elif isinstance(raw_artist, list):
                        artists = raw_artist
                    else:
                        artists = []
                    thumbnail = (t.get('image') or t.get('thumbnail') or t.get('cover') or '').strip()
                    spotify_url = (t.get('spotifyUrl') or t.get('spotify_url') or t.get('url') or '').strip()
                    duration = _parse_duration_to_seconds(
                        t.get('durationMs') or t.get('duration_ms') or t.get('duration') or 0
                    )
                    if title:
                        results.append({
                            'title': title,
                            'artists': artists,
                            'album': t.get('album') or '',
                            'duration': duration,
                            'thumbnail': thumbnail,
                            'spotify_url': spotify_url,
                        })
            except Exception:
                pass

        return jsonify({'success': True, 'results': results})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/privacy.html')
def privacy():
    return render_template('privacy.html')

@app.route('/terms.html')
def terms():
    return render_template('terms.html')

@app.route('/sw.js')
def service_worker():
    return send_from_directory('.', 'sw.js', mimetype='application/javascript')

@app.route('/robots.txt')
def robots():
    return send_from_directory('.', 'robots.txt', mimetype='text/plain')

@app.route('/serve/<path:filename>')
def serve_download(filename):
    """Serve a file from the downloads folder forcing browser download (not inline playback)."""
    from flask import make_response
    resp = make_response(send_from_directory(DOWNLOAD_FOLDER, filename))
    resp.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp

@app.route('/ads.txt')
def ads_txt():
    return send_from_directory('.', 'ads.txt', mimetype='text/plain')

@app.route('/stream-spotify/<path:filename>')
@app.route('/stream-spotify')
def stream_spotify(filename=None):
    """
    Stream a Spotify track directly to the user's device without saving to disk.
    Finds the song on YouTube, pipes yt-dlp + ffmpeg output straight to the browser.
    The filename is embedded in the URL path so browsers use it as the download name.
    Query params:
      q – search query (track title + artist)
    """
    query = request.args.get('q', '').strip()

    if not query:
        return jsonify({'error': 'Query required'}), 400

    # Derive safe filename from URL path segment (strip .mp3 extension if present)
    if filename:
        display_name = filename
        if display_name.lower().endswith('.mp3'):
            display_name = display_name[:-4]
    else:
        display_name = request.args.get('name', 'audio').strip()

    # Sanitise filename – strip characters that are illegal in filenames
    safe_name = re.sub(r'[\\/:*?"<>|]', '_', display_name)[:150] or 'audio'

    # Use yt-dlp Python library (no subprocess) so this works on serverless hosts
    # like Vercel that don't have yt-dlp / ffmpeg binaries installed.
    _stream_cookie = _get_cookie_file()
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['tv_embedded', 'ios', 'web'],
            }
        },
    }
    if _stream_cookie:
        ydl_opts['cookiefile'] = _stream_cookie

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f'ytsearch1:{query}', download=False)
            if not info or not info.get('entries'):
                return jsonify({'error': 'No results found'}), 404
            entry = info['entries'][0]
            # Get the best audio format URL
            formats = entry.get('formats', [])
            audio_url = None
            audio_ext = 'webm'
            # Prefer m4a for broadest browser compatibility, then webm/opus
            for fmt in sorted(formats, key=lambda f: f.get('abr', 0) or 0, reverse=True):
                if fmt.get('vcodec') == 'none' and fmt.get('url'):
                    audio_url = fmt['url']
                    audio_ext = fmt.get('ext', 'webm')
                    break
            # Fallback: use the best overall url
            if not audio_url and entry.get('url'):
                audio_url = entry['url']
                audio_ext = entry.get('ext', 'webm')
    except Exception as e:
        return jsonify({'error': f'Could not find track: {str(e)}'}), 500

    if not audio_url:
        return jsonify({'error': 'Could not extract audio URL'}), 500

    # Determine mimetype from extension
    mime_map = {'m4a': 'audio/mp4', 'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'opus': 'audio/ogg'}
    mimetype = mime_map.get(audio_ext, 'audio/webm')
    download_ext = 'mp3' if audio_ext == 'mp3' else audio_ext

    def generate():
        try:
            resp = requests.get(audio_url, stream=True, timeout=30, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            })
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk
        except Exception:
            return

    import urllib.parse
    encoded_name = urllib.parse.quote(f'{safe_name}.{download_ext}')
    content_disposition = (
        f'attachment; filename="{safe_name}.{download_ext}"; '
        f"filename*=UTF-8''{encoded_name}"
    )
    headers = {
        'Content-Disposition': content_disposition,
        'X-Accel-Buffering': 'no',
    }
    return Response(
        stream_with_context(generate()),
        mimetype=mimetype,
        headers=headers,
    )

@app.route('/fetch_info', methods=['POST'])
def fetch_info():
    url = ''
    ydl_opts = {}
    try:
        data = request.get_json()
        url = data.get('url')

        if not url:
            return jsonify({'error': 'URL is required'}), 400

        # If this is a Spotify URL, use the Spotify API helper to fetch metadata (preview URL when available)
        url_lower = url.lower()
        if 'spotify.com' in url_lower:
            try:
                resolved_url = resolve_spotify_url(url)
                info = spdu.extract_info(resolved_url)

                # Build audio_formats similar to yt-dlp structure (preview URLs only)
                audio_formats = []
                for f in info.get('formats', []):
                    if not f.get('url'):
                        continue
                    ext = f.get('ext', 'mp3')
                    audio_formats.append({
                        'format_id': f.get('format_id') or 'preview',
                        'quality': 'Preview',
                        'ext': ext,
                        'filesize': 'Unknown'
                    })

                # Add a fallback option: use Spotify metadata to find a YouTube match and download audio.
                # This does NOT download from Spotify; it downloads from YouTube search results.
                audio_formats.insert(0, {
                    'format_id': 'spotify_youtube',
                    'quality': 'YouTube Match (MP3)',
                    'ext': 'mp3',
                    'filesize': 'Unknown'
                })

                return jsonify({
                    'success': True,
                    'title': info.get('title', 'Unknown Title'),
                    'thumbnail': info.get('thumbnail', ''),
                    'uploader': info.get('uploader', 'Unknown'),
                    'duration': info.get('duration') or 'Unknown',
                    'video_formats': [],
                    'audio_formats': audio_formats[:8]
                })
            except Exception as e:
                return jsonify({'error': f'Spotify extractor error: {str(e)}'}), 400

        # If this is an Audiomack URL, use the custom extractor instead of yt-dlp
        if 'audiomack.com' in url_lower:
            try:
                info = amdl.extract_info(url)

                # Build audio_formats similar to yt-dlp structure
                audio_formats = []
                for f in info.get('formats', []):
                    ext = f.get('ext', 'mp3')
                    audio_formats.append({
                        'format_id': f.get('format_id') or f.get('ext'),
                        'quality': 'Audio',
                        'ext': ext,
                        'filesize': 'Unknown'
                    })

                return jsonify({
                    'success': True,
                    'title': info.get('title', 'Unknown Title'),
                    'thumbnail': info.get('thumbnail', ''),
                    'uploader': info.get('uploader', 'Unknown'),
                    'duration': info.get('duration') or 'Unknown',
                    'video_formats': [],
                    'audio_formats': audio_formats[:8]
                })
            except Exception as e:
                return jsonify({'error': f'Audiomack extractor error: {str(e)}'}), 400

        # Enhanced options for Instagram and other platforms
        #
        # Note: YouTube frequently changes. Over-specifying headers/clients can break extraction.
        # Keep YouTube settings conservative to avoid "Failed to extract any player response".
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'socket_timeout': 30,
            'retries': 5,
            'geo_bypass': True,
            'geo_bypass_country': 'US',
            'age_limit': None,
            'nocheckcertificate': True,
            'force_ipv4': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            'extractor_args': {
                'instagram': {
                    'include_stories': True,
                    'include_highlights': True,
                },
                'twitter': {
                    'api': 'syndication',
                },
                'tiktok': {
                    'api': 'mobile_app',
                    'webpage_download': True,
                },
                'youtube': {
                    # tv_embedded and ios clients bypass bot-detection on server IPs
                    # without requiring sign-in cookies.
                    'player_client': ['tv_embedded', 'ios', 'web'],
                },
                'facebook': {
                    'legacy_api': False,
                },
            },
            'force_generic_extractor': False,
        }
        cookie_file = _get_cookie_file()
        if cookie_file:
            ydl_opts['cookiefile'] = cookie_file

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            if info is None:
                return jsonify({'error': 'Could not extract media information'}), 400

            # Get video formats
            video_formats = []
            audio_formats = []

            if 'formats' in info and info['formats']:
                for f in info['formats']:
                    # Video formats (has video and optionally audio)
                    if f.get('vcodec') != 'none':
                        quality = f.get('format_note', f.get('quality', 'Unknown'))
                        height = f.get('height', 0)
                        ext = f.get('ext', 'mp4')
                        filesize = f.get('filesize', 0) or f.get('filesize_approx', 0)
                        filesize_mb = round(filesize / (1024 * 1024), 2) if filesize else 'Unknown'

                        video_formats.append({
                            'format_id': f.get('format_id'),
                            'quality': f"{height}p" if height else quality,
                            'ext': ext,
                            'filesize': filesize_mb
                        })

                    # Audio-only formats
                    elif f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                        abr = f.get('abr', 0)
                        ext = f.get('ext', 'mp3')
                        filesize = f.get('filesize', 0) or f.get('filesize_approx', 0)
                        filesize_mb = round(filesize / (1024 * 1024), 2) if filesize else 'Unknown'

                        audio_formats.append({
                            'format_id': f.get('format_id'),
                            'quality': f"{int(abr)}kbps" if abr else 'Audio',
                            'ext': ext,
                            'filesize': filesize_mb
                        })

                # Remove duplicates and sort
                video_formats = list({v['format_id']: v for v in video_formats}.values())
                audio_formats = list({a['format_id']: a for a in audio_formats}.values())

                video_formats = sorted(video_formats, key=lambda x: int(x['quality'].replace('p', '')) if x['quality'].replace('p', '').isdigit() else 0, reverse=True)
                audio_formats = sorted(audio_formats, key=lambda x: int(x['quality'].replace('kbps', '')) if 'kbps' in x['quality'] else 0, reverse=True)

            return jsonify({
                'success': True,
                'title': info.get('title', 'Unknown Title'),
                'thumbnail': info.get('thumbnail', ''),
                'uploader': info.get('uploader', 'Unknown'),
                'duration': info.get('duration_string', 'Unknown'),
                'video_formats': video_formats[:15],
                'audio_formats': audio_formats[:8]
            })

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        print(f"Download Error: {error_msg}")

        # Detect platform from URL for accurate error messages
        platform = 'unknown'
        if url:
            url_lower = url.lower()
            if 'tiktok.com' in url_lower or 'vm.tiktok.com' in url_lower:
                platform = 'tiktok'
            elif 'instagram.com' in url_lower:
                platform = 'instagram'
            elif 'youtube.com' in url_lower or 'youtu.be' in url_lower:
                platform = 'youtube'
            elif 'twitter.com' in url_lower or 'x.com' in url_lower:
                platform = 'twitter'
            elif 'facebook.com' in url_lower or 'fb.watch' in url_lower or 'fb.me' in url_lower:
                platform = 'facebook'
            elif 'spotify.com' in url_lower:
                platform = 'spotify'
            elif 'audiomack.com' in url_lower:
                platform = 'audiomack'
            elif 'soundcloud.com' in url_lower:
                platform = 'soundcloud'
            elif 'vimeo.com' in url_lower:
                platform = 'vimeo'
            elif 'netflix.com' in url_lower:
                platform = 'netflix'

        # Platform-specific error handling with detailed messages
        if platform == 'tiktok':
            if 'Unable to extract' in error_msg or 'webpage video data' in error_msg or 'video data' in error_msg.lower():
                return jsonify({'error': '📱 TikTok Error: Unable to access this video. Possible reasons:\n• Video is private or deleted\n• Account is private\n• Video is region-locked\n• TikTok is blocking automated access\n\nSolutions:\n✓ Make sure the video is public\n✓ Try a different TikTok video\n✓ Wait 2-3 minutes and try again\n✓ Copy the link directly from TikTok app/website'}), 400
            elif 'Login required' in error_msg or 'sign in' in error_msg.lower():
                return jsonify({'error': '📱 TikTok requires login to access this content. Only public videos from public accounts can be downloaded without authentication.'}), 400
            else:
                return jsonify({'error': '📱 TikTok download failed. The video may be unavailable or TikTok is blocking requests. Wait 2-3 minutes and try again with a different video.'}), 400

        elif platform == 'instagram':
            if 'rate-limit' in error_msg.lower() or 'rate limit' in error_msg.lower():
                return jsonify({'error': '📸 Instagram Rate Limit: Too many requests detected.\n\nSolutions:\n✓ Wait 5-10 minutes before trying again\n✓ Instagram blocks automated downloads temporarily\n✓ Try a different post in the meantime\n✓ Make sure the post is public'}), 400
            elif 'login required' in error_msg.lower() or 'authentication' in error_msg.lower():
                return jsonify({'error': '📸 Instagram Login Required: This content requires authentication.\n\nPossible reasons:\n• Post is from a private account\n• Content is age-restricted\n• Instagram is blocking automated access\n\nOnly public posts and reels can be downloaded.'}), 400
            elif 'not available' in error_msg.lower() or 'content is not available' in error_msg.lower():
                return jsonify({'error': '📸 Instagram Content Unavailable:\n• Post may be deleted or made private\n• Story/Highlight has expired\n• Account is private or blocked\n• Region restrictions apply\n\nTry a different public post or reel.'}), 400
            elif 'private' in error_msg.lower():
                return jsonify({'error': '📸 This Instagram account/post is private. Only public content can be downloaded.'}), 400
            else:
                return jsonify({'error': '📸 Instagram Error: Unable to fetch content. Instagram may be blocking requests.\n\nSolutions:\n✓ Wait 5-10 minutes and try again\n✓ Make sure the post/reel is public\n✓ Try copying the link directly from Instagram app\n✓ Use a different public post'}), 400

        elif platform == 'youtube':
            if 'private' in error_msg.lower() or 'unavailable' in error_msg.lower():
                return jsonify({'error': '🎬 YouTube video is private, deleted, or unavailable in your region.'}), 400
            elif 'age' in error_msg.lower() or 'restricted' in error_msg.lower():
                return jsonify({'error': '🔞 This YouTube video is age-restricted and requires login to access.'}), 400
            elif 'live' in error_msg.lower():
                return jsonify({'error': '📡 Live streams cannot be downloaded. Wait until the stream ends and try again.'}), 400
            else:
                return jsonify({'error': '🎬 YouTube download failed. The video may be region-locked, removed, or have download restrictions.'}), 400

        elif platform == 'facebook':
            if 'login required' in error_msg.lower() or 'private' in error_msg.lower():
                return jsonify({'error': '📘 Facebook content is private or requires login. Only public videos can be downloaded.'}), 400
            else:
                return jsonify({'error': '📘 Facebook download failed. Make sure the video is public and not from a private group or profile.'}), 400

        elif platform == 'twitter':
            if 'no video' in error_msg.lower() or 'no media' in error_msg.lower():
                return jsonify({'error': '😕 This tweet doesn\'t contain a video. We can only download tweets with video content.'}), 400
            elif 'private' in error_msg.lower() or 'protected' in error_msg.lower():
                return jsonify({'error': '🔒 This Twitter/X account is private. Only public tweets can be downloaded.'}), 400
            else:
                return jsonify({'error': '❌ Twitter/X download failed. Make sure the tweet is public and contains video content.'}), 400

        elif platform == 'spotify':
            return jsonify({'error': '🎧 Spotify Error: Spotify uses DRM protection and requires premium subscription.\n\nThis content cannot be downloaded directly. Spotify restricts downloading to prevent piracy.'}), 400

        elif platform == 'audiomack':
            return jsonify({'error': '🎵 Audiomack download failed.\n\nPossible reasons:\n• Track is premium-only\n• Content is region-locked\n• Link is invalid\n\nSolutions:\n✓ Make sure the track is publicly available\n✓ Copy the link directly from Audiomack\n✓ Try a different free track'}), 400

        elif platform == 'soundcloud':
            if 'private' in error_msg.lower():
                return jsonify({'error': '🎶 This SoundCloud track is private. Only public tracks can be downloaded.'}), 400
            else:
                return jsonify({'error': '🎶 SoundCloud download failed. Make sure the track is public and not premium-only.'}), 400

        elif platform == 'vimeo':
            if 'password' in error_msg.lower() or 'private' in error_msg.lower():
                return jsonify({'error': '🎥 This Vimeo video is password-protected or private. Only public videos can be downloaded.'}), 400
            else:
                return jsonify({'error': '🎥 Vimeo download failed. The video may have download restrictions or be private.'}), 400

        elif platform == 'netflix':
            return jsonify({'error': '🎬 Netflix content is DRM-protected and cannot be downloaded. This is a copyright restriction enforced by Netflix.'}), 400

        # Generic error handling for other platforms
        if 'DRM' in error_msg or 'protected' in error_msg.lower():
            return jsonify({'error': '🔒 This content is DRM-protected and cannot be downloaded due to copyright restrictions.'}), 400
        elif '429' in error_msg or 'Too Many Requests' in error_msg or 'rate limit' in error_msg.lower():
            return jsonify({'error': '⏰ Rate Limit Reached: Too many requests.\n\nPlease wait 5-10 minutes and try again. The platform is temporarily blocking automated downloads.'}), 400
        elif 'geo' in error_msg.lower() or 'region' in error_msg.lower():
            return jsonify({'error': '🌍 This content is region-locked and not available in your location.'}), 400
        elif 'private' in error_msg.lower():
            return jsonify({'error': '🔒 This content is private. Only public content can be downloaded.'}), 400
        elif 'login' in error_msg.lower() or 'sign in' in error_msg.lower() or 'authentication' in error_msg.lower():
            return jsonify({'error': '🔐 Login required. Only public content can be downloaded without authentication.'}), 400
        elif 'no video' in error_msg.lower() or 'no media' in error_msg.lower():
            return jsonify({'error': '📭 No video found. This post may contain only images or text.'}), 400
        else:
            return jsonify({'error': f'⚠️ Download Error: Unable to access this content.\n\nPossible reasons:\n• Content is unavailable or deleted\n• Platform is blocking automated access\n• Link is invalid\n\nPlease try:\n✓ Checking if the content is public\n✓ Waiting a few minutes and trying again\n✓ Using a different link'}), 400

    except Exception as e:
        error_message = str(e)
        print(f"ERROR: {error_message}")

        # Detect platform from URL
        platform = 'unknown'
        if url:
            url_lower = url.lower()
            if 'instagram.com' in url_lower:
                platform = 'instagram'
            elif 'tiktok.com' in url_lower:
                platform = 'tiktok'
            elif 'youtube.com' in url_lower or 'youtu.be' in url_lower:
                platform = 'youtube'
            elif 'facebook.com' in url_lower or 'fb.watch' in url_lower:
                platform = 'facebook'
            elif 'twitter.com' in url_lower or 'x.com' in url_lower:
                platform = 'twitter'
            elif 'spotify.com' in url_lower:
                platform = 'spotify'
            elif 'audiomack.com' in url_lower:
                platform = 'audiomack'
            elif 'netflix.com' in url_lower:
                platform = 'netflix'

        # Provide more helpful, user-friendly error messages based on detected platform
        if platform == 'twitter':
            if 'no video' in error_message.lower():
                error_message = "😕 This tweet doesn't have a video. We can only download tweets that contain videos."
            else:
                error_message = "❌ Couldn't access this Twitter/X content. Make sure the tweet is public and contains media."
        elif platform == 'instagram':
            error_message = "📸 Instagram temporarily blocked this request. Please wait 2-3 minutes and try again. Make sure you're using a public post or reel link."
        elif platform == 'tiktok':
            error_message = "📱 TikTok download failed. Make sure the video is public and the link is correct. If it's a private account, we can't access it."
        elif platform == 'audiomack':
            error_message = "🎵 Couldn't download from Audiomack. Please check the link and make sure the song is publicly available. Try copying the link directly from your browser."
        elif 'spotify' in error_message.lower() or (url and 'spotify.com' in url.lower()):
            error_message = "🎧 Spotify content couldn't be accessed. Make sure the track/playlist is public and the link is correct."
        elif 'netflix' in error_message.lower() or (url and 'netflix.com' in url.lower()):
            error_message = "🎬 Netflix content is DRM-protected and cannot be downloaded. This is due to copyright restrictions."
        elif 'tiktok' in error_message.lower() or (url and 'tiktok.com' in url.lower()):
            error_message = "📱 TikTok download failed. Make sure the video is public and the link is correct."
        elif 'facebook' in error_message.lower() or (url and 'facebook.com' in url.lower()):
            error_message = "📘 Facebook content couldn't be accessed. Only public videos can be downloaded. Private or friends-only posts won't work."
        elif 'youtube' in error_message.lower() or (url and ('youtube.com' in url.lower() or 'youtu.be' in url.lower())):
            if 'private' in error_message.lower():
                error_message = "🔒 This YouTube video is private or unavailable."
            elif 'age' in error_message.lower():
                error_message = "🔞 Age-restricted YouTube content cannot be downloaded without login."
            else:
                error_message = "🎬 YouTube download failed. The video might be region-locked, removed, or live-streamed."
        elif 'soundcloud' in error_message.lower() or (url and 'soundcloud.com' in url.lower()):
            error_message = "🎶 SoundCloud download failed. Make sure the track is public and not premium-only."
        elif 'vimeo' in error_message.lower() or (url and 'vimeo.com' in url.lower()):
            error_message = "🎥 Vimeo content couldn't be accessed. Only public videos without download restrictions can be downloaded."
        elif 'unsupported' in error_message.lower():
            error_message = "❓ This website is not supported yet. We support YouTube, Spotify, Audiomack, Netflix, Instagram, TikTok, Facebook, and 1000+ other platforms."
        elif 'url' in error_message.lower() or 'invalid' in error_message.lower():
            error_message = "🔗 Invalid link format. Please copy and paste the full URL from your browser."
        else:
            error_message = f"⚠️ Something went wrong: {error_message}. Please try again or use a different link."

        return jsonify({'error': error_message}), 400


def progress_hook(d, download_id):
    """Hook function to track download progress"""
    if d['status'] == 'downloading':
        # Calculate progress percentage
        if 'total_bytes' in d or 'total_bytes_estimate' in d:
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)

            if total > 0:
                percentage = int((downloaded / total) * 100)
            else:
                percentage = 0

            # Calculate speed and ETA
            speed = d.get('speed', 0)
            eta = d.get('eta', 0)

            download_progress[download_id] = {
                'status': 'downloading',
                'percentage': percentage,
                'downloaded': downloaded,
                'total': total,
                'speed': speed if speed else 0,
                'eta': eta if eta else 0
            }
        else:
            download_progress[download_id] = {
                'status': 'downloading',
                'percentage': 0,
                'message': 'Starting download...'
            }
    elif d['status'] == 'finished':
        download_progress[download_id] = {
            'status': 'processing',
            'percentage': 100,
            'message': 'Processing file...'
        }

@app.route('/progress/<download_id>')
def get_progress(download_id):
    """Endpoint to check download progress"""
    progress = download_progress.get(download_id, {'status': 'not_found', 'percentage': 0})
    return jsonify(progress)

@app.route('/start_download', methods=['POST'])
def start_download():
    """Initialize download and return download_id for progress tracking"""
    try:
        data = request.get_json()
        url = data.get('url')
        format_id = data.get('format_id')
        download_type = data.get('type', 'video')

        if not url:
            return jsonify({'error': 'URL is required'}), 400

        # Generate unique download ID
        download_id = str(uuid.uuid4())
        timestamp = int(time.time())

        # Initialize progress
        download_progress[download_id] = {
            'status': 'starting',
            'percentage': 0,
            'message': 'Initializing download...',
            'timestamp': timestamp,
            'type': download_type
        }

        # Return download_id immediately so client can start polling
        return jsonify({
            'success': True,
            'download_id': download_id
        })

    except Exception as e:
        return jsonify({'error': f'Failed to start download: {str(e)}'}), 500

@app.route('/download', methods=['POST'])
def download():
    """Start an asynchronous download worker and return immediately.

    The actual download runs in a daemon thread so the request doesn't block the
    gunicorn worker (Render may kill long-running requests). Clients should poll
    `/progress/<download_id>` for status and fetch `/static/downloads/...` when
    complete.
    """
    data = request.get_json()
    url = data.get('url')
    format_id = data.get('format_id')
    download_type = data.get('type', 'video')
    download_id = data.get('download_id')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    if not download_id:
        return jsonify({'error': 'Download ID is required'}), 400

    timestamp = int(time.time())

    # initialize/mark status
    download_progress[download_id] = {
        'status': 'queued',
        'percentage': 0,
        'message': 'Download queued',
        'timestamp': timestamp,
        'type': download_type
    }

    def worker(url, fmt_id, d_type, d_id, ts):
        try:
            # mark as starting
            download_progress[d_id] = {'status': 'downloading', 'percentage': 0, 'message': 'Starting download...'}
            # If Audiomack, use custom downloader
            if 'spotify.com' in (url or '').lower():
                try:
                    resolved_url = resolve_spotify_url(url)
                    info = spdu.extract_info(resolved_url)
                except Exception as e:
                    download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': str(e)}
                    time.sleep(10)
                    download_progress.pop(d_id, None)
                    return

                # Option A: "Spotify → YouTube match (MP3)" fallback (like the bot approach).
                # This does NOT download from Spotify; it searches YouTube using Spotify metadata.
                if d_type == 'audio':
                    title = (info.get('title') or '').strip()
                    uploader = (info.get('uploader') or '').strip()

                    # Heuristic: if oEmbed title looks like "Song - Artist", split it.
                    artist = uploader
                    if (not artist or artist.lower() in ('spotify', 'unknown')) and ' - ' in title:
                        parts = [p.strip() for p in title.split(' - ', 1)]
                        if len(parts) == 2 and parts[0] and parts[1]:
                            title, artist = parts[0], parts[1]

                    query = ' '.join([p for p in [title, artist] if p]).strip()
                    if not query:
                        download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': 'Could not build a YouTube search query from this Spotify link.'}
                        time.sleep(10)
                        download_progress.pop(d_id, None)
                        return

                    download_progress[d_id] = {'status': 'downloading', 'percentage': 0, 'message': f'Finding a YouTube match for: {query}'}

                    output_template = os.path.join(DOWNLOAD_FOLDER, f'audio_{ts}.%(ext)s')
                    _sp_cookie = _get_cookie_file()
                    ydl_opts = {
                        'format': 'bestaudio/best',
                        'outtmpl': output_template,
                        'quiet': True,
                        'no_warnings': True,
                        'progress_hooks': [lambda d: progress_hook(d, d_id)],
                        'postprocessors': [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                            'preferredquality': '320',
                        }],
                        'socket_timeout': 30,
                        'retries': 5,
                        'geo_bypass': True,
                        'nocheckcertificate': True,
                        'force_ipv4': True,
                        'extractor_args': {
                            'youtube': {
                                'player_client': ['tv_embedded', 'ios', 'web'],
                            }
                        },
                        'http_headers': {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                            'Accept': '*/*',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        **(({'cookiefile': _sp_cookie}) if _sp_cookie else {}),
                    }

                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([f'ytsearch1:{query}'])

                    downloaded_files = [f for f in os.listdir(DOWNLOAD_FOLDER) if f.startswith(f'audio_{ts}')]
                    if not downloaded_files:
                        download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': 'No file was created'}
                        time.sleep(10)
                        download_progress.pop(d_id, None)
                        return

                    download_filename = downloaded_files[0]
                    download_url = f'/serve/{download_filename}'
                    download_progress[d_id] = {'status': 'complete', 'percentage': 100, 'message': 'Download complete!', 'download_url': download_url}
                    time.sleep(10)
                    download_progress.pop(d_id, None)
                    return

                # Option B: Spotify preview URL (only when available)
                chosen = None
                for f in info.get('formats', []):
                    if f.get('url'):
                        chosen = f
                        break

                if not chosen or not chosen.get('url'):
                    download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': 'No preview available for this Spotify resource. Try the "YouTube Match (MP3)" option instead.'}
                    time.sleep(10)
                    download_progress.pop(d_id, None)
                    return

                url_to_dl = chosen.get('url')
                ext = chosen.get('ext') or ('mp3' if url_to_dl.lower().endswith('.mp3') else url_to_dl.split('.')[-1].split('?')[0])
                out_name = f"{d_type}_{ts}.{ext}"
                out_path = os.path.join(DOWNLOAD_FOLDER, out_name)

                def progress_cb_sp(d):
                    if d.get('status') == 'downloading':
                        downloaded = d.get('downloaded_bytes', 0)
                        total = d.get('total_bytes', 0)
                        percentage = int((downloaded / total) * 100) if total else d.get('percentage', 0)
                        download_progress[d_id] = {
                            'status': 'downloading',
                            'percentage': percentage,
                            'downloaded': downloaded,
                            'total': total,
                            'speed': d.get('speed', 0),
                        }
                    elif d.get('status') == 'finished':
                        download_progress[d_id] = {
                            'status': 'processing',
                            'percentage': 100,
                            'message': 'Processing file...'
                        }

                try:
                    amdl.download_direct(url_to_dl, out_path, progress_callback=progress_cb_sp)
                except Exception as e:
                    download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': str(e)}
                    time.sleep(10)
                    download_progress.pop(d_id, None)
                    return

                download_url = f'/serve/{out_name}'
                download_progress[d_id] = {
                    'status': 'complete',
                    'percentage': 100,
                    'message': 'Download complete!',
                    'download_url': download_url
                }

                time.sleep(10)
                download_progress.pop(d_id, None)
                return

            if 'audiomack.com' in (url or '').lower():
                try:
                    info = amdl.extract_info(url)
                except Exception as e:
                    download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': str(e)}
                    time.sleep(10)
                    download_progress.pop(d_id, None)
                    return

                # pick first direct audio format (prefer mp3)
                chosen = None
                for f in info.get('formats', []):
                    u = f.get('url')
                    if not u:
                        continue
                    if u.lower().endswith('.mp3'):
                        chosen = f
                        break
                    if '.mp3' in u.lower():
                        chosen = f
                if not chosen and info.get('formats'):
                    chosen = info['formats'][0]

                if not chosen or not chosen.get('url'):
                    download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': 'No direct audio URL found for Audiomack'}
                    time.sleep(10)
                    download_progress.pop(d_id, None)
                    return

                # determine extension
                url_to_dl = chosen.get('url')
                ext = chosen.get('ext') or ('mp3' if url_to_dl.lower().endswith('.mp3') else url_to_dl.split('.')[-1].split('?')[0])
                out_name = f"{d_type}_{ts}.{ext}"
                out_path = os.path.join(DOWNLOAD_FOLDER, out_name)

                def progress_cb(d):
                    # d contains: status, downloaded_bytes, total_bytes, percentage, speed
                    if d.get('status') == 'downloading':
                        downloaded = d.get('downloaded_bytes', 0)
                        total = d.get('total_bytes', 0)
                        percentage = int((downloaded / total) * 100) if total else d.get('percentage', 0)
                        download_progress[d_id] = {
                            'status': 'downloading',
                            'percentage': percentage,
                            'downloaded': downloaded,
                            'total': total,
                            'speed': d.get('speed', 0),
                        }
                    elif d.get('status') == 'finished':
                        download_progress[d_id] = {
                            'status': 'processing',
                            'percentage': 100,
                            'message': 'Processing file...'
                        }

                try:
                    amdl.download_direct(url_to_dl, out_path, progress_callback=progress_cb)
                except Exception as e:
                    download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': str(e)}
                    time.sleep(10)
                    download_progress.pop(d_id, None)
                    return

                # completed
                download_url = f'/serve/{out_name}'
                download_progress[d_id] = {
                    'status': 'complete',
                    'percentage': 100,
                    'message': 'Download complete!',
                    'download_url': download_url
                }

                time.sleep(10)
                download_progress.pop(d_id, None)
                return

            _yt_extractor_args = {
                'youtube': {
                    'player_client': ['tv_embedded', 'ios', 'web'],
                }
            }
            _yt_common = {
                'quiet': True,
                'no_warnings': True,
                'socket_timeout': 30,
                'retries': 5,
                'geo_bypass': True,
                'nocheckcertificate': True,
                'force_ipv4': True,
                'extractor_args': _yt_extractor_args,
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            }
            _cookie_file = _get_cookie_file()
            if _cookie_file:
                _yt_common['cookiefile'] = _cookie_file

            if d_type == 'audio':
                output_template = os.path.join(DOWNLOAD_FOLDER, f'audio_{ts}.%(ext)s')
                chosen_fmt = fmt_id if fmt_id else 'bestaudio/best'
                ydl_opts = {
                    **_yt_common,
                    'format': chosen_fmt,
                    'outtmpl': output_template,
                    'progress_hooks': [lambda d: progress_hook(d, d_id)],
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '320',
                    }],
                }
            else:
                output_template = os.path.join(DOWNLOAD_FOLDER, f'video_{ts}.%(ext)s')
                chosen_fmt = fmt_id if fmt_id else 'bestvideo+bestaudio/best'
                ydl_opts = {
                    **_yt_common,
                    'format': chosen_fmt,
                    'outtmpl': output_template,
                    'merge_output_format': 'mp4',
                    'progress_hooks': [lambda d: progress_hook(d, d_id)],
                }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # find created file
            downloaded_files = [f for f in os.listdir(DOWNLOAD_FOLDER) if f.startswith(f'{d_type}_{ts}')]

            if not downloaded_files:
                download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': 'No file was created'}
                time.sleep(10)
                download_progress.pop(d_id, None)
                return

            download_filename = downloaded_files[0]
            download_url = f'/serve/{download_filename}'

            download_progress[d_id] = {
                'status': 'complete',
                'percentage': 100,
                'message': 'Download complete!',
                'download_url': download_url
            }

            # schedule cleanup of progress entry
            time.sleep(10)
            download_progress.pop(d_id, None)

        except Exception as e:
            download_progress[d_id] = {'status': 'error', 'percentage': 0, 'message': str(e)}
            time.sleep(10)
            download_progress.pop(d_id, None)

    # Start background thread to perform the actual download so the request doesn't block
    Thread(target=worker, args=(url, format_id, download_type, download_id, timestamp), daemon=True).start()

    return jsonify({'success': True, 'download_id': download_id, 'message': 'Download started'}), 202

if __name__ == '__main__':
    # For local development
    app.run(host='0.0.0.0', port=5000, debug=False)

# For production WSGI server (required by shared hosting)
# The 'app' object is what the server will use
