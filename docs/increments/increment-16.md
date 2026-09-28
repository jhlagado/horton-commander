# Increment 16: pin the reusable editing core

Status: accepted after the Horton suite, a full isolated Edit check, and
independent Astra review found no remaining blockers.

## Boundary

Horton and standalone Edit share three ATOM source modules: document storage,
buffer editing, and cursor navigation. The modules are pinned to Edit commit
`63762528365f8db04464d2fe9bcf4cc4e8091a68`:

| Source module | SHA-256 |
| --- | --- |
| `editor-document.asm` | `5f74b04c2108da4f97907e4e1252adfb34f5f22ffb1e4a33c5cc2c7ec8af0f89` |
| `editor-buffer.asm` | `6e22329a51aeb384e2417a254517cb1ec046ef602e03067af75e2d75a1b2c158` |
| `editor-navigation.asm` | `14a952caa3931fdc978ac1b2d453075a7bf7f8119996c563289b7a3b883163c2` |

Each repository has an identical lock and verifier. The build rejects source
that differs from the lock, and the build manifest records the selected core
revision and module hashes. Each executable statically assembles the source;
there is no CP/M runtime library, npm dependency, or dynamic loading. The
applications retain their own screen, keys, prompt policy, file I/O, and
startup/exit behavior.

## Evidence

The Horton `npm run check` passes executable increments 0–16. The built
`HC.COM` is 18,213 bytes, SHA-256
`53e1805d7160ec6e36884170ad12bfeed7ebec8f61fab10ab25155cdf6678cc7`; its
quick-editor segment is 5,157 bytes. Increment 16 verifies the lock and
manifest, proves that a modified module is rejected, and checks that the
obsolete generated `HORTON.COM` and `HORTON.d8.json` names are removed when
`HC.COM` is rebuilt.

To preserve the active Edit checkout and its unrelated generated files, its
full `npm run check` ran in a temporary copy of the current working tree with
the same installed dependencies and Triptych checkout. The core checker,
ATOM policy, document-boundary guard, Edit build, all six test programs, and
engine/gap/display measurements passed there. The generated `EDIT.COM` was
5,890 bytes, SHA-256
`f113ba8e9e7c1fa18e4c85caf04a733a760540e34ba3d9265bcdd75f933f7ba1`; its
manifest records the same pinned core revision and module hashes.

At this increment's checkpoint, the combined build was not yet distributed.
The current `HC.COM` recipe was added later under GPL-3.0-or-later; see the
root `LICENSE` and `NOTICE.md` for the current terms and source provenance.
