# Horton Commander preview image

This preview is a 2 MiB Triptych CP/M disk image for the four-drive
`triptych-cpu-v0.1-2m-n04` profile. Its A: disk is based on Triptych's retained
`system-2m-n04` image, with `HORTON.COM` added. The Triptych launch page uses A:
for this read-only published image and creates a persistent writable B: copy,
plus blank persistent C: and D: disks.

The image is served as a static file next to `system.json`; the descriptor
records its exact length and SHA-256. Triptych fetches and verifies both the
image and its CP/M resident system before booting it.

This is a preview release. The direct external-system launch seeds all four
drives so Horton can scan its configured A:–D: range immediately. Run
`npm run preview` after `npm run build` to rebuild the image from the pinned
Triptych disk-library base and the current `dist/HORTON.COM`.

## Provenance

- Base system image: Triptych disk-library asset
  `library-system-2m-n04-20f331a4b984a4a580dd191cec5f8aca78071067e8495741e54edc4b70933f92.img`.
- Current Horton program: `HORTON.COM`, assembled with ATOM commit
  `802b5c2d320bec777f427755ff2d7338e3b80a05`. The descriptor names the exact
  image digest; the image filename includes its SHA-256.
- Existing CP/M residents and tools retain their provenance and distribution
  terms from the Triptych disk-library admission record.

This resource does not replace or modify any browser-local saved disk.
