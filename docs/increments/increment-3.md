# Increment 3: copy between panels

Status: accepted after the Triptych scenario gate and independent Astra review;
no remaining findings.

Copy keeps the source on its original drive and writes to the opposite panel's
drive under the same 8.3 name. Horton asks before copying and refuses to
replace an existing destination. It creates the destination as the reserved
`HCOPY.$$$` temporary file, transfers complete 128-byte CP/M records, closes it,
then reads both files back and compares every byte before renaming the
temporary file to the final name. Text EOF and record padding are copied as
stored; binary `0x1a` bytes do not terminate a copy. This copies CP/M's record
contents, including the unused portion of the final record, because the BDOS
interface exposes files as 128-byte records. The final name appears only
after a successful verification.

If BDOS returns an ordinary error, Horton keeps the source, attempts to close
and delete the temporary file, and reports failure. Triptych's fatal BIOS
disk errors warm-boot to CCP without returning to Horton. At startup, Horton
checks A: through D: for the reserved temporary name and offers to delete any
left behind by an interrupted copy. `HCOPY.$$$` is reserved for this recovery
purpose. The four-drive assumption remains provisional.

The Triptych scenario compares records for successful short text, binary,
129-record multi-extent, and final partial text copies; copies in both panel
directions; refuses destination and reserved-temporary collisions; and
exercises directory-full and disk-full returns. The disk-full cases include
both a failure on the first record and exhaustion after sixteen records have
filled the destination's last 2 KiB allocation block; the latter verifies the
existing target, source and reclaimed temporary block. It also checks source
and unrelated-file preservation, refreshed listings, and cleanup of a seeded
leftover temporary on startup. That seeded state models the remainder of a
copy after a fatal warm boot; the runtime host API does not yet inject a BIOS
read/write failure into a running guest. The disk-full case confirms the
reserved temporary is deleted; CP/M may retain its old name bytes in the
now-free directory slot.

The local gate passed with a 5,591-byte `HORTON.COM` built by pinned ATOM
revision `802b5c2d320bec777f427755ff2d7338e3b80a05`, SHA-256
`bb456be103241781e2a0d30dfbf8ed4322b4b89c8537cb64dc8a6366d8a5a5e3`.
The independent review found no remaining blockers or evidence gaps.
