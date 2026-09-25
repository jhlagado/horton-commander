# Increment 5: editor and CCP handoff

Status: accepted. The full Triptych proof and prior increment suite pass. Astra's
first review found that a later extent could evade the EOF check; the
implementation now checks the complete logical record count with BDOS function
35. Follow-up review found no remaining blockers.

## Caller flow

From a selected file, `E` saves a one-shot panel session and prints the exact
commands for selecting that file's drive, running `EDIT.COM` from A:, restoring
the previously selected CCP drive after Edit exits, and relaunching with
`A:HORTON /R`. The user enters those commands at CCP. The `!` action collects a
short CCP command, saves the same session, and prints the typed command,
previous-drive command, and resume command. Horton does not invoke a CCP
command internally. A normal `HORTON` launch always begins fresh; only
`HORTON /R` requests restoration.

The explicit previous-drive command matters because a warm boot returns to the
CCP drive that was selected when Horton started, even if Horton later changes
the BDOS default drive. Resume restores that default inside CP/M; the displayed
CCP command restores it for subsequent commands after Horton exits again.

## Chosen state and storage

The record is stored in user area 0 on B:. The target proof for
increment 0 deliberately protects A: while leaving B: writable, so storing on
A: would make the core workflow fail in the established setup. Handoff needs
writable B:. A BDOS read-only-vector check catches logical CP/M protection, but
cannot guarantee that host-mounted media is writable; a physical write error
may still take CP/M's fatal warm-boot path.

One 128-byte record uses these fields:

| Bytes | Meaning |
| --- | --- |
| 0–7 | ASCII magic `HORTONRS` |
| 8 | Schema version, initially 1 |
| 9 | Record length, 128 |
| 10 | Active panel, 0 or 1 |
| 11 | Previous default drive, zero-based A:–D: |
| 12 | CP/M user area, fixed at 0 in this increment |
| 13–14 | Left and right panel drives, encoded 1–4 |
| 15 | Selection flags: bit 0 left, bit 1 right |
| 16–26 | Left selected canonical 11-byte CP/M name |
| 27–37 | Right selected canonical 11-byte CP/M name |
| 38 | Handoff kind: 1 editor, 2 command |
| 39–125 | Reserved zero bytes |
| 126–127 | Little-endian CRC-16/CCITT-FALSE over bytes 0–125 |

There are no page or row fields. Saved names identify selections if a command
changes directory ordering. On restore Horton rescans each selected drive,
finds the saved name among first extents, derives its page and row, and refreshes
the bounded 18-name panel cache. A missing saved name falls back to the first
entry in that panel and is reported. An empty panel remains unselected. This
increment supports handoff only from user area 0, matching the established
Triptych workflow and avoiding a hidden user-area transition around transient
programs. A handoff requested from another user area is refused.

Reserve `B:HORTON.RSM` for a published record and `B:HORTON.TMP` for staging.
Both names are checked before creation; a collision is refused and the user is
asked to remove the reserved file at the CCP. Existing files are never silently
overwritten or removed. It creates the temporary file, writes and closes exactly one record,
reopens it, verifies the bytes and end-of-file, then renames it to the final
name. Only after publication does Horton print the handoff instructions and
return to CCP. `HORTON /R` requires exactly one record and validates the magic,
version, length, checksum, reserved bytes, drives, flags, user and names. It
shows the saved drives and names for confirmation. After confirmation it
deletes the session file before applying any saved state, so a subsequent
ordinary launch cannot replay it. BDOS function 35 checks the complete logical
record count before `/R` reads the record, so only an exactly one-record file
is eligible. This prevents a valid first record from hiding later extents and
then being deleted as though the whole file were one record. A reset between
deletion and the restored screen can lose the session; this is the chosen
single-use trade-off.

An interrupted `.TMP` file is never resumed. Invalid session files remain
untouched. A valid session can outlive replacement media; the confirmation
shows saved drive/name context, and name lookup handles absent selections, but
the checksum cannot prove disk identity.

## Alternatives and choice

Two independent proposals were compared against safe restart behavior, bounded
storage, recovery from partial writes, proof through public Triptych paths, and
minimal changes to panel flow. Both proposed one 128-byte CRC-protected staged
record, explicit `/R`, selection by name, and consume-before-apply semantics.
The A: proposal loses because increment 0 uses read-only A:. The B: proposal
therefore supplies the base. The synthesis omits page/row hints: scanning to
the saved name already computes the current page and row, so those stored
positions would be stale-prone duplicate state. Astra's cross-review agreed
with B: and surfaced the read-only-vector limitation and media-identity risk;
both are reflected above.

## Proof and limits

The Triptych scenario uses the real `EDIT.COM` to edit and save a B: file,
returns through CCP, and resumes the selection. It also proves a `DIR` command
through CCP, ordinary-launch fresh behavior, cancelled-resume preservation,
restoration of independent C:/D: panels and a later-page name, malformed-tail
rejection, reserved-name refusal, interrupted-temporary refusal, missing-name
fallback, bad-checksum preservation, and rejection/preservation of a session
file with a later extent. All earlier increment scenarios run against the same
build.

The qualified profile protects its boot A: disk. The Edit save proof therefore
uses writable B:; editing a file on protected A: cannot save on that target.
Handoff also requires writable B: for its session record and currently supports
CP/M user area 0 only. A physical write failure may still warm-boot before
Horton can report an error. The session checksum detects accidental record
corruption, not whether the same disk is mounted later.

## Acceptance record

- Astra low-effort follow-up review: clear; no remaining blockers.
- Triptych commit: `62f49d7fada9e5bf714f175ef992d8e89cffbc8a`.
- Triptych profile: `triptych-cpu-v0.1-2m-n04`, with A:, B:, C: and D: attached.
- `HORTON.COM`: 10,854 bytes; SHA-256
  `2b9fcfc03157794402aa7ac51198ac6d29df43a00a57bcabc18b2409b79d5a2c`.
- Source SHA-256:
  `573ad4ec36db657f91f03ecd6853e62b826e9706701c41f409eb5ac86a06c285`.
- `npm run check`: build and increments 0–5 passed against the same artifact.
- Handoff coverage includes actual Edit save on writable B:, CCP return,
  filename-based panel restoration after directory reordering, one-shot
  consumption, cancellation, malformed and multi-extent record rejection,
  interrupted staging, missing selections, and bad-checksum preservation.
- Scope limit: this profile protects boot A:, so save-on-A: is not qualified;
  the handoff record uses writable B: and supports user area 0 only.
