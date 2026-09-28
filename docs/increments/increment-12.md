# Increment 12: edit without leaving Horton

Status: accepted after all thirteen Triptych gates passed and the independent
Astra review found no remaining blockers.

## Design

Keep the current `E` action as the restart-based handoff to standalone Edit,
and add `I` for an in-process editing experiment. That makes the changed user
experience easy to compare while preserving the existing command workflow.

The prototype statically links the Edit 0.2.0 source modules into
`HORTON.COM`. Horton prepares an FCB with the selected panel's explicit drive
and filename, then calls an editor entry point. The editor owns the document,
cursor, display, and save transaction while it is active. On exit it restores
the caller's stack, returns to Horton, and Horton redraws the same panel and
selection. The CP/M CCP is not involved in this path.

Other shapes were considered. Keeping only the CCP handoff preserves the
current multi-command return path and does not restore the in-memory panels.
Writing a second small editor would duplicate Edit's tested document and save
logic. Loading the existing `EDIT.COM` as a child is not an ordinary CP/M
operation; its code and workspace use fixed addresses. Statically linking its
source gives the required same-process return and keeps one editor
implementation as the reference for the later source-sharing increment.

The Edit checkout has newer uncommitted work. Horton uses source from the
pinned 0.2.0 commit, leaving those edits untouched. The copied editor source is
GPL-3.0-or-later; this is a private integration experiment, and the combined
executable is not published by this increment.

## Measured memory map

The qualified CP/M TPA spans `$0100` through `$E3FF`, for 58,112 bytes. The
combined `HORTON.COM` is 18,578 bytes, with SHA-256
`8d481c8774a0d2d6838c22220deb24c4bd32fd53af88e876d28fe82bcdff9cdb`, and ends
at `$4992` when loaded at `$0100`.
The separately assembled Edit 0.2.0 segment occupies `$3400`–`$4991` (5,522
bytes). The 622-byte gap before the editor workspace is reserved for growth
without moving the fixed segment.

The editor workspace occupies `$4C00`–`$4DFF` (512 bytes), the document buffer
occupies `$4E00`–`$CDFF` (32 KiB), and the editor stack occupies `$D800`–`$E3FF`
(3 KiB). The document buffer ends 2.5 KiB before the stack. The build checks
segment overlap; the Triptych test exercises the exact document capacity and
the first rejected size.

## Acceptance

- Pressing `I` (also tested with lowercase `i`) on a selected file on B: opens
  it in the editor with B: encoded explicitly in its FCB.
- Edit, save, and exit. Horton returns to the same panel, drive, and selected
  filename, including when CP/M moves the directory entry after the file grows;
  its size display reflects the saved record count.
- Verify the saved bytes, CP/M text padding, and absence of a handoff session
  file.
- A clean exit returns to the same panel without a CCP restart or a handoff
  session file. The existing `E` and `!` paths continue to pass their prior
  handoff and command tests.
- Exercise the 32 KiB document boundary and report the first rejected size.
- The complete `npm run check` suite passes against the freshly built artifact.
- Independent Astra review found no remaining blockers. The review prompted a
  direct regression test for a missing filename on the active right panel; the
  old fallback left an invalid row selected, while the corrected path resets
  it to row zero.

## Current proof

`node test/increment-12.mjs` passes on Triptych's four-drive profile. It checks
same-process return, explicit B: selection, restored selection after CP/M
directory reordering, saved bytes and record count, absence of a session file,
the 32 KiB limit and rejection of the first byte beyond it, and unchanged A:,
C: and D: images.

The hosted preview remains on increment 11. The combined increment 12 build
includes GPL-3.0-or-later editor source and remains private pending a
distribution decision.
