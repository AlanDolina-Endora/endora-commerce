---
'@endora-commerce/mod-settings': patch
---

The Settings screen no longer shows one sales channel's values under another channel's heading. A settings list that was still loading when the administrator changed "Editing for" (after a reset, a save or a conflict refresh) used to re-baseline every unedited row with the previously selected context when it arrived — a channel override could appear empty, or show the "All channels" text, and could be edited and saved under the wrong channel. The response is now read in the context selected when it arrives.
