import requests
import re
import json
import time
import os
from urllib.parse import urlparse

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


def _find_json_ld(html_text):
    m = re.search(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html_text, re.S | re.I)
    if not m:
        return None
    try:
        return json.loads(m.group(1).strip())
    except Exception:
        return None


def _find_direct_audio_urls(html_text):
    # Look for direct .mp3 or m3u8 links in the page
    urls = re.findall(r'https?://[\w\-/._?=&%]+\.(?:mp3|m3u8)(?:\?[^"\'>\s]+)?', html_text)
    # Deduplicate while preserving order
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            out.append(u)
            seen.add(u)
    return out


def extract_info(url):
    """Extract basic metadata and possible direct audio URLs from an Audiomack page.

    Returns a dict similar to yt-dlp's info dict with keys: title, thumbnail, uploader,
    duration (seconds), and formats list (each with format_id, ext, url).
    """
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=15)
    except requests.Timeout:
        raise Exception('Request timed out while accessing Audiomack track.')
    except requests.RequestException as e:
        raise Exception(f'Failed to access Audiomack track: {e}')

    if resp.status_code == 403:
        raise Exception('This track is not publicly accessible. It may be premium-only or region-restricted.')
    elif resp.status_code == 404:
        raise Exception('Track not found. It may have been deleted or made private.')
    elif resp.status_code != 200:
        raise Exception(f'Failed to access Audiomack track (HTTP {resp.status_code})')

    text = resp.text

    info = {
        'title': None,
        'thumbnail': None,
        'uploader': None,
        'duration': None,
        'formats': []
    }

    # Try JSON-LD first
    json_ld = _find_json_ld(text)
    if json_ld:
        info['title'] = json_ld.get('name') or json_ld.get('headline') or info['title']
        image = json_ld.get('image')
        if isinstance(image, list):
            info['thumbnail'] = image[0]
        else:
            info['thumbnail'] = image
        author = json_ld.get('author')
        if isinstance(author, dict):
            info['uploader'] = author.get('name')
        elif isinstance(author, str):
            info['uploader'] = author

        audio = json_ld.get('audio')
        if isinstance(audio, dict):
            content = audio.get('contentUrl') or audio.get('url')
            if content:
                ext = 'mp3' if content.lower().endswith('.mp3') else content.split('.')[-1].split('?')[0]
                info['formats'].append({'format_id': 'audio', 'ext': ext, 'url': content})

    # Fall back to og: meta tags
    if not info['title']:
        m = re.search(r'<meta property="og:title" content="([^"]+)"', text, re.I)
        if m:
            info['title'] = m.group(1)

    if not info['thumbnail']:
        m = re.search(r'<meta property="og:image" content="([^"]+)"', text, re.I)
        if m:
            info['thumbnail'] = m.group(1)

    if not info['uploader']:
        m = re.search(r'<meta name="author" content="([^"]+)"', text, re.I)
        if m:
            info['uploader'] = m.group(1)

    # Search for direct audio urls in page
    direct = _find_direct_audio_urls(text)
    for u in direct:
        ext = 'mp3' if u.lower().endswith('.mp3') else ('m3u8' if '.m3u8' in u.lower() else u.split('.')[-1])
        info['formats'].append({'format_id': ext, 'ext': ext, 'url': u})

    # Deduplicate formats by url
    seen_urls = set()
    formats = []
    for f in info['formats']:
        if f.get('url') and f['url'] not in seen_urls:
            formats.append(f)
            seen_urls.add(f['url'])

    info['formats'] = formats

    # Basic duration extraction (optional)
    m = re.search(r'"duration"\s*:\s*"PT?(?:(\d+)M)?(?:(\d+)S)?"', text)
    if m:
        mins = int(m.group(1) or 0)
        secs = int(m.group(2) or 0)
        info['duration'] = mins * 60 + secs

    # Final sanity checks
    if not info['title']:
        parsed = urlparse(url)
        info['title'] = parsed.path.strip('/').split('/')[-1] or 'Audiomack Track'

    return info


def download_direct(url, output_path, progress_callback=None, timeout=15):
    """Stream-download a direct audio URL to disk and report progress via progress_callback.

    progress_callback receives a dictionary with keys: status, downloaded_bytes, total_bytes.
    """
    # Stream the file and write to disk with progress reporting
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, stream=True, timeout=timeout)
    except requests.Timeout:
        raise Exception('Download timed out. Please try again.')
    except requests.ConnectionError:
        raise Exception('Connection error. Please check your internet connection.')
    except requests.RequestException as e:
        raise Exception(f'Failed to download audio: {e}')

    if resp.status_code == 403:
        raise Exception('Access denied. The track may be premium-only or not available in your region.')
    if resp.status_code == 404:
        raise Exception('The audio file was not found. The track may have been removed.')
    if resp.status_code != 200:
        raise Exception(f'Failed to download audio (HTTP {resp.status_code})')

    total = int(resp.headers.get('Content-Length') or 0)
    downloaded = 0
    start = time.time()

    # Ensure output directory exists (important on Render disk mount)
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)

    try:
        with open(output_path, 'wb') as fh:
            for chunk in resp.iter_content(chunk_size=8192):
                if not chunk:
                    continue
                fh.write(chunk)
                downloaded += len(chunk)
                if progress_callback:
                    elapsed = time.time() - start
                    speed = int(downloaded / elapsed) if elapsed > 0 else 0
                    percentage = int((downloaded / total) * 100) if total else 0
                    progress_callback({
                        'status': 'downloading',
                        'downloaded_bytes': downloaded,
                        'total_bytes': total,
                        'percentage': percentage,
                        'speed': speed
                    })

        # finished
        if progress_callback:
            progress_callback({
                'status': 'finished',
                'downloaded_bytes': downloaded,
                'total_bytes': total,
                'percentage': 100
            })
    except IOError as e:
        raise Exception(f'Failed to write audio file: {str(e)}. Check disk space and permissions.')

