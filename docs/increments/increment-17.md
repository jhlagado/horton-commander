# Increment 17: keep CCP command handoff explicit

Status: accepted after independent review confirmed the qualified Triptych
CCP contract and implementation support the documented decision.

## Finding

The Triptych CCP contract describes transient loading at `$0100`, puts a zero
warm-boot return address on the transient stack, then jumps to the program.
An ordinary transient return enters warm boot and starts a fresh CCP. The
Triptych CCP implementation follows that contract: it loads the `.COM`,
prepares the TPA and stack, then jumps to `$0100`. The contract has no
command-submit facility, and the CCP's implemented built-ins do not include
`SUBMIT`. Its parser can load another transient when the user enters a command
at the prompt, but that does not give a running transient a way to make CCP
execute a command and then resume its previous process.

The CCP contract and implementation live in Triptych:
`docs/specifications/ccp-v0.1.md` and
`third_party/portable-cpm/src/ccp.asm` (transient dispatch around `LOADCOM`,
stack setup, and `JP TPA`). They establish the target behavior used for this
decision. No command chaining or `SUBMIT` implementation was found in the
qualified Triptych source.

## Decision

Keep the current manual handoff. `!` saves the session and displays the
external command for the user to type at CCP. When the external program
returns, the user follows Horton's displayed command to restore the saved CCP
default drive, then enters `A:HC /R` to restore Horton's panels and selection.
Do not patch CCP resident memory, embed a second partial CCP, or claim a
portable automatic child-process return. More frequent utilities should be
built into Horton when they justify their code and memory cost.

This leaves the handoff explicit and slightly manual, but matches ordinary
CP/M transient behavior and works without changing Triptych or the host.
Automatic chaining can be reconsidered if a target later provides a documented
and tested mechanism.

## Verification

This is a decision increment, so it changes no executable code and adds no
runtime test. Existing `!`/resume scenarios remain part of the full `npm run
check` gate, which passes increments 0–16. The decision is based on the pinned
Triptych CCP contract and implementation, not a general claim about every
CP/M variant.
