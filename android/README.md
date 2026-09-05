# Play Store listing

`store.txt` is the English source. One file per language beside it, named by the
**Play Console locale code** so it matches the language picker exactly:
`store-de-DE.txt`, `store-pt-BR.txt`, `store-zh-TW.txt` …

Each file holds the three fields Play asks for, in the same order as the form:

    App Name            unchanged in every language — it is the brand
    Short description   max 80 chars   (longest here: 66, Greek)
    Full description    max 4000 chars (longest here: 2241)

## Pasting them in

Play Console → your app → **Grow → Store presence → Store listings** →
pick the language → paste Short and Full description → Save.

App Name never changes, so there is nothing to paste for it.

## Where the text comes from

Generated from the Steam store copy in `scripts/steam-storepage-loc.py`, which is
already translated and reviewed, so both stores say the same thing. The Android
text differs from Steam in four places, applied per language:

- touch is added to the input list (Steam has no touch)
- "Lite Version vs. Full" replaces Steam's "Full Version vs. Demo"
- the free tier is the lite version, not a demo
- the buy line mentions the rewarded video ad, which Steam has no equivalent of

Steam's Remote Play paragraph and its Steam-exclusive bullet are dropped.

To regenerate after changing the Steam copy, re-run the generator rather than
editing these files by hand — they are output, not source.
