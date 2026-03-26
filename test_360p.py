#!/usr/bin/env python
import json
import sys
sys.path.insert(0, '.')

# Test the format filtering with a sample video
import yt_dlp

url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
print(f"Testing with URL: {url}\n")

with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True}) as ydl:
    info = ydl.extract_info(url, download=False)
    
    # Extract video formats
    formats = info.get('formats', [])
    video_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('acodec') == 'none']
    
    # Sort by height descending (like in app.py)
    video_formats = sorted(video_formats, key=lambda x: x.get('height') or 0, reverse=True)
    
    print("✓ Video formats extracted from yt-dlp:")
    print(f"  Total extracted: {len(video_formats)} formats")
    
    # Simulate what app.py does now (limited to 25)
    limited_formats = video_formats[:25]
    print(f"\n✓ After limiting to first 25: {len(limited_formats)} formats")
    
    # Check if 360p is present
    has_360p = any(f.get('height') == 360 for f in limited_formats)
    print(f"\n{'✓' if has_360p else '✗'} 360p present: {has_360p}")
    
    if has_360p:
        print("\nFormats including 360p:")
        for i, f in enumerate(limited_formats[-5:]):  # Show last 5 (lower resolutions)
            height = f.get('height', 'N/A')
            fmt_id = f.get('format_id')
            ext = f.get('ext')
            print(f"  {height}p ({fmt_id}) - {ext}")
    else:
        print("\n✗ ERROR: 360p not in limited formats")
        print("Last 5 formats in list:")
        for i, f in enumerate(limited_formats[-5:]):
            height = f.get('height', 'N/A')
            fmt_id = f.get('format_id')
            ext = f.get('ext')
            print(f"  {height}p ({fmt_id}) - {ext}")
