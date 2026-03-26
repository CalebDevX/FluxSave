#!/usr/bin/env python3
"""Test all social media platforms to verify they work"""
import requests
import json

FLASK_URL = 'http://localhost:5000'

# Test URLs for each platform
test_urls = {
    'YouTube': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'X (Twitter)': 'https://x.com/elonmusk/status/1234567890',
    'Instagram': 'https://www.instagram.com/p/ABC123/',
    'Facebook': 'https://www.facebook.com/watch?v=1234567890',
    'TikTok': 'https://www.tiktok.com/@tiktok/video/1234567890',
    'Snapchat': 'https://www.snapchat.com/add/username',
    'Pinterest': 'https://www.pinterest.com/pin/123456789/',
}

print("=" * 60)
print("PLATFORM FORMAT EXTRACTION TEST")
print("=" * 60)

for platform, url in test_urls.items():
    print(f"\n📱 Testing {platform}...")
    print(f"   URL: {url}")
    
    try:
        response = requests.post(
            f'{FLASK_URL}/fetch_info',
            json={'url': url},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                videos = data.get('video_formats', [])
                audios = data.get('audio_formats', [])
                print(f"   ✓ SUCCESS")
                print(f"     - Title: {data.get('title', 'N/A')}")
                print(f"     - Video formats: {len(videos)}")
                print(f"     - Audio formats: {len(audios)}")
                if videos:
                    print(f"     - First format: {videos[0].get('quality')} ({videos[0].get('ext')})")
                    print(f"     - Is direct: {videos[0].get('is_direct')}")
            else:
                print(f"   ⚠ WARNING: {data.get('error', 'Unknown error')}")
        else:
            print(f"   ✗ HTTP {response.status_code}")
            try:
                print(f"     Error: {response.json().get('error', response.text[:100])}")
            except:
                print(f"     Response: {response.text[:100]}")
                
    except requests.exceptions.Timeout:
        print(f"   ✗ TIMEOUT (platform may not respond quickly)")
    except requests.exceptions.ConnectionError:
        print(f"   ✗ CONNECTION ERROR (Flask not running?)")
    except Exception as e:
        print(f"   ✗ ERROR: {str(e)}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
