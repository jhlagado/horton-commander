# Increment 7: Triptych integration and release candidate

Status: accepted after the full `npm run check` gate and independent Astra
follow-up review; no blockers remain.

The final integration check creates a fresh disposable Triptych saved-machine
archive with four attached 2 MiB drives. A: contains `HORTON.COM` and the pinned
`EDIT.COM`; B: contains a test text file; C: and D: start empty. A PTY drives the
native Triptych terminal and the real CP/M binaries through this workflow:

1. Launch Horton from the CCP and view the selected B: file.
2. Copy B: to C: and acknowledge Horton's verified-copy result.
3. Save the Horton session, run `A:EDIT HELLO.TXT`, edit and save the B: file,
   return through CCP, restore A: as the CCP drive, and run `A:HORTON /R`.
4. Confirm the C:/B: panels are restored, reopen the edited B: file, and quit
   Horton back to the CCP.

The gate then reads all four persisted disk images. It checks that C: contains
the original 128-byte file exactly, B: contains the exact 128-byte edited file,
D: is still empty, both one-shot session files are gone, and the original
saved-machine archive has the same SHA-256 digest it had before the run. The
test uses a temporary archive and removes it after a passing run; it never
modifies a user-saved Triptych disk.

## Build and pins

| Item | Qualified value |
| --- | --- |
| Triptych commit | `62f49d7fada9e5bf714f175ef992d8e89cffbc8a` |
| Triptych profile | `triptych-cpu-v0.1-2m-n04` |
| Portable CP/M source commit | `d28fc52774c967d1422b3b814d51c069247504c1` |
| Configured and attached drives | A:, B:, C:, D: |
| ATOM commit | `802b5c2d320bec777f427755ff2d7338e3b80a05` |
| EDIT version | `0.2.0` |
| EDIT SHA-256 | `6be83f6edb9ee92387c7b3817f473fbbc389a58ab1a20d9a2a6101e695fb77c4` |
| `HORTON.COM` size | 10,854 bytes |
| `HORTON.COM` SHA-256 | `2b9fcfc03157794402aa7ac51198ac6d29df43a00a57bcabc18b2409b79d5a2c` |
| C: copy SHA-256 | `dd96131c69b18c208302b1eb1407f4479fc5db5f351536df3928df5cf692662f` |
| Edited B: file SHA-256 | `fa23391f7b7e68b00705734fc7b190b66b68aa0b8f2469b518fa51ea069e2c72` |

The full `npm run check` gate runs all earlier CP/M scenarios and this native
workflow test. The native check uses Triptych's actual terminal host with a
PTY and inspects its persisted CP/M media after exit; it is stronger integration
evidence than the scripted Z80 machine scenarios, but it remains software/model
qualification rather than a run on physical Triptych hardware.

The target assumes all four configured drives are attached and usable. That is
the current Triptych premise; absent-drive behavior remains outside the gate
and can be revisited if the premise proves wrong. Existing increment 6 limits
also remain: this does not qualify maximum-size file copies or inject a
Horton-specific runtime BIOS sector failure through Triptych's current public
guest-test API.
