# Increment 11: read-only hexadecimal view

Status: implemented and under review.

Press `H` in the existing text viewer to switch to hexadecimal mode. Press `T`
to return to text at the same record position. Each hex page shows sixteen
rows, with a six-digit byte offset, sixteen byte values and a printable
character column. A page reads two CP/M logical records, and the existing
forward, backward and arrow-key navigation still works. The view remains
read-only.

CP/M gives Horton a logical record count, not the exact byte length of the last
record. The hex view therefore shows all 128 bytes in every allocated record,
including any final-record padding; the display does not imply an exact
unpadded byte length.

`node test/increment-11.mjs` runs the built executable in Triptych's four-drive
profile. It checks the first-page offsets and bytes, both mode switches and
preservation of the current record, paging in both directions, the 127/128
record extent boundary, the final-page end-of-file state, an empty file, and
byte-identical drive images after browsing.

## Artifact

- `HORTON.COM`: 12,045 bytes, loaded at `$0100`.
- Increase from increment 10: 690 bytes.
- SHA-256: `368ef0c84168cdce651da92d10a582c9efed56a8687c67e99c49ce46de77fc59`.
- Source SHA-256: `5d922945c565da6b3314b4030be98df8d91afb1de01b898370a727880390657d`.
- ATOM revision: `802b5c2d320bec777f427755ff2d7338e3b80a05`.
- Triptych test revision: `1153c239963d0d38f1de978a7de6c2dcb9999a9f`.
