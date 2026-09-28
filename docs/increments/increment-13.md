# Increment 13: show approximate sizes in both panels

Status: accepted after the complete Triptych test suite and independent Astra
review; no review blockers remain.

## Design

Increment 10 added the selected file's exact CP/M logical-record count to the
status line. This increment also gives each visible filename an approximate
KiB figure, so a user can compare files without moving the selection.

CP/M BDOS reports a file's logical record count in units of 128 bytes. It does
not report the exact byte length of the final record or a portable physical
sector size. Horton rounds the record count up to a whole KiB and prefixes the
result with `~`. A one-record file shows `~0001K`; a 129-record file shows
`~0017K`; an empty file shows `~0000K`.

Each panel still caches only its 18 visible entries. A row now contains the
11-byte CP/M name and a two-byte size value, increasing the two panel caches
from 396 to 468 bytes. After caching the visible first extents, Horton makes a
second directory pass and combines the record counts for all extents belonging
to those visible files. It then reuses the figures for redraws. A refresh
updates both panels. The status line continues to report the exact record
count for the active selection.

ATOM limits each source part to 65,535 bytes. The entry source now includes
`main.asm` and the size-specific `sizes.asm` as separate parts, keeping both
within that limit while allowing their labels to link normally.

## Acceptance

- Prove one-record, multi-record, a 32 KiB estimate, multi-extent, empty and
  large files.
- Prove size display in both panels and on the last rows of the 18-entry cache.
- Page forward and back, checking that the visible sizes follow their names.
- Keep the selected-file record count accurate and unchanged.
- Confirm size queries leave all four disk images unchanged.
- Run every earlier increment scenario against the rebuilt executable.
- Complete an independent Astra review before acceptance; the review found no
blockers.

## Current evidence

`node test/increment-13.mjs` and the complete `npm run check` pass on
Triptych's four-drive `triptych-cpu-v0.1-2m-n04` profile. The test covers one
record (`~0001K`), 129 records across extents (`~0017K`), 256 records
(`~0032K`), a 16,000-record file (`~2000K`), an empty file (`~0000K`), both
panels, all 18 cached rows, and the next page. It also checks the exact
selected-file record count and unchanged disk images.

The combined `HORTON.COM` remains 18,578 bytes because the fixed editor segment
starts at `$3400`; its SHA-256 is
`fa985c299b7ced926e92ab7fe675e0057bf5d3f19c0e9f80dd3e0a0f6d43ad00`. The
build map records the Horton and editor segment boundaries.
At this increment's checkpoint, the hosted disk-image preview remained on
increment 11 and the combined build was not yet distributed. The current
`HC.COM` recipe was added later under GPL-3.0-or-later, with corresponding
source and notices published from this repository.
