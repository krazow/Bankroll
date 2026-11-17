# Tutorial video

How the [tutorial video](https://youtube.com/shorts/_pYxyl0TdmM) was made. Run from the repo root (needs Playwright, Python with Pillow, ffmpeg with libass, and the Inter font).

1. Build the beta site (for the "beta keeps its own data" scene): `python3 ../release-kit/scripts/kit.py build-web --channel beta --out /tmp/vbeta`
2. `node tools/video/capture.mjs`: fills the app with made-up data and screenshots each scene (4× phone resolution) into `/tmp/vid/shots`, plus a manifest of captions and timings.
3. `python3 tools/video/compose.py`: one 2160×3840 frame per scene (title, phone, section progress). Set `S = 1` at the top for 1080×1920.
   All text stays inside the YouTube Shorts safe area (clear of the top ~230 px, the bottom ~520 px where the channel
   name and title sit, and the right ~190 px button column, in 1080×1920 terms). The subtitles go under each title.
4. `python3 tools/video/render.py`: one clip per section with crossfades, joined, with a silent AAC track: `/tmp/vid/bankroll-tutorial-4k.mp4`.
5. `python3 tools/video/subs.py`: writes `bankroll-tutorial.srt` and burns the subtitles in: `/tmp/vid/bankroll-tutorial-shorts-4k.mp4`.

`media/thumbnail.dc.html` is the source of the YouTube thumbnail (1280×720), made on a Claude design canvas.
The video files themselves are not kept in git; the published video is on YouTube.
