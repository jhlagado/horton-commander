# Horton Commander architecture

Status: implementation architecture; increments 0–7 are accepted after
Triptych proofs and independent Astra review.

## User outcome

From the Triptych CP/M prompt, a user can run `HORTON`. Horton shows the files
on A: and B: together, makes the active panel clear, and provides a small set
of safe operations. Both panels keep their own drive and selection. A file
operation names its source and destination visibly before it changes the disk.

The first screen follows the supplied NC reference: a top menu,
two file panels, a status area, and an action strip. The first target is
Triptych's 80-column by 24-row ANSI terminal. Essential operations must also
have ordinary-key shortcuts; function-key sequences are optional until their
delivery is proved across the intended keyboards.

## Ownership and interfaces

- Horton owns its screen, panel state, keyboard decoding, CP/M filename input,
  and the policy around user-confirmed file operations.
- Portable CP/M owns drive geometry, directory scanning, record I/O, and disk
  allocation. Horton accesses these through the public BDOS/FCB interface; it
  must not read Triptych disk images or duplicate directory/allocation policy.
- Triptych owns the emulated machine, ANSI presentation, headless/native test
  runners, and eventual distribution of a qualified `HORTON.COM`.
- Edit remains an independent program and repository unless an explicit,
  reviewed integration seam proves better than a documented CP/M handoff.

The program uses explicit FCB drive bytes for A: and B: so that browsing or
copying one panel does not silently change the user's default drive. CP/M has
a flat per-user file namespace rather than nested directories; the first scope
therefore treats each panel as a drive/user-area location, not as a directory
tree. User-number browsing is not in the first useful subset.

The first target is Triptych's four-drive profile,
`triptych-cpu-v0.1-2m-n04`, with A: through D: treated as attached and usable.
That is the current working assumption for Horton; the Triptych scenarios
install media in all four slots, and we can revise the assumption if actual
use shows otherwise. Horton starts with A: and B: in its two panels; the panel
drive selector can choose any of A: through D:. An empty directory is a normal
listing result. If a drive is absent, the current BDOS contract treats access
as a fatal disk error and warm-boots to the CCP, so Horton cannot promise an
in-place error panel for that case.

The target's 2 MiB disk profile has 1,024 directory entries per drive. Older
supported formats have 64 or 512 entries, but they are outside the first
qualification target.
A file can occupy more than one directory extent, but appears once in a
panel. The listing follows the bounded memory of the machine: it caches only
the visible 18 names per panel. The first implementation rescans a directory
from the start when paging and counts first extents so it can reject a page
past the end. Measure navigation time across all 1,024 entries as well as
correctness. Every directory operation invalidates the current search and
requires a fresh scan.

For the selected 2 MiB profile, `EXM=0`: each directory entry describes one
16 KiB logical extent. A listing displays entries with extent number zero,
which shows a multi-extent file once while preserving the first extent's
directory order. Each panel caches only its 18 visible names; paging restarts
the BDOS search and skips earlier first extents. The first listing targets
user area zero, which is the boot default.

The first viewer is bounded to the selected 2 MiB profile. It uses BDOS open,
file-size and random-read calls; displays nine 128-byte records per screen as
two fixed-width rows each; and supports next and previous page. `0x1a` ends
CP/M text, other control bytes become spaces, and high bytes become dots. The
viewer does not change the default drive or either panel's selection. It
currently preserves record content more faithfully than text formatting:
CR/LF bytes are rendered as spaces, so source-file line breaks do not yet
become viewer line breaks. Escape returns to the panels and arrows navigate
pages. An ordinary missing-file status also returns to the panel; fatal BDOS
I/O errors follow the documented warm-boot path.

The screen uses Triptych's supported ANSI cursor, clear-screen, and text
attribute subset. File and control operations remain CP/M calls. This keeps
Triptych-specific presentation separate from the file semantics, while making
no claim that every bare CP/M console supports ANSI colors.

## File-operation policy

- A first copy implementation refuses to overwrite an existing destination.
  This avoids destroying the old file before a replacement is safely written.
- Copy transfers complete CP/M 128-byte records and preserves their bytes,
  including text EOF and record padding. Normal BDOS status returns such as
  directory-full, disk-full, or a name collision can be reported in Horton.
  An absent or write-protected drive and a BIOS sector-I/O failure instead
  leave the program through the fatal warm-boot path; Horton cannot display an
  in-place error or perform cleanup after that transfer.
- Write a copy to the reserved Horton temporary name
  `HCOPY.$$$`, verify it, then
  rename it to the requested destination. Refuse to overwrite existing files.
  On a normal-returning failure, clean up the temporary file when safe. A
  fatal warm boot can leave it behind, so the next launch checks all four
  drives for this reserved name and offers explicit cleanup. The name is
  reserved for Horton. A cross-drive move deletes its source only after the complete
  destination has been verified; the operation is not atomic across a reset
  or disk error.
- A same-drive rename uses BDOS rename. A cross-drive move is copy, verify,
  then delete the source. For normal-returning failures Horton reports which
  copy remains; for a fatal disk failure it leaves recovery to the CCP restart
  and next launch. In the current CP/M implementation, deleting a read-only
  file is fatal: BDOS reports `File R/O` and warm-boots, so a move can leave
  both the verified destination and original source. It must not claim an
  atomic move.
- Delete and any future replacement operation require an explicit
  confirmation. Cancellation leaves the directory unchanged.
- The first release operates on one highlighted file at a time. Multi-select,
  wildcards, recursive deletion, formatting, and directory-tree operations are
  deferred.

## Editor and command handoff

CP/M's normal transient contract loads a `.COM` at 0100h and returns from it to
the warm-boot/CCP path. It does not provide a general child-process call that
returns to the transient program that launched the child. `EDIT.COM` follows
that ordinary exit path. Therefore Horton must not promise that it can call
`EDIT.COM` and resume the same in-memory instance without additional support.

`EDIT.COM` accepts only an unprefixed filename on the current drive. The
baseline is therefore an explicit, restart-based CCP handoff, not a
child-process call. Increment 5 writes a versioned and checksummed, single-use
`B:HORTON.RSM` session record through `B:HORTON.TMP`, verifies it, then shows
the exact CCP commands to select the file's drive, run Edit from A:, restore
the drive that was current when Horton started, and relaunch as
`A:HORTON /R`. The drive-restoration command is necessary because the CCP
returns from a transient on the drive it had selected at launch, even if
Horton changed CP/M's BDOS default drive while it ran. B: is the session drive
because the qualified profile protects the A: system disk and proves B:
writable. Handoff requires writable B: in user area 0. Resume confirms the
saved panel drives and selected names, requires an exactly one-record session
file using BDOS function 35, consumes it before applying state, restores both
panels and selections by name, and restores CP/M's default drive. A normal
launch never resumes a leftover session. No application-to-CCP command
submission API is assumed.

Increment 0 proved the current-drive behavior with the pinned Triptych
artifacts: while A: is current, `A:EDIT ANOTE.NU` opens the A: file; after
`B:` selects B:, `A:EDIT INPUT.NU` loads Edit from A: and opens the file on B:.
Ctrl-Q returns through the CCP to B:, and `A:HORTON` relaunches Horton from A:
while preserving B: as the current drive. This proves the leave/edit/return/
relaunch path; it does not restore Horton's in-memory selection. The detailed
scenario and artifact identities are recorded in
[`increment 0 proof`](increments/increment-0.md).

Arbitrary commands use the same explicit exit, CCP command, and relaunch
pattern: Horton collects a bounded command line, prints it as the next CCP
command, then prints the saved-drive command and resume command below it. The
user enters each at CCP; Horton does not execute stored command text. The first
release will not add a callable editor module or a Triptych supervisor
extension. Either could be considered later if measured workflow evidence
justifies the added interface and resident-memory cost.
The implementation must not patch undocumented resident addresses or rely
on an unbounded transient overlay. Internal file operations and read-only
viewing do not need a process handoff.

## Verification boundary

ATOM builds the actual `HORTON.COM`. Each increment records the artifact's
assembled byte count, static workspace, and any explicit stack/buffer bounds.
Acceptance runs that exact binary under Triptych's CP/M headless machine and
checks raw serial bytes, the rendered terminal state, and resulting A:–D:
files. Native interactive Triptych use is required before release. Emulator
evidence does not imply physical Triptych hardware qualification.
