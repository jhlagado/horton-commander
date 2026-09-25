import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const profileId = "triptych-cpu-v0.1-2m-n04";
const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, profileId);
assert.equal(systemBuild.descriptor.configuredCount, 4);
const hortonBytes = await readFile(resolve(root, "dist/HORTON.COM"));
const debugMap = JSON.parse(
  await readFile(resolve(root, "dist/HORTON.d8.json"), "utf8"),
);
const cacheLeft = debugMap.files["main.asm"].symbols.find(
  (symbol) => symbol.name === "CACHEL",
)?.address;
assert.equal(typeof cacheLeft, "number", "ATOM debug map exposes CACHEL");

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

function setReadOnlyAttribute(image, name) {
  const [base, extension = ""] = name.split(".");
  for (let index = 0; index < 1024; index += 1) {
    const offset = 16_384 + index * 32;
    if (image[offset] === 0xe5) continue;
    const foundBase = Buffer.from(image.subarray(offset + 1, offset + 9));
    const foundExt = Buffer.from(image.subarray(offset + 9, offset + 12));
    for (let byte = 0; byte < foundBase.length; byte += 1) foundBase[byte] &= 0x7f;
    for (let byte = 0; byte < foundExt.length; byte += 1) foundExt[byte] &= 0x7f;
    const expectedBase = Buffer.alloc(8, 0x20);
    const expectedExt = Buffer.alloc(3, 0x20);
    expectedBase.write(base, "ascii");
    expectedExt.write(extension, "ascii");
    if (foundBase.equals(expectedBase) && foundExt.equals(expectedExt)) {
      image[offset + 9] |= 0x80;
      return image;
    }
  }
  throw new Error(`fixture file not found: ${name}`);
}

function makeOneBlockFreeDisk() {
  const disk = CpmDisk.create_two_mib();
  try {
    const freeBytes = disk.free_bytes();
    assert.equal(freeBytes % 2048, 0);
    disk.add_import("FULL.BIN", Buffer.alloc(freeBytes - 2048, 0x5a));
    const image = Buffer.from(disk.export_candidate());
    const check = new CpmDisk(Uint8Array.from(image));
    try {
      assert.equal(check.free_bytes(), 2048);
      return image;
    } finally {
      check.free();
    }
  } finally {
    disk.free();
  }
}

function makeFullDirectoryDisk() {
  const image = makeDisk();
  const directoryOffset = 16_384;
  for (let index = 0; index < 1024; index += 1) {
    const offset = directoryOffset + index * 32;
    image.fill(0, offset, offset + 32);
    image[offset] = 0;
    image.write(`F${String(index).padStart(7, "0")}`, offset + 1, 8, "ascii");
    image.write("DAT", offset + 9, 3, "ascii");
  }
  const check = new CpmDisk(Uint8Array.from(image));
  try {
    assert.equal(check.free_directory_entries(), 0);
  } finally {
    check.free();
  }
  return image;
}

function bootImage(image) {
  const boot = Buffer.from(image);
  boot.set(systemBuild.system, 0);
  return boot;
}

function createMachine(dataDrives) {
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
      const fresh = transcript.subarray(start);
      if (predicate(fresh, terminal)) return terminal.text();
      assert.notEqual(reason, 4, `${description}: CPU halted unexpectedly`);
    }
    throw new Error(
      `${description}: timed out; output was ${transcript
        .subarray(start)
        .toString("latin1")}`,
    );
  }

  function send(bytes, description) {
    assert.equal(cpu.enqueue_serial_input(Buffer.from(bytes)), true, description);
  }

  function waitPrompt(drive) {
    waitFor(`${drive}> CCP prompt`, (fresh) =>
      new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
    );
  }

  function waitPanel(description) {
    const start = transcript.length;
    waitFor(
      description,
      (fresh) =>
        fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
        fresh.includes(ascii("Q quit")),
      start,
    );
    for (let slice = 0; slice < 3; slice += 1) {
      cpu.run_slice(20_000, 300_000);
      drain();
    }
    return terminal.text();
  }

  function launch() {
    waitPrompt("A");
    send(ascii("A:HORTON\r"), "launch HORTON from A:");
    waitPanel("Horton panel screen");
  }

  function arrowDown(expectedName) {
    send([0x1b, 0x5b, 0x42], `select ${expectedName}`);
    return waitFor(`${expectedName} is selected`, (fresh) =>
      fresh.includes(ascii(`\u001b[7m${expectedName}`)) &&
      fresh.includes(ascii("Q quit")),
    );
  }

  function switchPanel() {
    send([9], "switch active panel");
    return waitPanel("active panel switches");
  }

  function beginRename() {
    const start = transcript.length;
    send(ascii("r"), "request rename");
    waitFor(
      "rename prompt",
      (fresh) =>
        fresh.includes(ascii("New CP/M name (8.3)")) &&
        fresh.includes(ascii("Q quit")),
      start,
    );
  }

  function typeRenameName(name) {
    const bytes = ascii(name);
    const start = transcript.length;
    send(bytes, `type rename name ${name} without per-character delays`);
    const expected = Buffer.concat([
      bytes.subarray(0, 12),
      Buffer.alloc(Math.max(0, bytes.length - 12), 7),
    ]);
    waitFor(
      `rename input echoes the bounded name ${name}`,
      (fresh) => fresh.includes(expected),
      start,
    );
    const enterAt = transcript.length;
    send([13], "accept typed rename name");
    return enterAt;
  }

  function overflowRenameAndBackspace(name) {
    const bytes = ascii(name);
    const start = transcript.length;
    send(bytes, `type overlong rename name ${name}`);
    const expected = Buffer.concat([
      bytes.subarray(0, 12),
      Buffer.alloc(Math.max(0, bytes.length - 12), 7),
    ]);
    waitFor(
      "overlong rename input is bounded and rejected",
      (fresh) => fresh.includes(expected),
      start,
    );
    send([8], "backspace clears overlong rename input");
  }

  function finishRename(name, result) {
    const start = typeRenameName(name);
    waitFor(
      `rename result: ${result}`,
      (fresh) => fresh.includes(ascii(result)) && fresh.includes(ascii("Q quit")),
      start,
    );
    send(ascii("x"), "dismiss rename result");
    return waitPanel("rename result returns to panels");
  }

  function cancelRename() {
    send([27], "cancel rename input");
    return waitPanel("rename cancellation returns to panels");
  }

  function beginDelete() {
    const start = transcript.length;
    send(ascii("d"), "request delete");
    waitFor(
      "delete confirmation prompt",
      (fresh) =>
        fresh.includes(ascii("Delete selected file from this drive? Y/N")) &&
        fresh.includes(ascii("Q quit")),
      start,
    );
  }

  function confirmDelete(answer, result = undefined) {
    const start = transcript.length;
    send(ascii(answer), `answer delete confirmation with ${answer}`);
    if (result) {
      waitFor(
        `delete result: ${result}`,
        (fresh) => fresh.includes(ascii(result)) && fresh.includes(ascii("Q quit")),
        start,
      );
      send(ascii("x"), "dismiss delete result");
    }
    return waitPanel("delete returns to panels");
  }

  function beginMove() {
    const start = transcript.length;
    send(ascii("m"), "request cross-panel move");
    waitFor(
      "move confirmation prompt",
      (fresh) =>
        fresh.includes(ascii("Move selected file to the other panel's drive? Y/N")) &&
        fresh.includes(ascii("Q quit")),
      start,
    );
  }

  function confirmMove(result) {
    const start = transcript.length;
    send(ascii("y"), "confirm move");
    waitFor(
      `move result: ${result}`,
      (fresh) => fresh.includes(ascii(result)) && fresh.includes(ascii("Q quit")),
      start,
    );
    send(ascii("x"), "dismiss move result");
    return waitPanel("move result returns to panels");
  }

  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, Uint8Array.from(dataDrives[drive]), true);

  return {
    cpu,
    transcript: () => Buffer.from(transcript),
    send,
    waitFor,
    waitPanel,
    launch,
    arrowDown,
    switchPanel,
    beginRename,
    typeRenameName,
    overflowRenameAndBackspace,
    finishRename,
    cancelRename,
    beginDelete,
    confirmDelete,
    beginMove,
    confirmMove,
    free() {
      cpu.free();
    },
  };
}

// Clearing a bounded-overflow name must preserve the erase loop counter across
// BDOS function 6, then accept a replacement name normally.
{
  const source = ascii("REPLACE AFTER OVERFLOW\r\n\x1a");
  const machine = createMachine([
    bootImage(makeDisk([["HORTON.COM", hortonBytes], ["SOURCE.TXT", source]])),
    makeDisk(),
    makeDisk(),
    makeDisk(),
  ]);
  try {
    machine.launch();
    machine.arrowDown("SOURCE  .TXT");
    machine.beginRename();
    machine.overflowRenameAndBackspace("TOOLONG99.TXT");
    machine.finishRename("FIXED.TXT", "File renamed; panel refreshed.");
    assert.deepEqual(fileNamesFrom(machine.cpu, 0).sort(), ["FIXED.TXT", "HORTON.COM"]);
    assert.deepEqual(readFileFrom(machine.cpu, 0, "FIXED.TXT"), storedRecords(source));
  } finally {
    machine.free();
  }
}

function fileNamesFrom(cpu, drive) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return disk.file_names();
  } finally {
    disk.free();
  }
}

function readFileFrom(cpu, drive, name) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return Buffer.from(disk.read_file(name));
  } finally {
    disk.free();
  }
}

function freeBytesFrom(cpu, drive) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return disk.free_bytes();
  } finally {
    disk.free();
  }
}

function fileReadOnlyFrom(cpu, drive, name) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return disk.file_read_only(name);
  } finally {
    disk.free();
  }
}

function storedRecords(bytes) {
  const records = Buffer.alloc(Math.ceil(bytes.length / 128) * 128, 0x1a);
  bytes.copy(records);
  return records;
}

function countDirectoryName(cpu, drive, name) {
  const image = Buffer.from(cpu.export_drive_checkpoint(drive));
  const [base, extension = ""] = name.split(".");
  const expectedBase = Buffer.alloc(8, 0x20);
  const expectedExt = Buffer.alloc(3, 0x20);
  expectedBase.write(base, "ascii");
  expectedExt.write(extension, "ascii");
  let count = 0;
  for (let index = 0; index < 1024; index += 1) {
    const offset = 16_384 + index * 32;
    if (image[offset] === 0xe5) continue;
    const actualBase = Buffer.from(image.subarray(offset + 1, offset + 9));
    const actualExt = Buffer.from(image.subarray(offset + 9, offset + 12));
    for (let byte = 0; byte < actualBase.length; byte += 1)
      actualBase[byte] &= 0x7f;
    for (let byte = 0; byte < actualExt.length; byte += 1)
      actualExt[byte] &= 0x7f;
    if (actualBase.equals(expectedBase) && actualExt.equals(expectedExt)) count += 1;
  }
  return count;
}

const multiBytes = Buffer.alloc(129 * 128);
for (let index = 0; index < multiBytes.length; index += 1)
  multiBytes[index] = (index * 29 + 13) & 0xff;
const keepBytes = ascii("KEEP THESE BYTES\r\n\x1a");
const hortonRecords = Buffer.alloc(Math.ceil(hortonBytes.length / 128) * 128, 0x1a);
hortonBytes.copy(hortonRecords);

// A function-23 rename must change both extent names and preserve every record.
{
  const drives = [
    bootImage(
      makeDisk([
        ["HORTON.COM", hortonBytes],
        ["KEEP.TXT", keepBytes],
        ["MULTI.BIN", multiBytes],
      ]),
    ),
    makeDisk(),
    makeDisk(),
    makeDisk(),
  ];
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.arrowDown("KEEP    .TXT");
    machine.arrowDown("MULTI   .BIN");
    machine.beginRename();
    machine.finishRename("RENAMED.BIN", "File renamed; panel refreshed.");
    assert.deepEqual(fileNamesFrom(machine.cpu, 0), ["HORTON.COM", "KEEP.TXT", "RENAMED.BIN"]);
    assert.equal(countDirectoryName(machine.cpu, 0, "RENAMED.BIN"), 2, "both logical extents were renamed");
    assert.deepEqual(readFileFrom(machine.cpu, 0, "RENAMED.BIN"), multiBytes);
    assert.deepEqual(readFileFrom(machine.cpu, 0, "KEEP.TXT"), storedRecords(keepBytes));
    assert.deepEqual(readFileFrom(machine.cpu, 0, "HORTON.COM"), hortonRecords);
  } finally {
    machine.free();
  }
}

// Name validation, cancellation, same-name and collision paths do not mutate the disk.
{
  const drives = [
    bootImage(
      makeDisk([
        ["HORTON.COM", hortonBytes],
        ["SOURCE.TXT", ascii("SOURCE CONTENT\r\n\x1a")],
        ["TAKEN.TXT", ascii("DO NOT REPLACE\r\n\x1a")],
      ]),
    ),
    makeDisk(),
    makeDisk(),
    makeDisk(),
  ];
  const start = drives.map((image) => Buffer.from(image));
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.arrowDown("SOURCE  .TXT");
    machine.beginRename();
    machine.finishRename("SOURCE.TXT", "That is already this file's name; no disk change.");
    assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(0)), start[0]);

    machine.beginRename();
    machine.finishRename("TAKEN.TXT", "That name already exists; file was not renamed.");
    assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(0)), start[0]);

    for (const invalidName of ["ABCDEFGHI.X", "SHORT.TOOO", "BAD+.TXT", "TRAIL.", "BAD.NAME.TXT"]) {
      machine.beginRename();
      machine.finishRename(invalidName, "Invalid name; use an 8-character name and 3-character type.");
      assert.deepEqual(
        Buffer.from(machine.cpu.export_drive_checkpoint(0)),
        start[0],
        `${invalidName} is rejected without changing the disk`,
      );
    }
    machine.beginRename();
    machine.finishRename("TOOLONG99.TXT", "Invalid name; use an 8-character name and 3-character type.");
    assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(0)), start[0]);

    machine.beginRename();
    machine.cancelRename();
    assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(0)), start[0]);

    // The live page cache is deliberately made stale. The guest still reaches
    // the real BDOS rename call, which must fail without changing any file.
    machine.cpu.write_ram(cacheLeft + 11, ascii("GONE    TXT"));
    machine.beginRename();
    machine.finishRename("FRESH.TXT", "Rename failed; the file may have changed or the drive is protected.");
    assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(0)), start[0]);
    for (let drive = 1; drive < 4; drive += 1)
      assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(drive)), start[drive]);

    machine.beginRename();
    machine.finishRename("ABCDEFGH.XYZ", "File renamed; panel refreshed.");
    assert.deepEqual(fileNamesFrom(machine.cpu, 0), ["HORTON.COM", "ABCDEFGH.XYZ", "TAKEN.TXT"]);
    assert.deepEqual(
      readFileFrom(machine.cpu, 0, "ABCDEFGH.XYZ"),
      storedRecords(ascii("SOURCE CONTENT\r\n\x1a")),
    );
  } finally {
    machine.free();
  }
}

// Deletion is confirmation-gated and removes a 129-record multi-extent file.
{
  const drives = [
    bootImage(
      makeDisk([
        ["HORTON.COM", hortonBytes],
        ["KEEP.TXT", keepBytes],
        ["MULTI.BIN", multiBytes],
      ]),
    ),
    makeDisk(),
    makeDisk(),
    makeDisk(),
  ];
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.arrowDown("KEEP    .TXT");
    machine.arrowDown("MULTI   .BIN");
    const before = Buffer.from(machine.cpu.export_drive_checkpoint(0));
    const freeBefore = freeBytesFrom(machine.cpu, 0);
    machine.beginDelete();
    machine.confirmDelete("n");
    assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(0)), before, "delete cancellation is byte-for-byte inert");

    machine.beginDelete();
    machine.confirmDelete("y", "File deleted; panel refreshed.");
    assert.deepEqual(fileNamesFrom(machine.cpu, 0), ["HORTON.COM", "KEEP.TXT"]);
    assert.equal(countDirectoryName(machine.cpu, 0, "MULTI.BIN"), 0, "all directory extents were removed");
    assert.equal(freeBytesFrom(machine.cpu, 0) - freeBefore, 9 * 2048, "all nine blocks were returned");
    assert.deepEqual(readFileFrom(machine.cpu, 0, "KEEP.TXT"), storedRecords(keepBytes));
    assert.deepEqual(readFileFrom(machine.cpu, 0, "HORTON.COM"), hortonRecords);
  } finally {
    machine.free();
  }
}

// Move A to B and B to A through verified copy followed by source deletion.
for (const direction of ["A-to-B", "B-to-A"]) {
  const sourceName = direction === "A-to-B" ? "FROMA.BIN" : "FROMB.BIN";
  const sourceBytes = Buffer.alloc(3 * 128);
  for (let index = 0; index < sourceBytes.length; index += 1)
    sourceBytes[index] = (index * 11 + (direction === "A-to-B" ? 5 : 91)) & 0xff;
  const drives = [
    bootImage(
      makeDisk([
        ["HORTON.COM", hortonBytes],
        ...(direction === "A-to-B" ? [[sourceName, sourceBytes]] : [["KEEP.TXT", keepBytes]]),
      ]),
    ),
    makeDisk(direction === "B-to-A" ? [[sourceName, sourceBytes]] : []),
    makeDisk(),
    makeDisk(),
  ];
  const machine = createMachine(drives);
  try {
    machine.launch();
    if (direction === "A-to-B") machine.arrowDown("FROMA   .BIN");
    else {
      machine.switchPanel();
      assert.ok(machine.cpu);
    }
    machine.beginMove();
    machine.confirmMove("Move complete; source deleted after copy verification.");
    const sourceDrive = direction === "A-to-B" ? 0 : 1;
    const destinationDrive = direction === "A-to-B" ? 1 : 0;
    assert.ok(!fileNamesFrom(machine.cpu, sourceDrive).includes(sourceName), `${direction}: source is deleted after success`);
    assert.deepEqual(readFileFrom(machine.cpu, destinationDrive, sourceName), sourceBytes, `${direction}: destination records match`);
    assert.ok(!fileNamesFrom(machine.cpu, destinationDrive).includes("HCOPY.$$$"));
    assert.deepEqual(readFileFrom(machine.cpu, 0, "HORTON.COM"), hortonRecords);
    if (direction === "B-to-A") assert.deepEqual(readFileFrom(machine.cpu, 0, "KEEP.TXT"), storedRecords(keepBytes));
  } finally {
    machine.free();
  }
}

// The same-drive move guard and destination collision leave every user file intact.
{
  const drives = [
    bootImage(makeDisk([["HORTON.COM", hortonBytes], ["SOURCE.BIN", Buffer.from([1, 2, 3])]])),
    makeDisk(),
    makeDisk(),
    makeDisk(),
  ];
  const before = drives.map((image) => Buffer.from(image));
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.switchPanel();
    machine.send(ascii("["), "change right panel from B: to A:");
    const screen = machine.waitPanel("right panel selects A:");
    assert.ok(screen.includes("A: *.*"), screen);
    const moveStart = machine.transcript().length;
    machine.send(ascii("m"), "request same-drive move");
    machine.waitFor(
      "same-drive move refusal",
      (fresh) =>
        fresh.includes(ascii("Move requires different drives; use Rename on one drive.")) &&
        fresh.includes(ascii("Q quit")),
      moveStart,
    );
    machine.send(ascii("x"), "dismiss same-drive move refusal");
    machine.waitPanel("same-drive refusal returns to panels");
    for (let drive = 0; drive < 4; drive += 1)
      assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(drive)), before[drive]);
  } finally {
    machine.free();
  }
}

{
  const source = ascii("KEEP SOURCE AFTER COLLISION\r\n\x1a");
  const destination = ascii("KEEP EXISTING TARGET\r\n\x1a");
  const drives = [
    bootImage(makeDisk([["HORTON.COM", hortonBytes], ["COLLIDE.TXT", source]])),
    makeDisk([["COLLIDE.TXT", destination]]),
    makeDisk(),
    makeDisk(),
  ];
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.arrowDown("COLLIDE .TXT");
    machine.beginMove();
    machine.confirmMove("Destination already exists; Horton will not overwrite it.");
    assert.deepEqual(readFileFrom(machine.cpu, 0, "COLLIDE.TXT"), storedRecords(source));
    assert.deepEqual(readFileFrom(machine.cpu, 1, "COLLIDE.TXT"), storedRecords(destination));
    assert.deepEqual(fileNamesFrom(machine.cpu, 0), ["HORTON.COM", "COLLIDE.TXT"]);
    assert.deepEqual(fileNamesFrom(machine.cpu, 1), ["COLLIDE.TXT"]);
  } finally {
    machine.free();
  }
}

// Full-directory and partial-write failures preserve the source and remove the
// temporary destination whenever the BDOS returns normally.
{
  const source = Buffer.alloc(17 * 128, 0xa5);
  const drives = [
    bootImage(makeDisk([["HORTON.COM", hortonBytes], ["SOURCE.BIN", source]])),
    makeOneBlockFreeDisk(),
    makeDisk(),
    makeDisk(),
  ];
  const existing = new CpmDisk(Uint8Array.from(drives[1]));
  let fullFile;
  try {
    fullFile = Buffer.from(existing.read_file("FULL.BIN"));
  } finally {
    existing.free();
  }
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.arrowDown("SOURCE  .BIN");
    machine.beginMove();
    machine.confirmMove("Disk full during copy; source kept and temp cleanup attempted.");
    assert.deepEqual(readFileFrom(machine.cpu, 0, "SOURCE.BIN"), source);
    assert.deepEqual(readFileFrom(machine.cpu, 1, "FULL.BIN"), fullFile);
    assert.deepEqual(fileNamesFrom(machine.cpu, 1), ["FULL.BIN"]);
    assert.equal(freeBytesFrom(machine.cpu, 1), 2048, "partial temporary allocation was returned");
  } finally {
    machine.free();
  }
}

// If the verified destination is published but BDOS refuses to delete a
// read-only source, both complete copies remain and Horton says so explicitly.
{
  const source = ascii("READ ONLY SOURCE SURVIVES\r\n\x1a");
  const sourceImage = setReadOnlyAttribute(
    makeDisk([["HORTON.COM", hortonBytes], ["READONLY.TXT", source]]),
    "READONLY.TXT",
  );
  const drives = [
    bootImage(sourceImage),
    makeDisk(),
    makeDisk(),
    makeDisk(),
  ];
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.arrowDown("READONLY.TXT");
    machine.beginMove();
    const failureAt = machine.transcript().length;
    machine.send(ascii("y"), "confirm move of a read-only source");
    machine.waitFor(
      "CP/M reports the read-only source deletion as fatal",
      (fresh) => fresh.includes(ascii("Bdos Err On A: File R/O")),
      failureAt,
    );
    const restartAt = machine.transcript().length;
    machine.send(ascii("x"), "acknowledge CP/M's fatal disk-error message");
    machine.waitFor(
      "CP/M warm-boots back to its A> prompt",
      (fresh) => /\r\nA>\s*$/.test(fresh.toString("latin1")),
      restartAt,
    );
    const expected = storedRecords(source);
    assert.deepEqual(readFileFrom(machine.cpu, 0, "READONLY.TXT"), expected);
    assert.deepEqual(readFileFrom(machine.cpu, 1, "READONLY.TXT"), expected);
    assert.equal(fileReadOnlyFrom(machine.cpu, 0, "READONLY.TXT"), true);
    assert.equal(fileReadOnlyFrom(machine.cpu, 1, "READONLY.TXT"), true);
    assert.deepEqual(readFileFrom(machine.cpu, 0, "HORTON.COM"), hortonRecords);
    assert.ok(!fileNamesFrom(machine.cpu, 1).includes("HCOPY.$$$"));
  } finally {
    machine.free();
  }
}

{
  const source = ascii("DIRECTORY FULL MUST NOT REMOVE SOURCE\r\n\x1a");
  const drives = [
    bootImage(makeDisk([["HORTON.COM", hortonBytes], ["SOURCE.TXT", source]])),
    makeFullDirectoryDisk(),
    makeDisk(),
    makeDisk(),
  ];
  const machine = createMachine(drives);
  try {
    machine.launch();
    machine.arrowDown("SOURCE  .TXT");
    machine.beginMove();
    machine.confirmMove("Could not create the copy temporary; directory may be full.");
    assert.deepEqual(readFileFrom(machine.cpu, 0, "SOURCE.TXT"), storedRecords(source));
    assert.equal(fileNamesFrom(machine.cpu, 1).length, 1024);
    assert.ok(!fileNamesFrom(machine.cpu, 1).includes("HCOPY.$$$"));
  } finally {
    machine.free();
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      schema: "horton-increment-4-proof-v1",
      passed: true,
      triptych: {
        commit: systemBuild.descriptor.machine.revision,
        cleanCheckout: !systemBuild.descriptor.machine.dirty,
        profile: profileId,
        configuredDrives: ["A", "B", "C", "D"],
      },
      operations: {
        renameMultiExtentRecords: 129,
        renameValidationAndNoop: true,
        renameOverflowBackspaceRecovery: true,
        renameStaleSource: true,
        deleteCancellation: true,
        deleteMultiExtentRecords: 129,
        movesBothDirections: true,
        sameDriveMoveRefused: true,
        destinationCollisionPreservesBothFiles: true,
        partialCopyFailurePreservesSource: true,
        directoryFullPreservesSource: true,
        readOnlySourceDeleteWarmBootsWithBothCopies: true,
      },
      artifact: { bytes: hortonBytes.length, sha256: hash(hortonBytes) },
    },
    null,
    2,
  )}\n`,
);
