import requests
import urllib.parse

# Lightweight wrapper around public Spotify helper APIs used as a fallback
# Provides search and resolve (download link) functionality when Spotify
# preview URLs are not available from the official API.

JERRYCODER_SEARCH = 'https://jerrycoder.oggyapi.workers.dev/spotify?search='
JERRYCODER_RESOLVE = 'https://jerrycoder.oggyapi.workers.dev/dspotify?url='
OKATSU_SEARCH = 'https://okatsu-rolezapiiz.vercel.app/search/spotify?q='

def search_spotify_external(query, timeout=10):
    """Search tracks using external public helpers. Returns list of tracks or [] on failure."""
    if not query:
        return []

    enc = urllib.parse.quote_plus(query)

    # Try primary (jerrycoder)
    try:
        r = requests.get(JERRYCODER_SEARCH + enc, timeout=timeout)
        if r.status_code == 200:
            data = r.json()
            if data.get('status') == 'success' and data.get('tracks'):
                return data.get('tracks')
    except Exception:
        pass

    # Fallback to okatsu
    try:
        r = requests.get(OKATSU_SEARCH + enc, timeout=timeout)
        if r.status_code == 200:
            data = r.json()
            if data.get('status') and data.get('result'):
                return data.get('result')
    except Exception:
        pass

    return []


def resolve_spotify_download_external(spotify_url, timeout=15):
    """Resolve a Spotify track URL to a downloadable link using external helpers.

    Returns dict with keys: status (bool), title, artist, download_link (url) on success
    or {'status': False, 'error': '...'} on failure.
    """
    if not spotify_url:
        return {'status': False, 'error': 'No URL provided'}

    enc = urllib.parse.quote_plus(spotify_url)

    # Try jerrycoder dspotify
    try:
        r = requests.get(JERRYCODER_RESOLVE + enc, timeout=timeout)
        if r.status_code == 200:
            data = r.json()
            if data.get('status') == 'success' and data.get('download_link'):
                return {
                    'status': True,
                    'title': data.get('title'),
                    'artist': data.get('artist'),
                    'duration': data.get('duration'),
                    'thumbnail': data.get('thumbnail'),
                    'download_link': data.get('download_link')
                }
    except Exception:
        pass

    return {'status': False, 'error': 'Could not resolve download link'}
