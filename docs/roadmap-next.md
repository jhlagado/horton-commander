# Horton Commander next-phase roadmap

Status: increment 9 is implemented and passing its local Triptych gate; the
independent Astra review and refreshed public preview remain before acceptance.
This roadmap starts after the initial hosted preview is qualified. It
continues the accepted increments in `docs/roadmap.md` and does not change
their acceptance record.

## Purpose

The next phase should make Horton more useful for routine CP/M file work. It
will improve drive selection and file information, add a read-only hex view
and test an editor that runs inside Horton. A later source-sharing step will
keep the editor engine common to Edit and Horton after the integrated workflow
has proved useful.

The target remains Triptych's four-drive profile with A: through D: available.
Horton keeps one active file selection, explicit confirmation for destructive
operations and the existing CP/M file-safety rules. This is a practical
subset, not complete NC feature parity.

## Increment 9 preview follow-up

Increment 8 is accepted. The descriptor-only public URL was verified in the
browser: it boots to the CP/M prompt, starts Horton, and both panels browse
A: through D:. Triptych's browser suite also verifies that files written to
B:, C: and D: persist after reload. The test did not write to the interactive
browser session's saved disks.

The hosted-preview entry gate is complete. Refresh the published preview
after the drive-selector change is accepted so the public example stays
current.

- Refresh the preview disk with the accepted `HORTON.COM` and retain its
  descriptor-only launch URL.
- Confirm `S` opens the selector, A:–D: selection changes only the active
  panel, and Escape returns without a change.
- Record the new image digest and public browser result in
  `docs/increments/increment-9.md`.

## Increments

Each increment is implemented and tested on its own. Send its diff to an
independent Astra reviewer at the lowest reasoning setting. Verify every
actionable finding, fix confirmed problems, rerun that increment's gate and
all earlier gates, then accept it before starting the next increment.

### 9. Select the panel drive explicitly

Replace square-bracket drive cycling with an `S` drive-selection action for
the active panel. Show the available A: through D: choices and allow cancel
without changing the panel. Keep `D` for Delete. After a drive change, reset
that panel's page and selection, rescan its directory and leave the other
panel and CP/M default drive unchanged.

**Accept when:** a Triptych scenario selects each drive in both panels,
cancels the selector, rejects invalid input and switches back and forth
between panels. The display shows the chosen drive and its correct directory.
The updated four-drive preview accepts the same interactions in a browser
session. All prior file images remain unchanged.

### 10. Show selected-file size

Use BDOS function 35 to show the selected file's logical record count. One
record is 128 bytes, so an approximate byte or KiB value can accompany the
count if the status line has room. Do not present that value as an exact byte
length because the final record may include padding. Show a physical-sector
count only after deriving the mapping from the active drive's disk parameters.
CP/M 2.2 has no date field in the ordinary directory entry, so this increment
does not add a date column.

Keep size information in the selected-file status area first. A size column
for every visible entry can be considered after the cost of repeated BDOS
queries and the remaining panel width are measured.

**Accept when:** zero-length, one-record, multi-extent and large logical
files show the correct full 24-bit record count. Check that the selected file
exists separately: Portable CP/M's function 35 returns `$FF` after writing
the count to the FCB, and its result alone does not distinguish a missing
file from an empty file. Tests include both cases and a stale selection.
Approximate units are
labelled clearly. Changing selection updates the size without changing either
panel's drive, the CP/M default drive or any file. Missing-file and normal
BDOS error results do not leave stale size data on screen. Directory paging
and selection still meet the existing correctness and responsiveness gates.

### 11. Add a read-only hexadecimal viewer

Add a hex mode beside the existing ASCII viewer. Render a bounded page of
bytes with a record-aware offset, hexadecimal values and a printable-character
column. Read records incrementally through BDOS, including across extent
boundaries. Keep the view read-only; byte editing remains a separate design
decision. Preserve the file's full final CP/M record because the ordinary
interface cannot distinguish source bytes from padding inside that record.

**Accept when:** the viewer correctly shows all byte values, page boundaries,
the final record and files spanning several extents. Empty and missing files,
Escape, page navigation and ordinary error returns behave predictably. The
viewer preserves both panel selections, does not change the default drive and
does not alter disk images. Its maximum input and output storage are recorded.

### 12. Integrate an editor mode into Horton

Prototype editing inside `HORTON.COM` so saving or quitting returns to the
same Horton session without a CCP handoff. Start with a contained copy of the
reusable editor-engine modules from Edit, plus a Horton adapter for file load,
save, keyboard entry and the return to the panel screen. Keep Edit's
standalone shell and command-line behavior separate. The editor takes over the
screen while active; returning to Horton triggers a full panel redraw.

Before publishing an executable that contains Edit code, resolve how the
combined program will be distributed. A private integration experiment can
proceed first; public qualification waits until the licensing and distribution
terms are clear.

Preserve the editor's input rules and file-safety behavior in the adapter:
validate text before entering the editor, reject content beyond the exact
capacity, preserve EOF and newline semantics, and keep temporary/backup name
collisions, rollback and retry behavior from the save transaction. Confirm
before discarding a dirty buffer. If both a save and its rollback fail, leave
the previous complete file recoverable under its original or backup name.
Reject binary or malformed text without writing to the source file.

Provide an explicit `N` new-file action. It prompts for a CP/M filename even
when the panel is empty, rejects an existing name rather than replacing it,
and can be cancelled without changing the panel or disk. After the first
successful save, select the new file in the active panel.

Preserve the current editor capacity of 47,104 bytes if the combined CP/M
transient memory map allows it. Measure code, editor buffer, fixed workspace
and stack together. Do not silently reduce the edit limit to make the link
fit. If the measured image cannot fit the current editor, record the exact
shortfall and alternatives before choosing a different limit.

**Accept when:** in a private Triptych build, a user opens an existing file,
makes and saves an edit, exits the editor and returns directly to the same
active panel, other panel and selected filename. The new-file action covers
empty and populated panels, cancellation, an existing-name collision and
selection after its first save. Tests also cover malformed and oversized
input, clean and dirty exits, save failures at every transaction phase,
rollback and successful retry. The written image contains the expected bytes,
unrelated files remain unchanged and no CCP relaunch is needed. The exact
HORTON binary fits the measured TPA, workspace and stack limits; its hash and
size are recorded. A native Triptych session repeats the save and return path.
Only after the distribution prerequisite above is resolved can the combined
executable be published and qualified in the public four-drive image.

### 13. Share the editor engine source

After increment 12 proves the integrated workflow, replace Horton's temporary
engine copy with a pinned source dependency on the editor modules maintained
with Edit. Keep CP/M file transactions, prompts, the Horton panel and the Edit
standalone shell in their own adapters. Each program statically links the
shared source into its own COM file; this does not create a runtime library or
reduce the code duplicated across separate disks.

**Accept when:** clean checkouts of both repositories build from one recorded
engine revision. The Edit and Horton tests exercise the same engine sources,
and both applications retain their existing file, display, editing and
return contracts. A clean dependency update can be tested before either
application changes its pin. Keep the resolved distribution terms documented
with the dependency and release process before publishing the combined
executable.

## Later candidates

Reassess drive free-space information, incremental filename search,
multi-file selection, content search, comparison and a small menu for known
utilities after the increments above have evidence from use. A generic
external-command menu depends on a reliable CP/M exit-and-return path and
needs a separate design. Date columns, directory trees, `mkdir`, recursive
operations and disk formatting do not fit the current CP/M 2.2 scope.

The low-level editor modules may prove reusable beyond these two programs.
Keep the source dependency in Edit while only Horton uses it. Consider a
separate editor-core repository if another consumer or a release cadence gives
that split a concrete benefit.
