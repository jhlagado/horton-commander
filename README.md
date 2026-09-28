# Horton Commander

Horton Commander is an experimental, keyboard-driven CP/M file manager for
Triptych. Its first useful target assumes drives A: through D: are attached.
The two panels start on A: and B: and can select any of the four drives. A
small set of operations makes it easier to see and manage files than the CCP
prompt alone. The program artifact is `HC.COM`.

Horton uses a two-panel file-manager model: keep both working locations in
view, make the active location obvious, and use the opposite panel as the
destination for file operations. It supports directory browsing, text and hex
viewing, copy, rename, move, delete, approximate file sizes, and an in-process
quick editor. `!` hands a command off to CCP and restores Horton's saved panel
state when the user returns.

The implementation is ATOM-assembled Z80 code using the public CP/M BDOS
interface. Triptych is the qualified execution target. Its 80-by-24 ANSI
terminal, CP/M scenarios, and native terminal host provide software/model
proof; this is not a physical hardware qualification.

The [architecture note](docs/architecture.md) records the current boundaries;
the [roadmap](docs/roadmap.md) and [next-phase record](docs/roadmap-next.md)
show accepted increments and later candidates. Increments 0–16 have passed
their Triptych gates and independent Astra reviews. The current artifact is
`HC.COM`: `E` opens the in-process quick
editor, while `!` saves a session and prints the command for the user to enter
at CCP. After that command returns, the user follows the displayed drive
restore and `A:HC /R` commands. The editor's document, buffer, and navigation
modules are pinned to Edit revision
`63762528365f8db04464d2fe9bcf4cc4e8091a68` and statically assembled into both
programs. Increment 17 records why command handoff remains explicit rather
than automatic. The editor-containing build is still private while
distribution terms are reviewed.

Run `npm run check` to build `HC.COM` with ATOM and run the seventeen
executable increment gates (increments 0–16). They cover the CCP handoff, the
full 1,024-entry directory, A:–D: selection, text and hex viewer paging,
copy/move/rename/delete failure handling, session restore, and a native
Triptych terminal session that views, copies, edits, resumes, and reopens a
file while checking persisted disk images. Set `TRIPTYCH_ROOT` if Triptych is
not a sibling checkout at `../triptych`.

The published preview disk image and its integrity-checked Triptych launch
descriptor are in [`site/releases/preview`](site/releases/preview/README.md).
The hosted preview remains on the earlier increment 11 image; the current
private `HC.COM` build has not been published.
This link boots the image directly in the Triptych WASM host:

<https://jhlagado.github.io/triptych/?system=https%3A%2F%2Fjhlagado.github.io%2Fhorton-commander%2Freleases%2Fpreview%2Fsystem.json>
