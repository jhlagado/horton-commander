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
const hortonBytes = await readFile(resolve(root, "dist/HC.COM"));
const debugMap = JSON.parse(
  await readFile(resolve(root, "dist/HC.d8.json"), "utf8"),
);
function symbolAddress(name) {
  const symbol = Object.values(debugMap.files)
    .flatMap((file) => file.symbols)
    .find((entry) => entry.name === name);
  assert.ok(symbol, `debug map contains ${name}`);
  return symbol.address;
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

function makeCapacityText(length) {
  const bytes = Buffer.alloc(length, 0x41);
  for (let start = 0; start + 79 < length; start += 80) {
    bytes[start + 78] = 13;
    bytes[start + 79] = 10;
  }
  return bytes;
}

const originalText = Buffer.alloc(128, 0x41);
const exactCapacityText = makeCapacityText(32_768);
const overCapacityText = makeCapacityText(32_769);
const drives = [
  bootImage(makeDisk([["HC.COM", hortonBytes]])),
  makeDisk([
    ["EDIT.TXT", originalText],
    ["FULL.TXT", exactCapacityText],
    ["OVER.TXT", overCapacityText],
  ]),
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
      fresh.includes(ascii("Q quit")), start);
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

function moveUpUntilSelected(fragment) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (isSelected(fragment)) return;
    send([0x1b, 0x5b, 0x41], `select ${fragment} with Up`);
    waitPanel(`${fragment} selection redraws`);
  }
  assert.fail(`${fragment} became selected within the current page`);
}

function enterInlineEditor(description) {
  const start = transcript.length;
  send(ascii("e"), `open ${description} with lowercase E`);
  waitFor(`${description} opens in the editor`, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
      fresh.includes(ascii("^Q quit")), start);
}

function exitEditor(description) {
  send([17], `exit ${description} with Ctrl-Q`);
  return waitPanel(`${description} returns to Horton`);
}

function fileOn(drive, name) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    assert.ok(disk.file_names().includes(name), `${name} remains on drive ${drive}`);
    return {
      records: disk.file_records(name),
      bytes: Buffer.from(disk.read_file(name)),
      names: disk.file_names(),
    };
  } finally {
    disk.free();
  }
}

try {
  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, drives[drive], true);
  waitPrompt("A");
  send(ascii("A:HC\r"), "launch Horton from the CCP");
  waitFor("Horton panels open", (fresh) => fresh.includes(ascii("Q quit")));
  send([9], "select the right-hand B drive panel");
  waitPanel("B drive panel becomes active");
  assert.ok(isSelected("EDIT"), "the initial B: selection is the editable file");

  enterInlineEditor("B:EDIT.TXT");
  send(ascii("X"), "insert one character in the selected B: file");
  send([19], "save from the in-process editor with Ctrl-S");
  waitFor("editor confirms the save", (fresh) => fresh.includes(ascii("Saved")));
  let screen = exitEditor("B:EDIT.TXT");
  assert.ok(screen.includes("B:"), "Horton returns with the B panel visible");
  assert.ok(isSelected("EDIT"), `Horton restores the same selected filename:\n${screen}`);
  assert.ok(screen.includes("Size: 00002 rec"), "the refreshed size shows two records");

  const edited = fileOn(1, "EDIT.TXT");
  const expectedText = Buffer.concat([ascii("X"), originalText]);
  assert.equal(edited.records, 2, "the saved file grows to two CP/M records");
  assert.deepEqual(edited.bytes.subarray(0, expectedText.length), expectedText);
  assert.ok(
    edited.bytes.subarray(expectedText.length).every((byte) => byte === 0x1a),
    "the saved final record uses CP/M text padding",
  );
  assert.ok(!edited.names.includes("HORTON.RSM"), "in-process editing creates no handoff session");

  moveUpUntilSelected("FULL");
  screen = terminal.text();
  enterInlineEditor("the 32 KiB document");
  assert.deepEqual(
    Buffer.from(cpu.read_ram(0x4e00, exactCapacityText.length)),
    exactCapacityText,
    "the editor loads the complete 32 KiB text arena",
  );
  screen = exitEditor("the exact-capacity document");
  assert.ok(isSelected("FULL"), "the same large-file selection returns to Horton");

  // Force the in-process filename restoration miss while the right panel is
  // active. This exercises the fallback that resets its page and row to zero.
  enterInlineEditor("the right-panel fallback case");
  cpu.write_ram(
    symbolAddress("VFCB") + 1,
    Buffer.from("MISSING TXT", "ascii"),
  );
  screen = exitEditor("the right-panel fallback case");
  assert.equal(
    cpu.read_ram(symbolAddress("SELR"), 1)[0],
    0,
    "a missing in-process selection falls back to row zero on the right",
  );

  moveDownUntilSelected("OVER");
  screen = terminal.text();
  const errorStart = transcript.length;
  send(ascii("E"), "open the 32 KiB plus one-byte file with uppercase E");
  waitFor("the editor rejects the first byte beyond capacity", (fresh) =>
    fresh.includes(ascii("EDIT error")), errorStart);
  send(ascii("x"), "dismiss the editor capacity error");
  screen = waitPanel("capacity error returns to Horton");
  assert.ok(isSelected("OVER"), "the failed edit returns to the same selection");

  const over = fileOn(1, "OVER.TXT");
  assert.equal(over.records, Math.ceil(overCapacityText.length / 128));
  assert.deepEqual(over.bytes.subarray(0, overCapacityText.length), overCapacityText);
  assert.deepEqual(fileOn(1, "FULL.TXT").bytes.subarray(0, exactCapacityText.length), exactCapacityText);
  send(ascii("q"), "quit Horton");
  waitPrompt("A");

  for (const drive of [0, 2, 3])
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      drives[drive],
      `drive ${String.fromCharCode(65 + drive)}: is unchanged`,
    );

  process.stdout.write(`${JSON.stringify({
    schema: "horton-increment-12-proof-v1",
    passed: true,
    profile: profileId,
    edit: {
      sameProcessReturn: true,
      explicitDrive: "B",
      savedBytes: expectedText.length,
      refreshedRecordCount: edited.records,
      noSessionFile: true,
      preservedPanelAndSelection: true,
    },
    capacity: {
      acceptedBytes: exactCapacityText.length,
      rejectedBytes: overCapacityText.length,
      firstRejectedByte: exactCapacityText.length,
    },
    drivesAcdUnchanged: true,
  }, null, 2)}\n`);
} finally {
  cpu.free();
}
