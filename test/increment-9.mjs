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
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, "triptych-cpu-v0.1-2m-n04");
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

const namedFiles = (prefix) =>
  Array.from({ length: 21 }, (_, index) => [
    `${prefix}${String(index).padStart(7, "0")}.TXT`,
    ascii(`${prefix} file ${index}\r\n\x1a`),
  ]);
const initialDrives = [
  bootImage(makeDisk([
    ["HORTON.COM", hortonBytes],
    ...namedFiles("A"),
  ])),
  makeDisk(namedFiles("B")),
  makeDisk([["C_NOTE.TXT", ascii("C drive\r\n\x1a")]]),
  makeDisk([["D_NOTE.TXT", ascii("D drive\r\n\x1a")]]),
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

function selectorPrompt(description) {
  const start = transcript.length;
  send(ascii("s"), `${description}: open selector with S`);
  waitFor(`${description}: selector prompt`, (fresh) =>
    fresh.includes(ascii("Select drive A-D for this panel; Esc cancels.")), start);
}

function selectDrive(letter, description) {
  selectorPrompt(description);
  send(ascii(letter), `${description}: choose ${letter}:`);
  return waitPanel(`${description}: selector returns to panels`);
}

function isSelected(name) {
  const rows = terminal.text().split("\n");
  const attributes = terminal.snapshot().attributes;
  let found = false;
  for (let row = 0; row < rows.length; row += 1) {
    let column = rows[row].indexOf(name);
    while (column !== -1) {
      found = true;
      if ((attributes[row * 80 + column] & 4) !== 0) return true;
      column = rows[row].indexOf(name, column + 1);
    }
  }
  assert.ok(found, `${name} is visible`);
  return false;
}

function selectedIn(names) {
  const selected = names.filter(isSelected);
  assert.equal(selected.length, 1, "one candidate is highlighted");
  return selected[0];
}

function changePageAndSelectSecond(prefix, firstFileIndex) {
  send(ascii(">"), `${prefix}: advance to second directory page`);
  waitPanel(`${prefix}: second page appears`);
  send([0x1b, 0x5b, 0x42], `${prefix}: select second row`);
  waitPanel(`${prefix}: second row becomes selected`);
  const candidates = [firstFileIndex, firstFileIndex + 1, firstFileIndex + 2].map(
    (index) => `${prefix}${String(index).padStart(7, "0")}`,
  );
  return selectedIn(candidates);
}

try {
  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, initialDrives[drive], true);
  waitPrompt("A");
  send(ascii("A:HORTON\r"), "launch HORTON from A:");
  waitFor("initial panels", (fresh) => fresh.includes(ascii("Q quit")));
  assert.ok(terminal.text().includes("A: *.*"));
  assert.ok(terminal.text().includes("B: *.*"));
  assert.ok(terminal.text().includes("S drive"));
  assert.ok(!terminal.text().includes("[] drives"));

  // Build nontrivial state in the inactive panel, then verify a drive change
  // in the active panel leaves that page and highlighted file untouched.
  send([9], "activate the right panel");
  waitPanel("right panel is active");
  const rightSelection = changePageAndSelectSecond("B", 18);
  assert.equal(rightSelection, "B0000019");
  send([9], "activate the left panel");
  waitPanel("left panel is active");
  const leftSelection = changePageAndSelectSecond("A", 17);
  assert.equal(leftSelection, "A0000018");

  selectorPrompt("left selection cancellation");
  send([27], "cancel drive selection");
  let screen = waitPanel("Escape cancels without changing either panel");
  assert.ok(screen.includes("A: *.*"));
  assert.ok(screen.includes("B: *.*"));
  assert.ok(screen.includes("A0000018"));
  assert.ok(isSelected(leftSelection));

  selectorPrompt("invalid left drive selection");
  send(ascii("x"), "reject an invalid drive key");
  const invalidAt = transcript.length;
  waitFor("invalid drive feedback", (fresh) =>
    fresh.includes(ascii("Invalid drive; choose A-D.")), invalidAt);
  send(ascii("?"), "dismiss invalid drive feedback");
  screen = waitPanel("invalid drive leaves the panels unchanged");
  assert.ok(screen.includes("A: *.*"));
  assert.ok(screen.includes("B: *.*"));
  assert.ok(screen.includes("A0000018"));
  assert.ok(isSelected(leftSelection));

  screen = selectDrive("a", "lowercase A is accepted without losing state");
  assert.ok(screen.includes("A: *.*"));
  assert.ok(screen.includes("A0000018"));
  assert.ok(isSelected(leftSelection), "choosing the current drive preserves selection");

  for (const [letter, file] of [
    ["B", "B0000000"],
    ["C", "C_NOTE"],
    ["D", "D_NOTE"],
  ]) {
    screen = selectDrive(letter, `left panel explicitly selects ${letter}:`);
    assert.ok(screen.includes(`${letter}: *.*`), screen);
    assert.ok(screen.includes(file), screen);
  }
  assert.ok(isSelected("D_NOTE"), "a changed drive selects its first entry");

  send([9], "return to the inactive B: panel");
  screen = waitPanel("right panel retains its prior page and selection");
  assert.ok(screen.includes("B: *.*"));
  assert.ok(screen.includes("B0000018"));
  assert.ok(screen.includes("B0000019"));
  assert.ok(isSelected(rightSelection), "right panel selection survived left changes");

  for (const [letter, file] of [
    ["A", "A0000000"],
    ["B", "B0000000"],
    ["C", "C_NOTE"],
    ["D", "D_NOTE"],
  ]) {
    screen = selectDrive(letter, `right panel explicitly selects ${letter}:`);
    assert.ok(screen.includes(`${letter}: *.*`), screen);
    assert.ok(screen.includes(file), screen);
  }
  assert.ok(isSelected("D_NOTE"));

  send(ascii("q"), "quit Horton");
  waitPrompt("A");
  for (let drive = 0; drive < 4; drive += 1) {
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      initialDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: unchanged by selection`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "horton-increment-9-proof-v1",
        passed: true,
        triptych: {
          commit: systemBuild.descriptor.machine.revision,
          cleanCheckout: !systemBuild.descriptor.machine.dirty,
          profile: systemBuild.descriptor.residentProfile,
          systemSha256: systemBuild.descriptor.system.sha256,
          bootstrapSha256: systemBuild.descriptor.bootstrap.sha256,
        },
        driveSelection: {
          key: "S",
          explicitChoices: ["A", "B", "C", "D"],
          lowercaseAccepted: true,
          escapeCancels: true,
          invalidKeyPreservesState: true,
          choosingCurrentDrivePreservesPageAndSelection: true,
          changesBothPanelsIndependently: true,
          inactivePanelPageAndSelectionPreserved: true,
          defaultCpmDriveRemains: "A",
        },
        diskImagesUnchanged: true,
        horton: {
          bytes: hortonBytes.length,
          sha256: sha256(hortonBytes),
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  cpu.free();
}
