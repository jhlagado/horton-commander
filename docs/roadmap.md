# Horton Commander roadmap

Status: increments 0–7 are accepted after their Triptych gates and independent
Astra review. The release candidate uses the current assumption that A: through
D: are attached and usable. Increment 7 proves the native view/copy/Edit/CCP
resume workflow and records the build pins. Increment 6 records capacity and
stack evidence; Horton-specific runtime BIOS fault injection and full-size
copy remain outside the qualified surface. Increment 5's first
Astra review found that later session-file
extents could evade the EOF check. Validation now checks the full record count
with BDOS function 35; a regression fixture with a short first extent confirms
that later records are rejected without changing the disk. Astra's follow-up
review found no remaining blockers. Increment 1's
review records full-directory page rescanning as a performance concern for
later qualification. The roadmap review identified three contract mismatches;
all were fixed and the follow-up review found no blocker. The increment 0
review found no blockers. Increment 4's first review caught a rename-input
Backspace hang; the implementation now preserves the erase counter across
BDOS output, the real-machine regression passes, and Astra's follow-up review
found no remaining blockers.

## Release aim

Deliver a useful, deliberately limited `HORTON.COM` for Triptych CP/M. The
working assumption is that A: through D: are attached and usable; the panels
start on A: and B: and can select any of those four drives. A user can navigate
the panels, view a file, copy it, rename or move it, delete it with
confirmation, and edit a file with the existing Edit program through a
documented CCP handoff that restores the file-manager session. The program is
not a full Norton Commander port.

The visual reference is the supplied two-panel DOS screen. The interface keeps
the active selection, opposite-panel destination, top menu, status, and
keyboard help visible. Function keys may be shortcuts, but no essential
operation depends on them.

## Increments

Each increment has a scoped code review by an independent Astra reviewer at
low reasoning effort, then the implementation addresses verified findings and
runs its acceptance gate before the next increment starts.

### 0. Prove the target and handoff boundary

- Record the ATOM dependency/build identity and the target CP/M profile used
  for Horton. The current target assumption is
  `triptych-cpu-v0.1-2m-n04`.
- Assemble a minimal real `.COM`, run it from the Triptych CCP, emit and clear
  an ANSI screen, consume ordinary keys and arrows, and return cleanly.
- Run a short probe around `EDIT.COM` exit and the CP/M warm-boot path.
- The current proof uses the pinned Edit 0.2.0 artifact on A: and opens one
  file from A: and one from B: using `A:EDIT <name>` while the respective
  drive is current. It then proves that Edit returns through CCP and that
  `A:HORTON` relaunches with B: still selected. Horton does not yet restore
  panel selection or other in-memory state; increment 5 owns that work.
- Confirm the working A:-through-D: media assumption against the selected
  Triptych profile and scenario image. The working product assumption is that
  all four drives are attached and usable; revise it if actual Triptych use
  shows otherwise.
- Prove the restart-based handoff using the actual `EDIT.COM` command-line
  rules. Record the exact CCP commands for a selected file on A: and on B:,
  including where `EDIT.COM` and `HORTON.COM` must be available. Confirm that
  the CCP retains the chosen current drive across Edit return and `A:HORTON`
  relaunch; panel selection restoration remains increment 5 work.
- Do not assume an app-to-CCP command submission interface. If the documented
  CCP sequence cannot provide the intended edit-and-return workflow, stop at
  this design gate and propose a separately reviewed seam before changing
  Portable CP/M, Edit, or Triptych.

**Accept when:** the exact binary runs through the public CP/M path, its
screen and key input are proved by a headless scenario, and a real Edit
session follows the documented leave-edit-relaunch command sequence. The
probe proves the return and relaunch path; saved-session restoration is
implemented and accepted in increment 5. Any required cross-project contract
change is explicit and independently reviewed.

### 1. Show both live drive listings

- Draw the two-panel frame and bottom action/help area on the 80-by-24
  Triptych terminal.
- Switch panels with Tab and show the current selection. Up/down moves the
  selection; `<` and `>` page the active panel without retaining a full
  directory catalogue.
- Read real directory entries from explicit drive FCBs using BDOS search
  calls. Show an empty directory normally. Do not probe an absent drive as if
  absence were an empty-directory result: the current BDOS contract warm-boots
  to CCP on access to an absent drive.
- Highlight one entry in the active panel. Keep the inactive panel visible.
- Display a multi-extent file once, using its first extent as the panel entry.
- Retain only bounded visible-page data. Page-up and page-down rescan the
  selected directory from the start to reach later pages; prove the full
  target capacity of 1,024 entries and measure the slowest page navigation.
- Keep active-panel selection visible; basic up/down selection and page
  navigation belong here so the complete directory can be inspected.

**Accept when:** a scenario runs `HORTON.COM` with the assumed A:-through-D:
media, checks distinct listings, an empty directory, a multi-extent file shown
once, the full 1,024-entry target directory, and the active selection in the
terminal snapshot, and confirms that no disk changed.

### 2. Select drives and view

- Add drive selection among A:, B:, C: and D:, and refresh.
- Add a built-in read-only file viewer. Handle text EOF, control bytes, long
  and multi-extent files, page and arrow navigation, Escape, and
  normal-returning missing-file statuses.
- Treat a fatal BIOS read error as a warm boot to CCP; do not claim the viewer
  can report it or resume in place.
- Keep the current selection and other panel's state through view/return.

**Accept when:** staged key input proves navigation, both drive contexts,
viewer entry/exit, correct file content from A: through D:, random reads across
a CP/M extent boundary, arrow sequences that do not escape the viewer, a usable
return for an ordinary BDOS open-miss status, and unchanged disk images. The
open-miss scenario injects a stale name into the live guest cache through the
test host's RAM inspection API; BDOS still executes the real open and returns
its normal missing-file status. The viewer's fatal disk path is the unhandled
public BDOS transfer; Triptych's current host test API does not expose runtime
read-fault injection, so that boundary is covered by the pinned BDOS
fault-injection proof unless Triptych adds a reviewed guest-scenario fault
hook.

### 3. Copy across the panels

- Copy the highlighted file from the active drive to the other panel's drive.
- Refuse an existing destination in the first version; do not silently
  overwrite it.
- Copy complete 128-byte CP/M records to a newly reserved Horton temporary
  name, verify the records, then rename to the destination. Refuse overwrites.
- On a normal-returning BDOS failure, remove the temporary file when safe,
  preserve the source, and report the remaining state. A fatal BIOS I/O error
  warm-boots to CCP and can leave the temporary file; the next launch must
  identify it and offer cleanup. Never claim the interrupted copy succeeded.
- Refresh both panels after success or a normal-returning failure. Rescan
  after relaunch if a fatal error warm-boots to CCP.

**Accept when:** tests compare complete source/destination CP/M records for
successful text, binary, multi-extent, and final partial text copies; prove
both panel directions, destination and temporary-name collision refusal,
directory-full and disk-full return handling, source preservation, a seeded
temporary-file recovery prompt after relaunch, and updated panel contents.
Triptych's current host API does not inject a fatal BIOS I/O error into a
running guest, so the seeded startup state proves recovery handling without
claiming to inject that fatal path.

### 4. Rename, move, and delete

- Rename on one drive through BDOS rename after validating a single CP/M 8.3
  name and checking collisions.
- Move between drives as verified copy followed by source delete. Retain the
  source unless the destination has been fully written and verified.
- Delete one highlighted file only after an explicit confirmation.
- Keep a useful recovery message if a second stage fails; do not label a
  cross-drive move atomic.

**Accept when:** on the four-drive Triptych profile, scenario coverage includes
success, cancel, same-name, existing destination, source-missing,
directory-full, and normal-returning partial-copy failures. A long invalid
rename followed by Backspace and a valid replacement completes. Injected
absent-drive, write-protect, or BIOS-I/O failures transfer to CCP as specified;
the source is never deleted before destination verification. Unrelated files
remain byte-identical. The full prior-increment gate and an independent Astra
review pass before increment 5 begins.

### 5. Edit and run-command handoff

- Implement the reviewed option from increment 0. Prefer using the existing
  `EDIT.COM` rather than embedding a second editor without evidence.
- Preserve active/passive drive, selected file, and prior default drive in a
  versioned, checksummed session file; make each CCP command explicit on
  screen. The user changes to the selected file's drive, runs `EDIT.COM`, then
  restores the CCP drive that was selected when Horton launched, then starts
  `HORTON /R` after Edit returns to CCP. A transient's warm boot restores the
  CCP prompt's launch drive even when Horton changed the BDOS default drive.
- Add a minimal command-entry handoff using the same exit, CCP execution, and
  resume sequence. Do not imply that either path returns to an in-memory
  Horton instance.
- Store the one-shot session on writable `B:` in user area 0, since the
  qualified profile protects its boot `A:` disk. Use a temporary file and
  verify the single-record file before publishing; on resume, use BDOS
  function 35 to reject extra extents before consuming the record.

**Accept when:** exact staged keystrokes on Triptych edit and save a writable
B: file with the real `EDIT.COM`, return through the actual CCP path, and
restore the active panel, opposite panel, selection, and CP/M default drive
with `HORTON /R`. The proof also demonstrates that the printed drive command
restores the CCP prompt after a transient returns on a different drive. A
typed command is executed by the documented CCP path, then the same saved
session resumes. Malformed command tails, bad checksums, interrupted staging,
reserved-name collisions, missing selections, and extra session extents are
rejected without consuming or overwriting protected data. Run the prior
increment scenarios and complete an independent Astra review before
acceptance.

### 6. Failure and capacity qualification

- Use the current Triptych assumption that A:, B:, C:, and D: are attached and
  usable. Absent-drive behavior remains a documented contingency, not a gate.
- Exercise the attached read-only A: path as a fatal warm-boot to CCP;
  separately qualify normal-returning full-directory, full-disk, corrupt or
  partial-file, invalid-filename, bad-key, and interrupted-handoff cases.
- Record code bytes, fixed buffers, separate transient and BDOS stack usage,
  copy/view limits, and the selected CP/M profile's TPA load capacity.
- Triptych's public guest-scenario API cannot inject a runtime BIOS sector
  failure into Horton. Keep this as an explicit host-test limitation; the
  pinned Triptych `tools/prove-ccp-failures.mjs` proof exercises generic CP/M
  fatal bad-sector behavior but does not qualify Horton's response to an
  injected fault.
- Fix every reviewed correctness issue and re-run all prior scenarios.

**Accept when:** every normal-returning failure is reported and leaves disks
in the documented state; the tested read-only fatal path leaves control at CCP
with protected disks unchanged; no measured stack or buffer exceeds the named
profile; the unavailable Horton-specific runtime sector-fault test is clearly
recorded as unqualified. All four assumed drives are present throughout this
gate.

Status: accepted after the full `npm run check` gate and Astra follow-up review.
The follow-up found no blockers. The test and evidence are recorded in
`docs/increments/increment-6.md`.

### 7. Triptych integration and release candidate

- Install the qualified `HORTON.COM` into a fresh Triptych CP/M working image
  without changing user-saved disks.
- Run the full real-binary scenario set and a native interactive session from
  CCP through view, file operation, CCP edit handoff, session resume, and
  re-open.
- Record artifact size and digest, exact Triptych/Portable CP/M pins, and
  remaining limits.

**Accept when:** `npm run check` passes increments 0–7, including a native
Triptych PTY session on a fresh four-drive archive; that session launches from
the CCP, views and copies a B: file to C:, edits and saves the B: file with the
pinned `EDIT.COM`, returns through CCP, resumes the saved C:/B: panel state,
and reopens the edited file. Inspect all four persisted drive images, prove the
copy and edit contents, consume the one-shot session, and confirm the original
archive is unchanged. Record artifact size and digest plus dependency pins.
This is software/model qualification on the assumed attached A:–D: setup, not
physical hardware release qualification.

Status: accepted after `npm run check` passed all eight increments and the
independent Astra follow-up review found no blockers. The native test and
release-candidate evidence are recorded in `docs/increments/increment-7.md`.

## Deferred unless evidence promotes them

Directory trees, multi-file tagging, wildcard batches, archive browsing,
formatting, recursive deletion, file attributes, a built-in editor, mouse
support, full Norton key parity, and support for non-Triptych CP/M machines.
The roadmap can add one only when a real use case and the byte/workspace cost
justify it.
