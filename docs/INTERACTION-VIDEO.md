# Recorded interaction demo

`scripts/render-interaction-demo.ps1` turns timestamped browser captures into an MP4 with generated narration. Every source image must be an actual captured application frame. It does not invent interface states, interpolate motion, accelerate interactions, upload a video, or publish anything.

The visible label reads **Recorded app interactions · Synthetic demo · Generated narration**. Pauses between separately captured sections are omitted. Within each section, the original intervals between frames are preserved at normal speed, rounded to the 30 fps output clock. If narration needs more time, the renderer holds the final frame. This is a recording assembled from browser captures, not a claim of uninterrupted desktop capture or a human narrator.

## Capture contract

Put each section's actual PNG captures in `.artifacts/interaction-demo/<sectionId>/`. In that folder, write `frames.json`:

```json
[
  { "file": "C:/absolute/path/to/0001.png", "atMs": 0 },
  { "file": "C:/absolute/path/to/0002.png", "atMs": 248 },
  { "file": "C:/absolute/path/to/0003.png", "atMs": 617 }
]
```

Use the capture clock rather than invented equal intervals. Every section needs at least two frames. Timestamps must increase by at least 34 ms; more frequent frames cannot all be represented in a 30 fps output and are rejected. The first timestamp is normalized to zero, so a small delay before the first capture is not mistaken for footage. Keep the browser viewport constant within each section. Use synthetic receiving records and avoid capturing workspace recovery codes, live private supplier links, account information, or other secrets.

Create `.artifacts/interaction-demo/manifest.json`:

```json
{
  "title": "ReceiveRight",
  "rate": 0,
  "targetDurationSeconds": 170,
  "sections": [
    {
      "id": "01",
      "title": "Review the invoice as the delivery arrives",
      "caption": "Actual browser interactions with a synthetic invoice.",
      "narration": "Describe the visible interaction and verified behavior here.",
      "frames": ".artifacts/interaction-demo/01/frames.json"
    }
  ]
}
```

Paths resolve from the repository root; absolute paths also work. Provide one to twelve sections. Titles have a 95-character limit, captions a 175-character single-line limit, and the project title an 18-character limit. An optional `voice` selects an installed Windows voice; `rate` defaults to zero and permits values from -2 to 3.

## Render and inspect

Requirements: Windows PowerShell with `System.Speech`, plus `ffmpeg` and `ffprobe` on `PATH`.

```powershell
powershell.exe -NoProfile -File scripts/render-interaction-demo.ps1
```

Default outputs:

- `output/video/ReceiveRight-Live-Demo.mp4` — H.264/AAC, 1920×1080, 30 fps.
- `output/video/ReceiveRight-Live-Demo.srt` — subtitles timed from Windows speech word events.
- `output/video/ReceiveRight-Live-Demo.transcript.txt` — spoken script and section order.
- `output/video/ReceiveRight-Live-Demo.plan.json` — measured source/narration durations, also written when footage is too long.
- `output/video/ReceiveRight-Live-Demo.render.json` — verified duration, source frame timestamps/hashes, final-frame holds, dimensions, interface area, output hash and disclosure metadata.

The entire application frame stays visible. A 16:9 source occupies approximately 81% of the output area; narrow heading and caption bars sit outside it. Other source aspect ratios receive padding, and their measured coverage is reported.

The renderer uses the longer of narration or source footage for each section, then adds any remaining target time as final-frame holds. It refuses a plan over 178.5 seconds and verifies the final MP4 is at most 179 seconds. If the source is too long, it reports the segment timings instead of removing frames or speeding up the recording. Shorten narration or intentionally re-record a shorter interaction; do not falsify timestamps to fit.

Review representative opening, middle, and closing frames, listen to the audio, and inspect the SRT before publishing. Verify actual playback, provider labels, readable interface text, completed actions, and the measured duration. The MP4 and local captures are ignored by Git. Add a YouTube URL to submission answers only after a real public or unlisted upload exists.
