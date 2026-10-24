# Style feature availability review — 2026-10-24

The existing visual design and preset libraries are retained. Two nested scroll
containers could make the bottom controls difficult to reach. Style panels now
have a bounded, keyboard-focusable internal scroll region; header/navigation and
thumbnail export actions stay outside it. Canvas settings retain their own scroll.

| Feature group | Inventory and verification |
| --- | --- |
| Caption presets | All 11 presets present in source and live DOM: Hormozi Viral, Instagram Neon, Ali Abdaal, Story Marker, Cyber TikTok, Cinematic Sub, Retro 3D Pop, Karaoke Badge, GSAP Words Slide, GSAP 3D Roll, GSAP Split Letters. Preset configuration/export suite passed for each. |
| Caption colors/mode | Primary/active color palettes and Phrase Glow/Solo Word/Kinetic buttons present. Color reset and preset state isolation covered by existing suite. |
| Caption tabs | Presets, Text, Effects, Badge, Position opened in live browser. Typography, layout sliders, animation/highlight selectors and emoji controls were present. |
| Custom styles | Save Style and account-scoped custom preset store retained; new users have no saved personal presets. |
| Thumbnail presets | All 6 present in live DOM and canvas preset suite: Hormozi Punch, Cyber Neon, Clean Minimalist, Cinema Gold, Breaking Alert, Glass Card Box. Last items require scrolling. |
| Thumbnail tabs | Presets, Text, Typography, Badge, Position opened in live browser. Effects are grouped into Typography/Position, not removed. |
| Thumbnail badge | Advanced controls appear when Enable Badge Element is ON. Live test revealed spacing presets, 10 quick badges, 5 visual styles, 3 shapes, palettes, border, font size/weight, padding and letter spacing. Returned toggle to OFF after inspection. |
| Fonts and backgrounds | 48 curated fonts, 6 gradients and project/custom background source remain. Font picker/search and gradients remain explicit controls. |
| Export | PNG, JPEG and Set as Reel Image actions remain. No new media was exported in this browser inspection. |

## Verification limits

The preset suite, 15 server regression suites and production build passed locally.
Live browser inspection checked availability, tab navigation and badge reveal.
It did not test every possible slider value, external font download, animation
frame, export combination or mobile/desktop dimension. Do not label those as
fully tested. Account-specific custom presets from another account/browser are
intentionally hidden; built-in preset libraries remain available to everyone.

## Related fixes in this deployment

- Temporary Gemini errors retry up to three attempts with exponential backoff;
  auth errors are not retried, long Retry-After cooldowns are respected, and audio
  payloads are preserved. A nonblocking inline message and Retry transcription
  replace the browser alert. Sustained provider overload can still fail.
- Logout dispatches a workspace save before revoking the session. Page hide and
  backgrounding also flush the pending Reel Maker autosave. Account-scoped tests
  verify uploaded audio metadata survives logout/login and stays hidden from a
  second account. This is browser restoration, not durable cloud media storage.
- D1/R2 persistence remains pending; browser metadata alone cannot recover an
  audio file lost when Render restarts or redeploys.
