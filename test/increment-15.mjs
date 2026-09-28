import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const triptychRoot = resolve(process.env.TRIPTYCH_ROOT ?? resolve(root, "../triptych"));
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
const buildManifest = JSON.parse(await readFile(resolve(root, "dist/manifest.json"), "utf8"));
assert.equal(buildManifest.editor.profile, "horton-quick-edit");
assert.ok(buildManifest.editor.bytes < 5522, "quick edit omits the fuller search and replace code");

function makeCapacityText(length) {
  const bytes = Buffer.alloc(length, 0x41);
  for (let start = 0; start + 79 < length; start += 80) {
    bytes[start + 78] = 13;
    bytes[start + 79] = 10;
  }
  return bytes;
}

function makeDisk(files = []) {
  const disk = CpmDisk.create_two_mib();
  try {
    for (const [name, bytes] of files) disk.add_import(name, Uint8Array.from(bytes));
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

const capacityText = makeCapacityText(32_768);
const alphaText = ascii("Alpha quick-edit test.\r\n");
const betaText = ascii("Beta quick-edit test.\r\n");
const initialDrives = [
  bootImage(makeDisk([["HC.COM", hortonBytes], ["ALPHA.TXT", alphaText], ["FULL.TXT", capacityText]])),
  makeDisk([["BETA.TXT", betaText]]),
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
    if (predicate(transcript.subarray(start), terminal)) return terminal.text();
    assert.notEqual(reason, 4, `${description}: unexpected CP/M warm boot`);
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
  return waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) && fresh.includes(ascii("E edit here")), start);
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

function openEditor(description) {
  const start = transcript.length;
  send(ascii("E"), `open ${description} with E`);
  return waitFor(`${description} opens in the editor`, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) && fresh.includes(ascii("^Q quit")), start);
}

function fileBytes(drive, name) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
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
  openEditor("A:ALPHA.TXT");
  assert.ok(terminal.text().includes("EDIT A:ALPHA"), "status identifies the selected A: filename");
  assert.ok(terminal.text().includes("Arrows move"), "status explains the quick-edit controls");
  assert.ok(terminal.text().includes("BS/Del"), "status explains deletion controls");
  assert.ok(!terminal.text().includes("Find:") && !terminal.text().includes("Replace:"));

  for (const [key, label] of [[6, "Ctrl-F"], [14, "Ctrl-N"], [18, "Ctrl-R"]]) {
    const start = transcript.length;
    send([key], `unsupported ${label} stays outside the quick-edit profile`);
    waitFor(`${label} is rejected without opening a prompt`, (fresh, screen) =>
      fresh.includes(Buffer.from([7])) &&
      screen.text().includes("^S save") &&
      !screen.text().includes("Find:") &&
      !screen.text().includes("Replace:"), start);
  }
  send([17], "quit the unchanged A: quick edit");
  let screen = waitPanel("A: quick edit returns to Horton");
  assert.ok(isSelected("ALPHA"), "A: selection is restored");

  send([9], "activate the B: panel");
  screen = waitPanel("B: panel becomes active");
  assert.ok(isSelected("BETA"));
  openEditor("B:BETA.TXT");
  assert.ok(terminal.text().includes("EDIT B:BETA"), "status identifies the selected B: filename");
  send([17], "quit the unchanged B: quick edit");
  screen = waitPanel("B: quick edit returns to Horton");
  assert.ok(isSelected("BETA"), "B: selection is restored");

  send([9], "return to the A: panel");
  waitPanel("A: panel becomes active again");
  moveDownUntilSelected("FULL");
  openEditor("the full 32 KiB document");
  assert.ok(terminal.text().includes("EDIT A:FULL"));
  const fullBefore = Buffer.from(cpu.read_ram(0x4e00, capacityText.length));
  assert.deepEqual(fullBefore, capacityText, "the exact-capacity text file loads intact");
  const insertionStart = transcript.length;
  send(ascii("X"), "reject insertion into a full document");
  screen = waitFor("full-buffer rejection stays visible", (fresh, current) =>
    current.text().includes("Full") && fresh.length > 0, insertionStart);
  assert.ok(!screen.includes("XAAAA"), "the rejected byte was not inserted");
  assert.deepEqual(
    Buffer.from(cpu.read_ram(0x4e00, capacityText.length)),
    fullBefore,
    "full-buffer rejection leaves the complete in-memory document unchanged",
  );
  send([17], "quit after the rejected full-buffer insertion");
  screen = waitPanel("full document returns to Horton without a dirty-quit prompt");
  assert.ok(isSelected("FULL"), "full-document selection is restored");
  assert.deepEqual(fileBytes(0, "FULL.TXT"), capacityText, "full source file remains byte-identical");

  send(ascii("q"), "quit Horton");
  waitPrompt("A");
  for (const drive of [0, 1, 2, 3])
    assert.deepEqual(Buffer.from(cpu.export_drive_checkpoint(drive)), initialDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: is unchanged`);

  process.stdout.write(`${JSON.stringify({
    schema: "horton-increment-15-proof-v1",
    passed: true,
    profile: profileId,
    editorProfile: buildManifest.editor.profile,
    editorBytes: buildManifest.editor.bytes,
    filenameStatus: { driveA: true, driveB: true },
    quickCommands: { navigationAndMutationHelpMatches: true, searchAndReplacePromptsAbsent: true },
    rejectedFullBufferInsert: { visible: true, documentUnchanged: true, dirtyFlagClear: true },
    allDrivesUnchanged: true,
  }, null, 2)}\n`);
} finally {
  cpu.free();
}
