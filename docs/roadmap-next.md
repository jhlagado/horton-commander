# Horton Commander: next phase

Increments 0–9 are complete and accepted. The current program browses four
drives, views and manages files, and documents a restart-based CP/M handoff to
the existing editor. The [accepted roadmap](roadmap.md) records that work. A
[hosted Triptych preview](https://jhlagado.github.io/triptych/?system=https%3A%2F%2Fjhlagado.github.io%2Fhorton-commander%2Freleases%2Fpreview%2Fsystem.json)
boots the current program.

The next phase adds useful file information and builds toward editing within
Horton. It remains a practical CP/M tool, not a goal of complete NC feature
parity. The order below keeps each capability small enough to test against the
current machine and file-safety rules.

## Planned increments

### 10. Show selected-file size

Show the selected file's CP/M record count. Each record holds 128 bytes, so an
approximate byte or KiB figure can help readers judge its size. The final
record may contain padding, so the display must not imply an exact byte length.
The standard CP/M directory entry does not provide a date for this display.

### 11. Add a read-only hexadecimal view

Add a hexadecimal mode beside the existing text viewer. Show offsets, byte
values and printable characters while keeping the file unchanged. Test paging,
empty files and files that span multiple extents.

### 12. Prototype editing inside Horton

Test an editor mode that returns directly to the same Horton session after a
save or exit. Reuse the useful editing code from Edit where that makes the
prototype smaller and easier to maintain. Preserve its capacity and file-safety
behaviour where the combined memory layout allows, and measure the complete
program before changing those limits. Keep a combined executable private until
its distribution terms are clear.

### 13. Share the editor source

If the integrated workflow proves useful, move the common editing code into a
source dependency used by both Edit and Horton. Each program can include that
source in its own executable; this does not require a runtime library.

## Later possibilities

Usage can guide whether to add free-space information, filename search,
multiple-file selection, comparison or a menu for known utilities. A general
external-command menu depends on a dependable way to leave Horton and return.
Date columns, recursive operations and disk formatting remain outside the
current plan.

## Review and acceptance

Work proceeds one increment at a time. Each change is tested with the exact
Horton executable under Triptych, reviewed independently and accepted only
after its behaviour and memory cost are recorded. Results from using Horton
can change the order or remove a proposed feature.
