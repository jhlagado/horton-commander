# Increment 0: target and handoff proof

Status: accepted after the local Triptych scenario and independent Astra review
found no blockers. This is a historical target-and-handoff checkpoint; the
binary has since grown through later increments.

The proof assembles the actual `HORTON.COM` with the pinned ATOM package and
runs it through the Triptych CP/M CCP on the four-drive, 2 MiB resident profile
`triptych-cpu-v0.1-2m-n04`. The scenario inserts media in A:, B:, C: and D:;
A: is read-only and the other three drives are writable. It places the pinned
Triptych `EDIT.COM` and `HORTON.COM` on A:, then inserts distinctive text files
on A: and B:.

The increment 0 probe was **206 bytes**, loaded at `$0100`, and was assembled by
`atom-z80` revision
`802b5c2d320bec777f427755ff2d7338e3b80a05`. Its SHA-256 is
`9ab6f44306065a4627697923bd7ce7adcbf8b95f8e8264da9b6c990d19a65ee9`.
The pinned Edit artifact is version 0.2.0, **5,513 bytes**, SHA-256
`6be83f6edb9ee92387c7b3817f473fbbc389a58ab1a20d9a2a6101e695fb77c4`.
The passing run built the machine profile from clean Triptych commit
`62f49d7fada9e5bf714f175ef992d8e89cffbc8a`. Its system SHA-256 is
`61dd21e3f89be888e3530ec3b414691c343f7ad2c29aa15fac4ff2510c3a5a3e` and its
bootstrap SHA-256 is
`54c6bfd356b4b42f8c51f3b85777a9d2be7aa680945335783c4dd7a6dae8921e`.

The passing headless sequence proves:

- the CCP loads and starts the binary, which clears the supported 80-by-24
  terminal and displays the probe screen;
- ordinary `q` input returns through `RET` to the CCP, while raw ANSI up and
  down arrow bytes reach the program and are recognized;
- `A:EDIT ANOTE.NU` opens the A: file in the real pinned editor and returns to
  the A: prompt;
- after selecting B:, `A:EDIT INPUT.NU` opens the B: file while loading Edit
  from A:, and Ctrl-Q returns through the CCP to the B: prompt;
- `A:HORTON` then loads Horton from A: with B: still selected, and Horton
  returns to the B: prompt again;
- the A:, B:, C: and D: media images remain byte-identical through the proof.

This establishes the leave, edit, CCP return and relaunch boundary. It does
not establish saved Horton panel/selection restoration; increment 5 implements
that session feature. The probe is emulator evidence, not physical Triptych
hardware qualification.

Run `npm run check` to rebuild the current binary and repeat the preserved
handoff regression with the later increment proofs. Set
`TRIPTYCH_ROOT` if the Triptych checkout is not at `../triptych`.
