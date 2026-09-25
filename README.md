# Horton Commander

Horton Commander is an experimental, keyboard-driven CP/M file manager for
Triptych. Its first useful target assumes drives A: through D: are attached.
The two panels start on A: and B: and can select any of the four drives. A
small set of operations makes it easier to see and manage files than the CCP
prompt alone. The program artifact is `HORTON.COM`.

Horton uses a familiar two-panel file-manager model: keep both working
locations in view, make the active location obvious, and use the opposite
panel as the destination for file operations. The feature set will stay
deliberately small.
The initial plan covers directory browsing, a read-only viewer, copy, rename,
move, delete, and a practical route into the existing `EDIT.COM`.

The implementation is ATOM-assembled Z80 code using the public CP/M BDOS
interface. Triptych is the qualified execution target. Its 80-by-24 ANSI
terminal, CP/M scenarios, and native terminal host provide software/model
proof; this is not a physical hardware qualification.

The [architecture note](docs/architecture.md) records the current boundaries
and the restart-based CCP handoff. Increments 0–8 have passed independent
Astra review. Increment 9 adds explicit drive selection and is under final
public-preview qualification. The accepted release candidate includes live
drive panels, a read-only viewer, file operations, and a documented handoff to
the separate `EDIT.COM` followed by session restore.
The [scope and editor discussion](docs/discussions/horton-scope-and-editor.md)
records candidates for the next roadmap without changing the accepted plan.
The separate [next-phase roadmap](docs/roadmap-next.md) turns selected ideas
into reviewable increments, pending public qualification of the hosted image.

Run `npm run check` to build `HORTON.COM` with ATOM and run all ten increment
gates. They cover the CCP handoff, full 1,024-entry directory, A:–D: selection,
viewer paging, copy/move/rename/delete failure handling, session restore, and
a native Triptych terminal session that views, copies, edits, resumes, and
reopens a file while checking the persisted disk images. Set `TRIPTYCH_ROOT` if
Triptych is not a sibling checkout at `../triptych`.

The published preview disk image and its integrity-checked Triptych launch
descriptor are in [`site/releases/preview`](site/releases/preview/README.md).
This link boots the image directly in the Triptych WASM host:

<https://jhlagado.github.io/triptych/?system=https%3A%2F%2Fjhlagado.github.io%2Fhorton-commander%2Freleases%2Fpreview%2Fsystem.json>
