# Increment 15: keep Horton's editor deliberately quick

Status: accepted after the complete Triptych suite and independent Astra
review found no blockers.

## Behavior

Horton's editor is a quick text editor for small changes. Its title identifies
the selected drive and filename; the help describes the commands the quick
profile actually supports. Search and replace are not exposed in Horton.
Standalone Edit retains its fuller editor direction. The current document
capacity remains 32 KiB.

If an insertion would exceed that limit, Horton reports it and leaves the
whole document and clean/dirty state unchanged. It does not partially write
the insertion. The editor segment is 5,157 bytes in the qualified build.

## Evidence

`node test/increment-15.mjs` and the full `npm run check` pass on the Triptych
four-drive profile. The proof checks both panel drive/name status, the key
help, absence of search/replace prompts, and a full-buffer rejected insert by
comparing the entire in-memory document before and after. Disk images remain
unchanged. Independent review asked for the in-memory equality check; it was
added before acceptance.
