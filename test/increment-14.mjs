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
  import(pathToFileURL(resolve(triptychRoot, "crates/triptych-host-wasm/web/terminal.js"))),
  import(pathToFileURL(resolve(triptychRoot, "tools/lib/two-mib-system.mjs"))),
]);
const { TriptychCpu, CpmDisk } = createRequire(import.meta.url)(
  resolve(triptychRoot, "dist/wasm/triptych_host_wasm.js"),
);
const ascii = (value) => Buffer.from(value, "ascii");
const profileId = "triptych-cpu-v0.1-2m-n04";
const systemBuild = await buildTwoMibSystem(triptychRoot, 4, { allowDirty: false });
assert.equal(systemBuild.descriptor.residentProfile, profileId);
assert.equal(systemBuild.descriptor.configuredCount, 4);
const hortonBytes = await readFile(resolve(root, "dist/HC.COM"));
const debugMap = JSON.parse(await readFile(resolve(root, "dist/HC.d8.json"), "utf8"));
function symbolAddress(name) {
  const symbol = Object.values(debugMap.files)
    .flatMap((file) => file.symbols)
    .find((entry) => entry?.name === name);
  assert.ok(symbol, `debug map contains ${name}`);
  return symbol.address ?? symbol.value;
}

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

const alpha = ascii("ALPHA TEXT");
const beta = ascii("BETA TEXT");
const keep = ascii("ORIGINAL CONTENT");
const conflict = Buffer.alloc(128, 0x5a);
const initialDrives = [
  bootImage(makeDisk([["HC.COM", hortonBytes], ["ALPHA.TXT", alpha]])),
  makeDisk([["BETA.TXT", beta], ["FAIL.TXT", keep], ["FAIL.$$$", conflict]]),
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

function waitPrompt(drive) {
  waitFor(`${drive}> CCP prompt`, (fresh) =>
    new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
  );
}

function waitPanel(description) {
  const start = transcript.length;
  waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
      fresh.includes(ascii("E edit here")), start);
  return terminal.text();
}

function isSelected(fragment) {
  const rows = terminal.text().split("\n");
  const attributes = terminal.snapshot().attributes;
  for (let row = 0; row < rows.length; row += 1) {
    const column = rows[row].indexOf(fragment);
    if (column !== -1 && (attributes[row * 80 + column] & 4) !== 0) return true;
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

function openEditor(key, description) {
  const start = transcript.length;
  send(ascii(key), `open ${description} with ${key}`);
  waitFor(`${description} opens in the in-process editor`, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
      fresh.includes(ascii("^Q quit")), start);
}

function fileOn(drive, name) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    assert.ok(disk.file_names().includes(name), `${name} exists on drive ${drive}`);
    return Buffer.from(disk.read_file(name));
  } finally {
    disk.free();
  }
}

try {
  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, initialDrives[drive], true);
  waitPrompt("A");
  send(ascii("A:HC\r"), "launch HC from CCP");
  waitFor("Horton panels open", (fresh) => fresh.includes(ascii("E edit here")));

  moveDownUntilSelected("ALPHA");
  assert.ok(isSelected("ALPHA"), "A: file is selected in the left panel");
  openEditor("E", "A:ALPHA.TXT");
  assert.ok(terminal.text().includes("EDIT A:ALPHA"), "editor status identifies the A: file");
  assert.equal(
    Buffer.from(cpu.read_ram(0x4e00, alpha.length)).toString("ascii"),
    alpha.toString("ascii"),
    "the selected A: document loads before editing",
  );
  send(ascii("X"), "modify A: document");
  waitFor("A: insertion reaches the displayed document", (_fresh, screen) =>
    screen.text().includes("XALPHA TEXT"),
  );
  let screen = terminal.text();
  send([17], "request to quit with unsaved changes");
  waitFor("dirty-quit warning appears", (fresh) =>
    fresh.includes(ascii("Discard changes? ^Q again")),
  );
  screen = terminal.text();
  assert.ok(screen.includes("XALPHA TEXT"), `warning retains visible draft:\n${screen}`);
  assert.equal(cpu.read_ram(symbolAddress("EDSTATUS"), 1)[0], 4);
  send([0x1b, 0x5b, 0x44], "cancel dirty quit by moving left");
  waitFor("cancelled quit leaves the editor open", (fresh) =>
    fresh.includes(ascii("^Q quit")),
  );
  screen = terminal.text();
  assert.notEqual(cpu.read_ram(symbolAddress("EDSTATUS"), 1)[0], 4);
  assert.ok(
    terminal.text().includes("XALPHA TEXT"),
    `cancelled quit retains the inserted text:\n${screen}`,
  );
  send([19], "save after cancelling dirty quit");
  waitFor("A: file saves in place", (fresh) => fresh.includes(ascii("Saved")));
  send([17], "quit clean editor");
  screen = waitPanel("A: edit returns to Horton");
  assert.ok(isSelected("ALPHA"), `A: selection is restored:\n${screen}`);
  assert.equal(fileOn(0, "ALPHA.TXT").subarray(0, 6).toString("ascii"), "XALPHA");
  assert.ok(
    fileOn(0, "HC.COM").subarray(0, hortonBytes.length).equals(hortonBytes),
    "HC.COM remains unchanged",
  );

  send([9], "activate the right-hand B: panel");
  waitPanel("B: panel becomes active");
  moveDownUntilSelected("FAIL");
  assert.ok(isSelected("FAIL"), "the recoverable-failure target is selected on B:");
  openEditor("e", "B:FAIL.TXT");
  assert.ok(terminal.text().includes("EDIT B:FAIL"), "editor status identifies the B: file");
  send(ascii("Y"), "edit the B: draft");
  send([19], "attempt save with a conflicting temporary file");
  waitFor("recoverable save failure is reported", (fresh) =>
    fresh.includes(ascii("Save failed")),
  );
  assert.ok(terminal.text().includes("YORIGINAL CONTENT"), "save failure retains the draft on screen");
  assert.equal(fileOn(1, "FAIL.TXT").subarray(0, keep.length).toString("ascii"), keep.toString("ascii"));
  assert.deepEqual(fileOn(1, "FAIL.$$$"), conflict, "conflicting temporary file is untouched");

  send(ascii("Z"), "continue editing after recoverable save failure");
  waitFor("draft remains editable after save failure", (_fresh, screen) =>
    screen.text().includes("YZORIGINAL CONTENT"),
  );
  send([17], "request discard after failed save");
  waitFor("failed draft still receives dirty-quit warning", (fresh) =>
    fresh.includes(ascii("Discard changes? ^Q again")),
  );
  send([17], "confirm discard and return to Horton");
  screen = waitPanel("discard returns to Horton");
  assert.ok(isSelected("FAIL"), `B: selection is restored:\n${screen}`);
  assert.equal(fileOn(1, "FAIL.TXT").subarray(0, keep.length).toString("ascii"), keep.toString("ascii"));
  assert.deepEqual(
    Buffer.from(cpu.export_drive_checkpoint(1)),
    initialDrives[1],
    "recoverable save failure and discard leave B: byte-identical",
  );

  send(ascii("q"), "quit Horton");
  waitPrompt("A");
  for (const drive of [2, 3])
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      initialDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: remains byte-identical`,
    );

  process.stdout.write(`${JSON.stringify({
    schema: "horton-increment-14-proof-v1",
    passed: true,
    profile: profileId,
    editorKey: { upperAndLowercaseE: true, leftPanelA: true, rightPanelB: true },
    dirtyQuit: { warningShown: true, cancellationKeepsDraft: true, confirmationDiscards: true },
    recoverableSaveFailure: { reported: true, draftRetainedAndEditable: true, originalAndConflictUntouched: true },
    selectionRestored: true,
    drivesCDUnchanged: true,
  }, null, 2)}\n`);
} finally {
  cpu.free();
}
