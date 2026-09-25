import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const triptychRoot = resolve(
  process.env.TRIPTYCH_ROOT ?? resolve(root, "../triptych"),
);
const [{ TerminalBuffer }, { buildTwoMibSystem }] = await Promise.all([
  import(
    pathToFileURL(
      resolve(triptychRoot, "crates/triptych-host-wasm/web/terminal.js"),
    ),
  ),
  import(pathToFileURL(resolve(triptychRoot, "tools/lib/two-mib-system.mjs"))),
]);
const { TriptychCpu, CpmDisk } = createRequire(import.meta.url)(
  resolve(triptychRoot, "dist/wasm/triptych_host_wasm.js"),
);
const ascii = (value) => Buffer.from(value, "ascii");
const profileId = "triptych-cpu-v0.1-2m-n04";
const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, profileId);
assert.equal(systemBuild.descriptor.configuredCount, 4);
const hortonBytes = await readFile(resolve(root, "dist/HORTON.COM"));

function makeDisk(files = []) {
  const disk = CpmDisk.create_two_mib();
  try {
    for (const [name, bytes] of files)
      disk.add_import(name, Uint8Array.from(bytes));
    return Buffer.from(disk.export_candidate());
  } finally {
    disk.free();
  }
}

function bootImage(image) {
  const boot = Buffer.from(image);
  boot.set(systemBuild.system, 0);
  return boot;
}

const zeroFileCom = Buffer.from([
  0x11, 0x11, 0x01,
  0x0e, 0x16,
  0xcd, 0x05, 0x00,
  0x11, 0x11, 0x01,
  0x0e, 0x10,
  0xcd, 0x05, 0x00,
  0xc9,
  0x00,
  ...ascii("ZERO    DAT"),
  ...Array(24).fill(0),
]);

const boundaryBytes = Buffer.alloc(130 * 128);
for (let index = 0; index < boundaryBytes.length; index += 1)
  boundaryBytes[index] = 0x30 + (index % 64);
boundaryBytes.set(ascii("PAGE2"), 2 * 128);
boundaryBytes.set(ascii("BOUNDARY127"), 127 * 128);
boundaryBytes.set(ascii("EXTENT128"), 128 * 128);

const initialDrives = [
  bootImage(makeDisk([
    ["HORTON.COM", hortonBytes],
    ["CROSS.BIN", boundaryBytes],
    ["MAKEZERO.COM", zeroFileCom],
  ])),
  makeDisk(),
  makeDisk(),
  makeDisk(),
].map((image) => Buffer.from(image));

const cpu = new TriptychCpu(systemBuild.bootstrap);
const terminal = new TerminalBuffer();
let transcript = Buffer.alloc(0);

function drain() {
  const bytes = Buffer.from(cpu.take_serial_output());
  if (bytes.length > 0) {
    transcript = Buffer.concat([transcript, bytes]);
    terminal.write(bytes);
  }
}

function waitFor(description, predicate, start = transcript.length) {
  for (let slice = 0; slice < 20_000; slice += 1) {
    const reason = cpu.run_slice(20_000, 300_000);
    drain();
    if (predicate(transcript.subarray(start), terminal)) return;
    assert.notEqual(reason, 4, `${description}: CPU halted unexpectedly`);
  }
  throw new Error(`${description}: timed out\n${terminal.text()}`);
}

function send(bytes, description) {
  assert.equal(cpu.enqueue_serial_input(Buffer.from(bytes)), true, description);
}

function pumpSlices(count) {
  for (let slice = 0; slice < count; slice += 1) {
    const reason = cpu.run_slice(20_000, 300_000);
    drain();
    assert.notEqual(reason, 4, "CPU remains active while draining input");
  }
}

function waitPrompt(drive) {
  waitFor(`${drive}> CCP prompt`, (fresh) =>
    new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
  );
}

function waitPanel(description) {
  const start = transcript.length;
  waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
    fresh.includes(ascii("Q quit")), start);
  return terminal.text();
}

function waitText(description) {
  const start = transcript.length;
  waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
    fresh.includes(ascii("H: hex")), start);
  return terminal.text();
}

function waitHex(description) {
  const start = transcript.length;
  waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
    fresh.includes(ascii("[HEX]")) &&
    fresh.includes(ascii("T: text")), start);
  return terminal.text();
}

function isSelected(fragment) {
  const rows = terminal.text().split("\n");
  const attributes = terminal.snapshot().attributes;
  for (let row = 0; row < rows.length; row += 1) {
    const column = rows[row].indexOf(fragment);
    if (column !== -1 && (attributes[row * 80 + column] & 4) !== 0)
      return true;
  }
  return false;
}

function moveDownUntilSelected(fragment) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (isSelected(fragment)) return;
    send([0x1b, 0x5b, 0x42], `select ${fragment} with Down`);
    waitPanel(`${fragment} selection redraws`);
  }
  assert.fail(`${fragment} became selected within the current page`);
}

function returnToPanels() {
  send([27], "leave viewer");
  return waitPanel("viewer returns to the panels");
}

try {
  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, initialDrives[drive], true);

  waitPrompt("A");
  send(ascii("A:MAKEZERO\r"), "create a genuine zero-record file");
  waitPrompt("A");
  const baselineDrives = [0, 1, 2, 3].map((drive) =>
    Buffer.from(cpu.export_drive_checkpoint(drive)),
  );

  send(ascii("A:HORTON\r"), "launch Horton from the CCP");
  waitFor("initial panels", (fresh) => fresh.includes(ascii("Q quit")));
  moveDownUntilSelected("CROSS");
  send([13], "open the selected multi-extent file");
  let screen = waitText("text viewer opens");
  assert.ok(screen.includes("CROSS"), screen);
  assert.ok(screen.includes("0123456789:;<=>?"), screen);

  send(ascii("h"), "switch to the hexadecimal view");
  screen = waitHex("hex viewer opens at file offset zero");
  assert.ok(screen.includes("000000 30 31 32 33 34 35 36 37 38 39 3A 3B 3C 3D 3E 3F |0123456789:;<=>?|"), screen);
  assert.ok(screen.includes("0000F0"), "the page shows the final row's byte offset");

  send(ascii(">"), "advance one hex page");
  screen = waitHex("hex page advances by 256 bytes");
  assert.ok(screen.includes("000100"), screen);

  send(ascii("t"), "switch back to text at the same file position");
  screen = waitText("text viewer restores its current record");
  assert.ok(screen.includes("PAGE2"), screen);
  send(ascii("H"), "switch to hexadecimal mode with uppercase H");
  screen = waitHex("hex viewer keeps the current record position");
  assert.ok(screen.includes("000100"), screen);

  send(ascii("<"), "return to the first hex page");
  screen = waitHex("hex viewer returns to offset zero");
  assert.ok(screen.includes("000000"), screen);

  for (let page = 1; page <= 63; page += 1) {
    send(ascii(">"), `advance to hex page ${page + 1}`);
    screen = waitHex(`hex page ${page + 1} redraws`);
  }
  assert.ok(screen.includes("003F00"), "record 126 starts at offset 003F00");
  assert.ok(screen.includes("003F80 42 4F 55 4E 44 41 52 59 31 32 37"), screen);

  send(ascii(">"), "advance across the 127/128 record extent boundary");
  screen = waitHex("record 128 is shown on the next hex page");
  assert.ok(screen.includes("004000 45 58 54 45 4E 54 31 32 38"), screen);

  send(ascii(">"), "try to advance beyond the last allocated record");
  pumpSlices(8);
  screen = terminal.text();
  assert.ok(screen.includes("004000"), screen);
  assert.ok(screen.includes("End of file"), screen);

  send(ascii("<"), "move back from the final page");
  screen = waitHex("hex viewer returns across the extent boundary");
  assert.ok(screen.includes("003F00"), screen);

  returnToPanels();
  moveDownUntilSelected("ZERO    .DAT");
  send([13], "open the empty file");
  waitText("text viewer opens for the empty file");
  send(ascii("h"), "open the hex view of the empty file");
  screen = waitHex("empty hex view displays its end-of-file state");
  assert.ok(screen.includes("End of file"), screen);
  assert.ok(!screen.includes("000000"), "empty file has no byte rows");
  returnToPanels();
  send(ascii("q"), "quit Horton cleanly");
  waitPrompt("A");

  for (let drive = 0; drive < 4; drive += 1)
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      baselineDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: unchanged by viewing`,
    );

  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "horton-increment-11-proof-v1",
        passed: true,
        profile: profileId,
        viewer: {
          textAndHexModes: true,
          bytesPerRow: 16,
          rowsPerPage: 16,
          byteOffset: "six-digit hexadecimal",
          pagingRecords: 2,
          crossesExtentBoundary: true,
          emptyFile: true,
          readOnly: true,
        },
        horton: { bytes: hortonBytes.length },
        drivesUnchanged: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  cpu.free();
}
