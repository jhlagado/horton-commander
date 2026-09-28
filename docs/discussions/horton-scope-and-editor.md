# Horton scope and editor sharing

Status: discussion input for a later roadmap. The feature rankings are
proposals, not accepted implementation work. This document uses **NC** as the
short name for the DOS file manager used as a reference.

## Useful NC features

The early two-panel design groups file operations around a clear selection:
choose a file in one panel, then view, edit, copy, rename, move or delete it.
Contemporary descriptions also record multi-file selection, quick filename
search, wildcard operations, user menus and panel views that can show size,
date or directory information. A 1989 review lists Help, Menu, View, Edit,
Copy, Rename/Move, Make Directory, Delete, pull-down menu and Quit actions.
Those command names are useful evidence about the workflow, not a requirement
for matching its keys.

The early design also allowed a command line below the panels and a user menu
for launching tools. That is especially relevant to CP/M, where the CCP has a
small command interface. The present restart-and-relaunch route from Horton to
the CCP or `EDIT.COM` has been proven as a mechanism, but the interactive
handoff has not felt good in use. We should treat that as an unresolved product
problem rather than count the proof as a finished workflow.

The survey draws on a contemporary review in [Compute! 79, December 1986,
page 66](https://colorcomputerarchive.com/repo/Documents/Magazines/Compute%20%28Clean%29/Compute_Issue_079_1986_Dec.pdf)
and a [REMark review from February 1989](https://www.vtda.org/pubs/REMark/1989/remark-volume10-issue2-1989.pdf).
They describe particular DOS versions. Horton can borrow the useful ideas
without inheriting their full command set or key assignments.

## Feature choices for Horton

| Feature | Fit for Horton | Current view |
| --- | --- | --- |
| Two panels, active selection and drive choice | Core. This is the main improvement over working from the CCP prompt. | Implemented for the assumed A:–D: setup. The square-bracket drive cycling feels awkward. A drive-selection command on `S` is a reasonable candidate, with `D` left for Delete. |
| File size in the panel or status line | High value and low conceptual cost. | Increment 10 shows the selected file's logical 128-byte record count in the status line. Increment 13 adds an approximate rounded-up KiB value beside each visible filename. CP/M's final record can be padded, and its BDOS interface does not provide a portable physical-sector size. |
| Drive capacity and free space | Useful context when copying files or deciding which disk to use. | Consider after the file-size display. Calculate from the selected drive's public disk-parameter data. Do not assume that logical records map to a fixed physical sector size across every provider. |
| File date | Low fit on the current CP/M 2.2 target. | The ordinary directory entry has no date field. Leave the date out unless a specific timestamp extension becomes part of the target contract. |
| Read-only ASCII view | Core utility for source, notes and text files. | Implemented. The current view displays CR/LF bytes as spaces, so preserving line breaks is a worthwhile viewer refinement. |
| Read-only hexadecimal view | Strong viewer addition. It makes binary files and machine-code data inspectable. | Implemented in increment 11 as a bounded, paged hex dump with offsets and a printable-character column. Editing bytes is a separate feature with cursor, validation and write-safety questions. |
| Copy, rename, move and delete | Core file work. | Implemented with single-file selection and explicit safety rules. Preserve the existing checks and recovery behavior as other features are added. |
| Multi-file selection and wildcard operations | Useful when managing many files, but bulk changes raise the cost of mistakes. | Defer until the selection transitions and bulk-operation failure handling are specified and tested. |
| Quick filename search | Useful when a drive has many entries. | Consider a small incremental search before full content search. The current target may contain 1,024 directory entries, so finding a visible name can save substantial navigation. |
| Content search, compare and synchronise | Useful for maintenance and development, but each requires repeated record reads and careful result handling. | Later candidates. Start with one-file content search or byte comparison before recursive or bulk operations. |
| Directories and directory tree | Poor fit for ordinary CP/M 2.2 user areas, which expose a flat file namespace. | Do not copy directory-tree interactions into the first useful subset. Revisit only for a target with a defined directory extension. |
| Make directory | Has little meaning in the current flat namespace. | Omit for the initial CP/M target. |
| External tools and command menu | Potentially valuable because it brings utilities into one place. | Defer a broad menu until the return path is usable. Prefer a small number of well-defined actions over pretending arbitrary COM programs can act like child processes. |
| Disk format, disk copy and other media operations | Useful in some environments, but destructive and dependent on disk geometry. | Keep out of the initial file manager. Use separately qualified utilities and explicit platform services if this becomes a real need. |

The status line reports the exact CP/M logical record count for the selected
file. Increment 13 adds a rounded-up KiB estimate beside visible filenames.
One record is 128 bytes, and the final record may contain padding. A physical
sector estimate needs the active disk profile's geometry; a date column would
imply metadata that the current directory format does not provide.

## Viewer and editor direction

The ASCII viewer and a hex viewer can share the file-reading path while using
separate rendering modes. The hex view should remain read-only at first. A
future hex editor would need an explicit edit transaction, a decision about
whether arbitrary binary records can be written, and a recovery strategy for
partial failures. Keeping that decision separate avoids turning a useful
inspection feature into an underspecified editor.

Launching `EDIT.COM` as a separate transient returns through the CCP. That
breaks the natural expectation that Horton will still be present when editing
ends, even when a session file can restore the selection after a relaunch.
Increment 12 tested an in-process editor mode in `HORTON.COM` to avoid that
process boundary. At that checkpoint, the combined build was still private
while distribution terms were reviewed; the current `HC.COM` preview is now
published under GPL-3.0-or-later with its source and notices.

Edit organizes its editor as statically linked document, session, navigation,
layout, presentation, input and CP/M load/save modules. Its
[engine interface](https://github.com/jhlagado/edit/blob/main/docs/design/editor-engine-interface.md)
documents routine and memory contracts, but this is not a released binary ABI
or a ready-made bounded-screen adapter. Both applications can eventually
assemble common source into their own executable; CP/M has no runtime library
loader, so each `.COM` file contains its own linked copy.

The in-process experiment is implemented in increment 12. It statically links
pinned Edit 0.2.0 source into Horton, including its editor loop, display,
document operations and CP/M load/save code. Horton adapts the entry and return
to its panel state; standalone Edit keeps its own program shell. The copied
source is not yet a clean split between a common editing core and each
application's input, display and file adapter. Increment 16 pins the shared
document core. The current combined preview is distributed under
GPL-3.0-or-later; its source and notices are published with the CP/M Recipes
entry.

Increment 12 has already built and qualified the combined Horton executable.
Its editor code is 5,522 bytes, its workspace is 512 bytes, its text arena is
32 KiB, and its private stack is 3 KiB; the increment record gives the full
TPA map and tests. Edit's newer [engine account](https://github.com/jhlagado/edit/blob/main/docs/design/editor-engine-interface.md#memory-budget-and-performance-gates)
is a comparison, not a drop-in Horton profile: it uses a 47,104-byte text
arena and 490 of 512 workspace bytes. Any source change or larger Horton edit
profile needs a fresh integrated build and memory map.

At the time this discussion was written, Edit was GPL-3.0-or-later and Horton
had no top-level license declaration. The release decision is now resolved:
the combined program and its corresponding source are distributed under
GPL-3.0-or-later, with the terms and editor provenance recorded in the root
`LICENSE` and `NOTICE.md`.

## Proposed order for the next roadmap

The [next-phase roadmap](../roadmap-next.md) now starts by mapping `E` to the
existing in-process editor, then defining a quick-edit profile from actual
use. It delays source extraction until Horton and Edit have a stable common
boundary, and treats automatic command return as a separate CP/M capability
to investigate. Free-space display, search, multi-select and utility menus
remain later choices rather than part of the editor milestone.
