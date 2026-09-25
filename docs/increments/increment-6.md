# Increment 6: failure and capacity qualification

Status: accepted after the full Triptych gate and independent Astra follow-up
review; no blockers remain.

This qualification uses Triptych profile `triptych-cpu-v0.1-2m-n04` with four
attached drives, A: through D:. That is the working machine assumption. An
absent-drive contingency is outside this increment and can be revisited if
actual Triptych use contradicts the assumption.

The full `npm run check` passes for increments 0 through 6. It includes the
full-directory, full-disk, interrupted-copy, rename-input, read-only-destination,
and handoff failure cases established by earlier increments. This increment
adds two capacity probes: one 2,048,000-byte file occupying all 16,000 records
on B:, and a verified 16,512-byte copy across two extents. The viewer opens the
maximum-size file and reads its final record after the test host seeds `VSTART`
to record 15,984, then sends the ordinary next-page key. This proves the
end-of-file boundary and final random read; it does not prove key-paging from
the first record through all 16,000 records. Copying a maximum-size file is
also not qualified.

The read-only A: destination test confirms CP/M's fatal BDOS path returns to
the CCP without changing the protected system disk or source file. All four
drives remain attached in every Horton scenario. Triptych's current guest
scenario API does not inject a runtime BIOS sector error into Horton. The
pinned Triptych `tools/prove-ccp-failures.mjs` test passes generic CP/M
bad-sector and warm-boot scenarios, but it does not establish Horton's response
to such an injected failure. That limitation remains explicit rather than
being counted as a Horton test.

## Capacity record

| Measure | Result |
| --- | ---: |
| `HORTON.COM` | 10,854 bytes |
| TPA end address | `0xE400` |
| TPA load capacity, from `0x0100` | 58,112 bytes |
| Load-region space after the COM image | 47,258 bytes |
| Fixed application buffers, already inside the COM image | 955 bytes |
| Largest verified copy | 16,512 bytes / 129 records |
| Largest file opened and final record read | 2,048,000 bytes / 16,000 records |

The two stack measurements are reported separately because CP/M switches to a
resident BDOS stack for system calls. During the 129-record copy, the CCP
transient stack's 48-byte reserved region had a lowest changed canary at
`0xEBDB`, 14 bytes below the sampled entry SP `0xEBE9`; 30 canary bytes below
that point remained unchanged, and the adjacent 16-byte CCP guard stayed
intact. The 64-byte BDOS stack's lowest changed canary was `0xF9ED`, 16 bytes
below its top at `0xF9FD`, leaving 48 bytes below the changed range untouched.
SP samples were taken in 512-instruction slices and classified by stack
address; the persistent canaries retain evidence of stack writes between
samples. These are workload measurements for the tested copy path, not a proof
that every possible call sequence has the same high-water mark.

## Artifact and pins

- Triptych commit: `62f49d7fada9e5bf714f175ef992d8e89cffbc8a`.
- Triptych profile: `triptych-cpu-v0.1-2m-n04`, with A:, B:, C:, and D:
  attached.
- ATOM commit: `802b5c2d320bec777f427755ff2d7338e3b80a05`.
- `HORTON.COM` SHA-256:
  `2b9fcfc03157794402aa7ac51198ac6d29df43a00a57bcabc18b2409b79d5a2c`.
- Source SHA-256:
  `573ad4ec36db657f91f03ecd6853e62b826e9706701c41f409eb5ac86a06c285`.
- The independent generic CP/M fatal-I/O proof at
  `../triptych/tools/prove-ccp-failures.mjs` passed six scenarios at the same
  Triptych checkout. It is supporting platform evidence, not a Horton
  fault-injection test.
- `npm run check` passed all seven increment scenarios after the reviewed
  changes.
- Astra low-effort follow-up review: clear; no remaining blockers.
