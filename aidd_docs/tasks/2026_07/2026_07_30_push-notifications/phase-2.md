---
status: done
---

# Instruction: PWA installability (manifest + icons)

## Architecture projection

```txt
.
└── web/
    ├── index.html ✏️ link manifest, apple-touch-icon, theme-color
    └── public/
        ├── manifest.json ✅
        ├── icon-192.png ✅ generated from favicon.svg via ImageMagick (already installed, no new tooling)
        └── icon-512.png ✅
```

## Wireframe

No new screen - this phase has no UI of its own, it's what makes "Add to Home Screen" produce a real installed app icon/splash instead of a bare bookmark.

## Tasks to do

### `1)` Generate PNG icons from the existing SVG

1. `magick web/public/favicon.svg -resize 192x192 web/public/icon-192.png` and the same at 512x512 - confirmed `magick`/`convert` are already installed on this system, no new dependency. iOS in particular wants real PNG, not SVG, for its home-screen icon.

### `2)` `manifest.json`

1. `name`/`short_name`: "UmbraChat". `display: "standalone"` (removes browser chrome once installed - also whether push works at all on iOS depends on this being a real standalone-display PWA, not just a bookmarked tab). `start_url: "/"`. `icons`: the two PNGs just generated, at their real sizes with the correct `type: "image/png"`.
2. `background_color`/`theme_color`: pull the actual values already defined in `index.css`'s `--bg`/`--accent` custom properties, don't invent new ones the installed app's splash screen would then mismatch against the app's own UI.

### `3)` `index.html` wiring

1. `<link rel="manifest" href="/manifest.json">`.
2. `<link rel="apple-touch-icon" href="/icon-192.png">` - iOS-specific tag, doesn't read `manifest.json`'s `icons` field for this on its own.
3. `<meta name="theme-color" content="...">` matching the manifest's.

## Correction made during implementation

The source `favicon.svg` isn't square (a plain `-resize 192x192` produced 192x184) - fixed with `-gravity center -extent 192x192` to force an exact square canvas after resizing, rather than a distorted or slightly-off-size icon. Separately, `apple-touch-icon.png` needed a solid background color instead of transparency - iOS fills transparent home-screen icons in with black otherwise, an Apple-specific rendering quirk unrelated to the manifest icons.

Verified installability via Chromium's own `Page.getAppManifest` DevTools Protocol call (`"errors": []`, all fields parsed correctly) rather than just eyeballing the JSON file - a real Lighthouse audit wasn't practical to run from this headless environment, but this is the same underlying validation Chromium's installability check itself uses.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------- |
| 1... | Both PNG files exist, are real decodable PNGs at the claimed dimensions, not corrupt/empty output                    |
| 2... | `manifest.json` is valid JSON and passes a browser's own installability check (verify via a real Lighthouse/Chrome DevTools "Installability" audit, not just visual inspection of the file) |
| 3... | Loading the app in a real mobile browser offers "Add to Home Screen" (or the equivalent install prompt) where it didn't before this phase |
