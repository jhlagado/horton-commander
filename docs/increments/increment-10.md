# Increment 10: selected-file size

Status: accepted after `npm run check` passed increments 0–10 and the
independent Astra review found no concrete issues. The review checked the
open/query/close lifecycle, size-cache invalidation, decimal formatting,
register and stack preservation, screen width, tests, and artifact metadata.

The active panel's status line now shows the selected file's logical record
count. One CP/M record is 128 bytes. The count is exact at the record level;
the final record may include padding, so Horton does not present it as an exact
byte length. When no entry is selected, the status line shows `-- rec`.

The display uses BDOS function 35 after opening the selected file, then closes
the FCB. It caches the last selected drive and name to avoid repeating the
directory lookup on unrelated redraws. A panel refresh invalidates the cached
size. If a selection has gone stale and cannot be opened, the status shows an
unavailable marker rather than reusing a prior count.

`node test/increment-10.mjs` runs the built program in the clean four-drive
Triptych profile. It verifies the count for the executable, a one-record file,
a 129-record multi-extent file, a 16,000-record file, and a genuine zero-record
file created through CP/M BDOS. It also switches panels, checks an empty drive,
and compares all four disk images after the size queries.

## Artifact

- `HORTON.COM`: 11,355 bytes, loaded at `$0100`.
- Increase from increment 9: 361 bytes.
- SHA-256: `e7675913f15ce5944442192c4e16daeee4058044f12fa5763964376c9273e945`.
- ATOM revision: `802b5c2d320bec777f427755ff2d7338e3b80a05`.
- Triptych test revision: `1153c239963d0d38f1de978a7de6c2dcb9999a9f`.
