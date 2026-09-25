import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, "triptych-cpu-v0.1-2m-n04");
assert.equal(systemBuild.descriptor.configuredCount, 4);
const hortonBytes = await import("node:fs/promises").then(({ readFile }) =>
  readFile(resolve(root, "dist/HORTON.COM")),
);

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

// A tiny fixture creates a genuine zero-record CP/M file through BDOS. The
// host disk import helper deliberately rejects zero-byte imports.
const makeEmptyFileCom = Buffer.from([
  0x11, 0x11, 0x01, // LD DE,FCB at $0111
  0x0e, 0x16, // LD C,22 (make file)
  0xcd, 0x05, 0x00, // CALL 5
  0x11, 0x11, 0x01, // LD DE,FCB
  0x0e, 0x10, // LD C,16 (close)
  0xcd, 0x05, 0x00, // CALL 5
  0xc9, // RET to the CCP
  0x00, // FCB drive: current default drive
  ...ascii("ZERO    DAT"),
  ...Array(24).fill(0),
]);
assert.equal(makeEmptyFileCom[17], 0);
assert.equal(makeEmptyFileCom.length, 53);

const largeRecordCount = 16_000;
const initialDrives = [
  bootImage(makeDisk([
    ["HORTON.COM", hortonBytes],
    ["ONE.DAT", Buffer.alloc(128, 0x31)],
    ["MANY.DAT", Buffer.alloc(129 * 128, 0x32)],
    ["ZZZERO.COM", makeEmptyFileCom],
  ])),
  makeDisk([["BFILE.DAT", ascii("right panel\r\n\x1a")]]),
  makeDisk([["LARGE.DAT", Buffer.alloc(largeRecordCount * 128, 0x33)]]),
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
  throw new Error(
    `${description}: timed out; output was ${transcript
      .subarray(start)
      .toString("latin1")}`,
  );
}

function waitPrompt(drive) {
  waitFor(`${drive}> CCP prompt`, (fresh) =>
    new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
  );
}

function send(bytes, description) {
  assert.equal(cpu.enqueue_serial_input(Buffer.from(bytes)), true, description);
}

function waitPanel(description) {
  const start = transcript.length;
  waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
      fresh.includes(ascii("Q quit")), start);
  return terminal.text();
}

function isSelected(fragment) {
  const rows = terminal.text().split("\n");
  const attributes = terminal.snapshot().attributes;
  let found = false;
  for (let row = 0; row < rows.length; row += 1) {
    let column = rows[row].indexOf(fragment);
    while (column !== -1) {
      found = true;
      if ((attributes[row * 80 + column] & 4) !== 0) return true;
      column = rows[row].indexOf(fragment, column + 1);
    }
  }
  assert.ok(found, `${fragment} is visible`);
  return false;
}

function assertSize(records) {
  const display = String(records).padStart(5, "0");
  assert.ok(
    terminal.text().includes(`Size: ${display} rec`),
    `status displays ${records} logical records:\n${terminal.text()}`,
  );
}

function moveDownUntilSelected(fragment) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (isSelected(fragment)) return;
    send([0x1b, 0x5b, 0x42], `select ${fragment} with Down`);
    waitPanel(`${fragment} selection redraws`);
  }
  assert.fail(`${fragment} became selected within the current page`);
}

try {
  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, initialDrives[drive], true);
  waitPrompt("A");
  send(ascii("A:ZZZERO\r"), "create an empty file through CP/M BDOS");
  waitPrompt("A");

  const afterEmptyFile = Buffer.from(cpu.export_drive_checkpoint(0));
  const verifyEmpty = new CpmDisk(Uint8Array.from(afterEmptyFile));
  try {
    assert.ok(verifyEmpty.file_names().includes("ZERO.DAT"));
    assert.equal(verifyEmpty.file_records("ZERO.DAT"), 0);
  } finally {
    verifyEmpty.free();
  }

  send(ascii("A:HORTON\r"), "launch Horton after creating zero-record file");
  waitFor("initial panels", (fresh) => fresh.includes(ascii("Q quit")));
  assert.ok(terminal.text().includes("Tab panel"));
  assert.ok(terminal.text().includes("Size:"));
  assert.ok(isSelected("HORTON"));
  assertSize(Math.ceil(hortonBytes.length / 128));

  moveDownUntilSelected("ONE");
  assertSize(1);
  moveDownUntilSelected("MANY");
  assertSize(129);
  moveDownUntilSelected("ZERO    .DAT");
  assertSize(0);

  send([9], "activate the right panel");
  waitPanel("right panel selected");
  assert.ok(isSelected("BFILE"));
  assertSize(1);

  send([9], "return to the left panel");
  waitPanel("left panel selected again");
  assert.ok(isSelected("ZERO    .DAT"));
  assertSize(0);

  const promptStart = transcript.length;
  send(ascii("s"), "open drive selector");
  waitFor("drive selector prompt", (fresh) =>
    fresh.includes(ascii("Select drive A-D")), promptStart);
  send(ascii("C"), "select the large-file C drive");
  waitPanel("large-file C drive panel");
  assert.ok(terminal.text().includes("C: *.*"), terminal.text());
  assert.ok(isSelected("LARGE"));
  assertSize(largeRecordCount);

  const emptyPromptStart = transcript.length;
  send(ascii("s"), "open drive selector for an empty drive");
  waitFor("second drive selector prompt", (fresh) =>
    fresh.includes(ascii("Select drive A-D")), emptyPromptStart);
  send(ascii("D"), "select the empty D drive");
  waitPanel("empty D drive panel");
  assert.ok(terminal.text().includes("D: *.*"));
  assert.ok(terminal.text().includes("Size: -- rec"));

  send(ascii("q"), "quit Horton");
  waitPrompt("A");
  assert.deepEqual(
    Buffer.from(cpu.export_drive_checkpoint(0)),
    afterEmptyFile,
    "size queries do not alter A: after the fixture creates its empty file",
  );
  for (let drive = 1; drive < 4; drive += 1) {
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      initialDrives[drive],
      `size queries leave ${String.fromCharCode(65 + drive)}: unchanged`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "horton-increment-10-proof-v1",
        passed: true,
        triptych: {
          commit: systemBuild.descriptor.machine.revision,
          cleanCheckout: !systemBuild.descriptor.machine.dirty,
          profile: systemBuild.descriptor.residentProfile,
        },
        displayedLogicalRecords: {
          selectedExecutable: Math.ceil(hortonBytes.length / 128),
          oneRecord: 1,
          multipleExtents: 129,
          largeFile: largeRecordCount,
          emptyFile: 0,
          emptyDrive: "--",
        },
        activePanelSwitchUpdatesSize: true,
        allDisksUnchangedBySizeQueries: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  cpu.free();
}
