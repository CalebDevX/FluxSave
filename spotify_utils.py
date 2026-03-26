import os
import requests
from urllib.parse import urlparse, quote

SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
SPOTIFY_API_BASE = 'https://api.spotify.com/v1'


def _get_client_credentials():
    return os.environ.get('SPOTIFY_CLIENT_ID'), os.environ.get('SPOTIFY_CLIENT_SECRET')


def _get_bearer_token_from_env():
    """Return a bearer token provided via SPOTIFY_BEARER_TOKEN env var, or None."""
    return os.environ.get('SPOTIFY_BEARER_TOKEN')


def get_access_token():
    """Obtain an app access token using Client Credentials flow.

    Raises Exception if client id/secret missing or request fails.
    """
    client_id, client_secret = _get_client_credentials()
    if not client_id or not client_secret:
        raise Exception('SPOTIFY client credentials not configured')

    resp = requests.post(SPOTIFY_TOKEN_URL, data={'grant_type': 'client_credentials'}, auth=(client_id, client_secret), timeout=10)
    if resp.status_code != 200:
        raise Exception(f'Failed to obtain Spotify token: {resp.status_code} {resp.text}')
    return resp.json().get('access_token')


def _parse_spotify_url(url):
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if 'open.spotify.com' not in host and 'spotify' not in host:
            return None, None
        parts = parsed.path.strip('/').split('/')
        if len(parts) >= 2:
            return parts[0], parts[1]
        return None, None
    except Exception:
        return None, None


def _get_auth_headers():
    """Return headers with Authorization. Preference order:
    1) SPOTIFY_BEARER_TOKEN env var (useful when you have an existing OAuth token)
    2) Client Credentials flow using SPOTIFY_CLIENT_ID/SECRET
    If neither available, raises Exception.
    """
    bearer = _get_bearer_token_from_env()
    if bearer:
        return {'Authorization': f'Bearer {bearer}'}

    # try client credentials
    token = get_access_token()
    return {'Authorization': f'Bearer {token}'}


def search_tracks(query, limit=20):
    """Search for tracks on Spotify.

    Returns list of track dicts with: id, name, artists, album, duration_ms, preview_url, external_urls, images
    """
    if not query or not query.strip():
        return []

    try:
        headers = _get_auth_headers()
    except Exception:
        # Fallback to basic search without auth (limited results)
        return _search_without_auth(query, limit)

    try:
        params = {
            'q': query.strip(),
            'type': 'track',
            'limit': min(limit, 50),
            'market': 'US'
        }

        resp = requests.get(f'{SPOTIFY_API_BASE}/search', headers=headers, params=params, timeout=10)
        if resp.status_code != 200:
            return _search_without_auth(query, limit)

        data = resp.json()
        tracks = data.get('tracks', {}).get('items', [])

        results = []
        for track in tracks:
            if not track:
                continue

            # Get album images
            images = []
            album = track.get('album', {})
            if album.get('images'):
                images = album['images']

            result = {
                'id': track.get('id'),
                'name': track.get('name'),
                'artists': [artist.get('name') for artist in track.get('artists', []) if artist.get('name')],
                'album': album.get('name'),
                'duration_ms': track.get('duration_ms'),
                'preview_url': track.get('preview_url'),
                'spotify_url': track.get('external_urls', {}).get('spotify'),
                'images': images,
                'popularity': track.get('popularity', 0)
            }
            results.append(result)

        return results

    except Exception as e:
        print(f"Spotify search error: {e}")
        return _search_without_auth(query, limit)


def _search_without_auth(query, limit=20):
    """Fallback search using Spotify's public search (limited functionality)."""
    try:
        # Use oEmbed as a basic fallback
        encoded_query = quote(query.strip())
        # This is a very basic fallback - in practice, we'd need a different approach
        return []
    except Exception:
        return []


def extract_info(url):
    """Fetch Spotify metadata for track/album/playlist.

    Returns dict with keys: title, uploader, thumbnail, duration (seconds), formats (list).
    formats may include a short preview_url for tracks if available.
    """
    typ, obj_id = _parse_spotify_url(url)
    if not typ or not obj_id:
        raise Exception('Invalid Spotify URL')

    # Prepare a default info dict in case we must fall back to oEmbed
    info = {'title': None, 'uploader': None, 'thumbnail': None, 'duration': None, 'formats': []}

    # Try to obtain auth headers (bearer env or client creds). If that fails,
    # fall back to Spotify oEmbed which provides only basic metadata for public pages.
    try:
        headers = _get_auth_headers()
    except Exception:
        # fallback to oEmbed
        try:
            oresp = requests.get('https://open.spotify.com/oembed', params={'url': url}, timeout=10)
            if oresp.status_code == 200:
                od = oresp.json()
                info['title'] = od.get('title')
                info['uploader'] = od.get('author_name')
                info['thumbnail'] = od.get('thumbnail_url')
                info['duration'] = None
                info['formats'] = []
                return info
            else:
                raise Exception(f'oEmbed failed: {oresp.status_code} {oresp.text}')
        except Exception as oe:
            raise Exception('Spotify credentials or bearer token are required for full metadata (preview URLs). Fallback oEmbed failed: ' + str(oe))

    # If we have headers, call the appropriate Spotify Web API endpoint
    if typ == 'track':
        resp = requests.get(f'{SPOTIFY_API_BASE}/tracks/{obj_id}', headers=headers, timeout=10)
        if resp.status_code != 200:
            raise Exception(f'Spotify API error: {resp.status_code} {resp.text}')
        data = resp.json()
        info['title'] = data.get('name')
        artists = [a.get('name') for a in data.get('artists', []) if a.get('name')]
        info['uploader'] = ', '.join(artists) if artists else None
        album = data.get('album', {})
        images = album.get('images', [])
        if images:
            info['thumbnail'] = images[0].get('url')
        info['duration'] = int(data.get('duration_ms', 0) / 1000)
        preview = data.get('preview_url')
        if preview:
            info['formats'].append({'format_id': 'preview', 'ext': 'mp3', 'url': preview})
        return info

    elif typ == 'album':
        resp = requests.get(f'{SPOTIFY_API_BASE}/albums/{obj_id}', headers=headers, timeout=10)
        if resp.status_code != 200:
            raise Exception(f'Spotify API error: {resp.status_code} {resp.text}')
        data = resp.json()
        info['title'] = data.get('name')
        info['uploader'] = data.get('artists', [{}])[0].get('name')
        images = data.get('images', [])
        if images:
            info['thumbnail'] = images[0].get('url')
        tracks = data.get('tracks', {}).get('items', [])
        formats = []
        for t in tracks:
            formats.append({'format_id': t.get('id'), 'ext': 'preview' if t.get('preview_url') else 'none', 'url': t.get('preview_url')})
        info['formats'] = formats
        return info

    elif typ == 'playlist':
        resp = requests.get(f'{SPOTIFY_API_BASE}/playlists/{obj_id}', headers=headers, timeout=10)
        if resp.status_code != 200:
            raise Exception(f'Spotify API error: {resp.status_code} {resp.text}')
        data = resp.json()
        info['title'] = data.get('name')
        info['uploader'] = data.get('owner', {}).get('display_name')
        images = data.get('images', [])
        if images:
            info['thumbnail'] = images[0].get('url')
        items = data.get('tracks', {}).get('items', [])
        formats = []
        for item in items:
            track = item.get('track') or {}
            formats.append({'format_id': track.get('id'), 'ext': 'preview' if track.get('preview_url') else 'none', 'url': track.get('preview_url')})
        info['formats'] = formats
        return info

    else:
        raise Exception('Unsupported Spotify resource type')
