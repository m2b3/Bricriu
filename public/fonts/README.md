# Markdown preview fonts

Bricriu bundles unmodified upstream WOFF2 files for offline Markdown preview and printing:

- **IBM Plex Sans**: regular, italic, semibold, semibold italic, bold and bold italic, from [IBM/plex](https://github.com/IBM/plex). Copyright © 2017 IBM Corp.; Reserved Font Name "Plex". [Full SIL Open Font License 1.1](ibm-plex-sans/OFL.txt).
- **Lilex**: variable upright and italic fonts, from [mishamyrt/Lilex](https://github.com/mishamyrt/Lilex). Copyright 2019 The Lilex Project Authors. [Full SIL Open Font License 1.1](lilex/OFL.txt). Local filenames omit the upstream `[wght]` suffix; font data and internal names are unchanged.

[sources.json](sources.json) records pinned upstream URLs, commit IDs, sizes and SHA-256 hashes. Fonts and licence texts are copied into the production frontend by Vite and embedded in the Tauri application. No remote font service or system font installation is needed.

The CSS in `src/preview/previewTypography.css` uses the font families, 16px default prose size, 1.5 prose line height, 800px content limit, semibold heading scale, and spacing from Zed's current Markdown preview. References checked on 2026-09-26: [Zed settings](https://github.com/zed-industries/zed/blob/main/assets/settings/default.json) and [Markdown preview style definitions](https://github.com/zed-industries/zed/blob/main/crates/markdown/src/markdown.rs). This is a CSS implementation for Bricriu's WebView; no Zed source code is included.
