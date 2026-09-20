# Render the narrated screenshot walkthrough

The renderer uses actual application screenshots, a simple branded frame and Windows text-to-speech. It labels the result a **narrated screenshot walkthrough**, uses clearly synthetic demo data, and does not imply a continuous live recording or a human narrator. It does not upload to YouTube.

Requirements: Windows PowerShell with `System.Speech`, plus `ffmpeg` and `ffprobe` on `PATH`. The repository's renderer is `scripts/render-demo.ps1`.

Prepare 7-8 actual UI screenshots in `.artifacts/demo/`, then create `.artifacts/demo/manifest.json`:

```json
{
  "title": "ReceiveRight",
  "rate": 0,
  "targetDurationSeconds": 165,
  "shots": [
    {
      "image": ".artifacts/demo/01-overview.png",
      "title": "One clear record for every delivery",
      "caption": "The actual application workspace. Demonstration names and delivery data are synthetic.",
      "narration": "Write the narration for the actual screenshot here. Describe only the visible application and verified implementation."
    }
  ]
}
```

Repeat the shot object for each captured screen. Aim for 310-360 spoken words in total, adjusted after listening. An optional `voice` property selects an installed Windows voice by its exact name; `rate` defaults to zero. An optional per-shot `durationSeconds` gives that shot a minimum dwell time. Titles should be brief; captions support at most two lines.

```powershell
powershell.exe -NoProfile -File scripts/render-demo.ps1
```

The default output is `output/video/ReceiveRight-Demo.mp4`, accompanied by a transcript and rendering report. Both source screenshot paths and actual duration are recorded. The target is 165 seconds; the script rejects narration that cannot fit below 175 seconds and verifies the final file stays below three minutes. It preserves the entire screenshot, scaled to fit, without inventing application UI or obscuring it with captions.

Review the output visually and listen to the narration before publishing. Confirm the title/caption text, readable interface, accurate provider labels, total duration, and successful audio/video playback. Replace the YouTube field in `docs/SUBMISSION.md` only after the actual public or unlisted upload exists.
