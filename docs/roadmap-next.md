# Horton Commander next phase

Status: increments 14–16 are implemented, pass the complete Horton test suite,
and have independent Astra review. Increment 17's decision is implemented,
documented, and independently reviewed. The next-phase
work has focused on making editing useful inside Horton and clarifying the
limits of the CP/M command handoff. The current `HC.COM` preview is available
through the CP/M Recipes site under GPL-3.0-or-later.

The working target assumes A:, B:, C: and D: are attached in Triptych. The
current executable is `HC.COM`. The legacy whole-disk preview remains at
increment 11; the current recipe-based launch installs `HC.COM` on A: and
provides writable B:, C: and D: work disks.

## 14. Make E open the in-process editor

**Accepted.** `E` and `e` open the selected file in Horton's in-process editor
from either panel. Ctrl-S saves without leaving the editor; Ctrl-Q returns to
the same Horton process and restores the panel and selection. A dirty quit
asks before discarding, and cancelling keeps the draft open. Recoverable save
failures report the problem and retain the editable draft. `!` is the explicit
CCP command handoff; `I` has been removed.

See [increment 14](increments/increment-14.md). Its Triptych proof covers both
panels, dirty-quit behavior, a recoverable save conflict and unchanged other
drives. Independent review found no blockers.

## 15. Define Horton's quick-edit profile

**Accepted.** The embedded editor is a quick text editor for small changes,
with a clear drive and filename, navigation, insertion, deletion, newline,
save and quit. Search and replace are absent from Horton's visible command
set, while standalone Edit keeps its fuller direction. The document limit is
32 KiB; an over-capacity insertion leaves the document unchanged and reports
the rejection. The editor segment is 5,157 bytes.

See [increment 15](increments/increment-15.md). Its proof checks the displayed
help and filename, full-buffer rejection against the entire in-memory
document, and unchanged disk images. Independent review found no blockers.

## 16. Pin a reusable editing core

**Accepted.** Horton and standalone Edit now use the same three ATOM source
modules for document storage, buffer edits and navigation. The snapshot is
pinned to Edit revision `63762528365f8db04464d2fe9bcf4cc4e8091a68`; both
builds verify module hashes and record the pin in their manifests. Each
application retains its own user interface, file adapter, prompts, and
startup/exit behavior. This is a checked-in source dependency that is
statically assembled into each `.COM`, not a runtime library or an npm
dependency.

See [increment 16](increments/increment-16.md). Horton rejects modified core
source and its manifest records the pin. The standalone Edit checker and an
isolated build also pass. The combined preview is distributed under
GPL-3.0-or-later, with its corresponding source linked from the CP/M Recipes
entry.

## 17. Decide the external-command return path

**Decision: retain the explicit CCP handoff.** Triptych's CCP loads a transient
program at `$0100`, puts the warm-boot return address on its stack, and jumps
to the transient. Returning from that transient warm-boots into a fresh CCP;
the documented contract and implementation expose no nested command runner
that would return to Horton's live process. Triptych also has no implemented
`SUBMIT` command or command-script chaining path to relaunch Horton
automatically.

Horton therefore keeps the honest workflow: `!` saves a resume record and
shows the command for the user to type at CCP. When that command returns, the
user follows the displayed default-drive restore command and then types
`A:HC /R` to restore the saved panels and selection. No resident
patch, private CCP copy, or unsupported transient overlay is introduced.

Evidence is in [increment 17](increments/increment-17.md), with references to
the CCP contract and transient loader. Independent review found no blockers.

## Later product choices

After using the in-process editor and explicit command handoff, prioritize
further work from actual use. Candidates include free-space display,
incremental filename search, multiple selection, and a menu of known
utilities. Dates, recursive operations and disk formatting are outside the
current target. Each addition should have a separate behavior and memory-size
gate.
