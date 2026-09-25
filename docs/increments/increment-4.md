# Increment 4: rename, move, and delete

Status: accepted after the full Triptych scenario gate and independent Astra
review. The tested target is `triptych-cpu-v0.1-2m-n04` with A:, B:, C:, and
D: configured and populated where required by each scenario.

Rename accepts one explicit CP/M 8.3 name without a drive prefix or wildcard.
It normalizes lowercase ASCII to uppercase, checks the base and extension
lengths, rejects forbidden CP/M reference characters, and refuses an existing
destination before calling BDOS rename. A name identical to the selected name
is a harmless no-op. Rename uses one active drive and must preserve all extents
of a multi-extent file.

Move targets the opposite panel's drive. If both panels name the same drive,
Horton explains that move needs two different drives and leaves the disk
alone. Across drives, move is copy, verify, publish the destination name, then
delete the source. Any ordinary copy failure leaves the source; if source
deletion returns normally with an error after publication, Horton reports that
both copies remain. CP/M treats deletion of a read-only file as a fatal disk
error instead: the current BDOS prints `File R/O` and warm-boots to the CCP.
The verified destination and original source both remain in that case. A fatal
disk error can warm-boot between the move steps, so move is not atomic.

Delete removes one selected file, including all of its extents, only after an
explicit confirmation. Escape or any answer other than Y cancels. Rename,
move, and delete refresh the affected panels after a normal return. None of
these actions changes unrelated files or the CP/M default drive.

The Triptych scenarios cover successful and canceled operations, invalid and
unchanged names, destination collisions, a stale/missing source, a multi-extent
rename and delete, moves in both directions, same-drive refusal, directory-full
and partial-write failures, and preservation of unrelated data. A 13-character
input followed by Backspace and a valid replacement proves the bounded rename
input recovers without hanging. A read-only source proves the fatal delete path:
after the verified destination is published, CP/M reports `File R/O` and
returns to the CCP with both copies intact. Fatal absent-drive and BIOS failures
remain warm-boot paths; this increment does not add host fault injection.

The full `npm run check` gate passed after the fix. Astra's follow-up review
confirmed the BC-preservation fix and found no remaining blockers. The built
`HORTON.COM` is 7,111 bytes (SHA-256
`d7e33d27c9350e39ad33035f5b212258bb16d5eae18f588997f6f6b387115ed8`).
