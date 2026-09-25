# Increment 2: drive selection and read-only viewing

Status: accepted after the local Triptych proof and independent Astra review;
the review findings are fixed and the follow-up check passes.

The active panel now cycles its explicit drive through A:, B:, C: and D: with
`[` and `]`. Each panel retains its own drive, page and selection; the initial
pair remains A:/B:. Enter or `V` opens the selected file in a read-only viewer,
and Escape or `Q` returns to the same panel state. Viewer arrow keys move
between pages; after Escape, the viewer polls briefly for the rest of an arrow
sequence before treating it as a return key.

The viewer uses public CP/M calls: it opens the selected FCB, asks BDOS for the
file's logical record count, then reads records by their 24-bit random-record
interface. The current 2 MiB target holds at most 16,384 records per file, so
the viewer's 16-bit record index covers every target file. It rejects a count
that exceeds that index. It shows nine 128-byte records per 80-by-24 screen,
wrapping each record into two
64-column rows. Random reads continue across directory extents. CP/M text EOF
(`0x1a`) ends the display; other control bytes are shown as spaces and high
bytes as dots. `<` and `>` (or Space) and the arrow keys move between pages.
This initial view is deliberately record-oriented; preserving text line breaks
is a later usability improvement.

The test walks the four-drive N04 profile, with media in A: through D:. It
views text from all four drives and pages forward and backward through a
139-record, two-extent file on C:, including the 127/128 record boundary. It
also sends raw Triptych arrow sequences while the viewer is open and verifies
they change pages instead of returning to the panels or changing drives. To
exercise an ordinary BDOS open-miss, the host test changes the selected name
only in Horton's live directory cache, then restores it after confirming the
error message, panel state and subsequent successful view. The four disk
images remain byte-identical.

Triptych's current host CPU API cannot inject a runtime sector-read failure
into an already running guest. The viewer therefore does not claim an
end-to-end injected fatal-read test here; the public BDOS bad-sector path is
covered by Triptych's independent fault-injection tests, and a fatal error from
these BDOS reads still transfers through warm boot to the CCP.

The current HORTON.COM is **3,373 bytes**, loads at `$0100`, and has SHA-256
`09d7365f913119425ba5cfb74862f819b559dbc829f39fb0f4c82ffa5950ff5f`. ATOM
revision `802b5c2d320bec777f427755ff2d7338e3b80a05` assembled it. Run
`node test/increment-2.mjs` for the focused scenario, or `npm run check` for
the build and all accepted and current increment proofs.
