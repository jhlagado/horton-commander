# Increment 9: explicit panel drive selection

Status: accepted. The full Triptych gate passes, independent Astra review found
no concrete findings, and the refreshed public preview passed a Chromium
browser check.

Press `S` to choose a drive for the active panel. Horton prompts for A:–D:;
upper- and lowercase letters work, and Escape cancels. Invalid input reports
the accepted range and waits for dismissal. Choosing a different drive resets
only that panel to its first page and first entry, then rescans its directory.
Choosing the current drive preserves its page and selection. The other panel
and CP/M default drive are unaffected. `D` remains Delete; bracket keys no
longer cycle drives.

`node test/increment-9.mjs` exercises both panels across A: through D:, a
lowercase choice, Escape, invalid input, preserved inactive-panel page and
selection, selection reset after a drive change, the `A>` prompt after exit,
and byte-identical media. It uses a clean Triptych
`triptych-cpu-v0.1-2m-n04` build. All prior focused tests were updated to use
the explicit selector so the complete regression suite exercises the current
key contract.

`npm run check` builds with ATOM and runs increments 0–9. The descriptor-only
[public Triptych link](https://jhlagado.github.io/triptych/?system=https%3A%2F%2Fjhlagado.github.io%2Fhorton-commander%2Freleases%2Fpreview%2Fsystem.json)
boots the refreshed image. A Chromium check started Horton, opened the selector
with `S`, selected C: with lowercase `c` for the left panel, and cancelled a
right-panel selection with Escape while preserving its B: drive.

## Artifact

- `HORTON.COM`: 10,994 bytes, loaded at `$0100`.
- SHA-256: `78d98508985348d46d9bb4ca4701d0d74578b18f75d815ee8123773bbb900abb`.
- Source SHA-256: `81c8e6562f875b1107e6c3e74148e0796f09899e3325d8db7261d4e6fd680720`.
- Preview image: 2,097,152 bytes; SHA-256
  `8d7534c3b659290a1fa8438ac7e3b71b2667f2d43c8177fb4a2e00983ec29e27`.
- ATOM revision: `802b5c2d320bec777f427755ff2d7338e3b80a05`.
- Triptych test revision: `1153c239963d0d38f1de978a7de6c2dcb9999a9f`.
