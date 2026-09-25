# Increment 1: live two-panel listings

Status: accepted after local Triptych proof and independent Astra review; no
blocking findings. Full-directory rescanning remains a recorded performance
concern for later qualification.

HORTON.COM now reads the current user-area-zero directory from explicit A: and
B: FCBs through BDOS Search First and Search Next. It draws an 80-by-24 ANSI
two-panel screen, caches 18 eleven-byte names per panel, highlights the active
selection, switches panels with Tab or the left/right arrows, moves the
selection with up/down, pages with `<` and `>`, and returns to the CCP with
`q`. An empty panel is shown as blank. Entries with nonzero extent numbers are
omitted, so a multi-extent file appears once. Filename attribute bits are
masked before display.

The A: fixture fills all 1,024 directory slots. It contains HORTON.COM, a
17 KiB MULTI.BIN occupying two extents, and 1,021 legal empty first extents.
The disk-image import helper rejects zero-byte imports, so the test writes
those CP/M directory records directly with RC=0 and no allocated blocks; this
fills directory capacity without exhausting data blocks. The screen shows
MULTI.BIN once, traverses 57 pages, reaches F0001020.DAT on the final page,
and displays the final 15 files. B: is empty in this scenario. C: and D: also
have media inserted under the assumed four-drive N04 profile. All four disk
images are byte-identical after the session.

The full-directory scan is deliberately simple, but its current cost is
visible: every page request scans the directory from the beginning to count
first extents and populate its visible cache. Across the 56 transitions to the
last page, the slowest measured navigation took 10,946,155 Z80 T-states. This
is emulator cycle evidence, not a physical Triptych timing measurement; the
cost deserves review before the increment is accepted.

At the increment 1 checkpoint, HORTON.COM was **1,983 bytes**, loaded at
`$0100`, and had SHA-256
`6f96370674c90483223c962076d0a21bb26b68801945f6f4367e29b99802aef2`. ATOM
revision `802b5c2d320bec777f427755ff2d7338e3b80a05` assembled it. The test
machine is the clean Triptych checkout at
`62f49d7fada9e5bf714f175ef992d8e89cffbc8a`, using
`triptych-cpu-v0.1-2m-n04`; the system and bootstrap digests are recorded in
the JSON proof emitted by `test/increment-1.mjs`.

Run `node test/increment-1.mjs` to repeat the full-directory scenario. Run
`npm run check` to rebuild and run it together with the CP/M and editor-handoff
regression.
