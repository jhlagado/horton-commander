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
drives so Horton can scan its configured A:–D: range immediately.

## Provenance

- Base system image: Triptych `distribution/disk-library`, source revision
  `62f49d7fada9e5bf714f175ef992d8e89cffbc8a`.
- Horton program: `HORTON.COM`, assembled with ATOM commit
  `802b5c2d320bec777f427755ff2d7338e3b80a05`.
- Existing CP/M residents and tools retain their provenance and distribution
  terms from the Triptych disk-library admission record.

This resource does not replace or modify any browser-local saved disk.
