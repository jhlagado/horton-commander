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
| File size in the panel or status line | High value and low conceptual cost. | BDOS function 35 reports the file's logical size in 128-byte records. Show the exact record count and, if space allows, an approximate byte or KiB figure. CP/M's final record can be padded, so this is not an exact byte length. |
| Drive capacity and free space | Useful context when copying files or deciding which disk to use. | Consider after the file-size display. Calculate from the selected drive's public disk-parameter data. Do not assume that logical records map to a fixed physical sector size across every provider. |
| File date | Low fit on the current CP/M 2.2 target. | The ordinary directory entry has no date field. Leave the date out unless a specific timestamp extension becomes part of the target contract. |
| Read-only ASCII view | Core utility for source, notes and text files. | Implemented. The current view displays CR/LF bytes as spaces, so preserving line breaks is a worthwhile viewer refinement. |
| Read-only hexadecimal view | Strong next viewer addition. It makes binary files and machine-code data inspectable. | Start with a bounded, paged hex dump that includes an offset and printable-character column. Editing bytes is a separate feature with cursor, validation and write-safety questions. |
| Copy, rename, move and delete | Core file work. | Implemented with single-file selection and explicit safety rules. Preserve the existing checks and recovery behavior as other features are added. |
| Multi-file selection and wildcard operations | Useful when managing many files, but bulk changes raise the cost of mistakes. | Defer until the selection transitions and bulk-operation failure handling are specified and tested. |
| Quick filename search | Useful when a drive has many entries. | Consider a small incremental search before full content search. The current target may contain 1,024 directory entries, so finding a visible name can save substantial navigation. |
| Content search, compare and synchronise | Useful for maintenance and development, but each requires repeated record reads and careful result handling. | Later candidates. Start with one-file content search or byte comparison before recursive or bulk operations. |
| Directories and directory tree | Poor fit for ordinary CP/M 2.2 user areas, which expose a flat file namespace. | Do not copy directory-tree interactions into the first useful subset. Revisit only for a target with a defined directory extension. |
| Make directory | Has little meaning in the current flat namespace. | Omit for the initial CP/M target. |
| External tools and command menu | Potentially valuable because it brings utilities into one place. | Defer a broad menu until the return path is usable. Prefer a small number of well-defined actions over pretending arbitrary COM programs can act like child processes. |
| Disk format, disk copy and other media operations | Useful in some environments, but destructive and dependent on disk geometry. | Keep out of the initial file manager. Use separately qualified utilities and explicit platform services if this becomes a real need. |

The size display should start with the CP/M record count. One record is 128
bytes, so `N records` is exact at the record level and `about N × 128 bytes`
is a useful approximation. A compact form such as `42 rec` can fit beside the
selected filename, with the approximate byte count in the status line. A
sector estimate needs the active disk profile's geometry. A date column would
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
Embedding an editor mode in `HORTON.COM` would avoid that process boundary.

Edit already has an extracted, statically linked editor engine. Its document,
command, session, layout and presentation modules are called synchronously.
The [engine interface](https://github.com/jhlagado/edit/blob/main/docs/design/editor-engine-interface.md)
defines that boundary. The application adapter handles keyboard input,
prompts, filenames, file transactions and entry or exit. Horton could enter an
editor mode, let it take over the screen, then redraw its panels when the
editor returns. Both `EDIT.COM` and `HORTON.COM` can link the same source
modules into their own executable. CP/M has no runtime library loader here,
so each COM file would contain its own copy of the linked code.

Start with an integrated editing experiment before packaging a shared library.
Copy the engine modules into Horton and leave Edit's standalone shell, file
transactions and command-line behaviour separate. Keep the module boundary
intact so the next step can make those same modules a pinned source dependency
of both builds. This proves the screen and return behaviour quickly without
forking unrelated parts of `EDIT.COM`. A separate editor-core repository can
wait until another consumer or a release need justifies it.

This still needs a real memory and build check. The current [engine account](https://github.com/jhlagado/edit/blob/main/docs/design/editor-engine-interface.md#memory-budget-and-performance-gates)
uses a 47,104-byte text arena, reserves a 3,072-byte stack and accounts for
490 of 512 bytes of fixed workspace. Those are Edit's current allocations,
not a measurement of a combined Horton build. Integration requires one CP/M
transient memory map that accounts for both programs' code, workspace, editor
buffer and stack. Build and exercise the combined binary before choosing the
editor size limit or claiming the integration is practical.

There is also a distribution decision to make before sharing source in a
release. Edit is GPL-3.0-or-later, while Horton currently has no top-level
license declaration. That does not prevent a private integration experiment,
but the source dependency and distribution terms should be resolved before
shipping a combined executable.

## Proposed order for the next roadmap

1. Improve the panel workflow with an explicit drive selector and useful
   record-based size information. Keep dates out of the CP/M 2.2 view.
2. Add a read-only hexadecimal mode beside the existing ASCII viewer. Keep the
   input paging bounded and prove files that cross extent boundaries.
3. Copy the editor-engine modules into Horton for an in-process prototype.
   Measure the combined COM and transient-memory use and test return to the
   same panel state.
4. Decide whether both repositories can build from the same pinned source
   modules. Resolve the license question before distribution.
5. Reassess multi-select, search, compare and tool menus after those flows
   have real use evidence. Treat format and disk-copy operations as separate
   work.

This order is a proposal, not a replacement for the accepted roadmap. The next
roadmap should turn only the chosen items into increments, with a measurable
acceptance gate for each one.
