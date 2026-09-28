# Increment 14: edit in place with E

Status: accepted after the complete Triptych suite and independent Astra
review found no blockers.

## Behavior

`E` or `e` opens the selected file in Horton's in-process editor from either
panel. Ctrl-S saves without exiting. Ctrl-Q returns to the same Horton process
with the prior panel and selection restored. A dirty document prompts before
discard: cancelling leaves the draft open; confirming discards it. A
recoverable save conflict is reported while preserving the editable draft.
Fatal CP/M media errors retain the documented warm-boot behavior.

The old two-path layout is simplified: `I` is removed, `E` is the edit action,
and `!` remains the explicit command handoff to CCP. This is a same-process
editor entry call, not an attempt to launch `EDIT.COM` as a child transient.

## Evidence

`node test/increment-14.mjs` and the full `npm run check` pass on Triptych's
four-drive profile. The scenario covers upper- and lowercase `E`, both panels,
selection restoration, dirty-quit cancellation and confirmation, a
recoverable save failure, and unchanged C: and D: images. The full `HC.COM`
artifact is 18,213 bytes, SHA-256
`53e1805d7160ec6e36884170ad12bfeed7ebec8f61fab10ab25155cdf6678cc7`.
