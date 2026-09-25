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
const editBytes = await readFile(
  resolve(triptychRoot, "third_party/edit/EDIT.COM"),
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

function fileNames(cpu, drive) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return disk.file_names();
  } finally {
    disk.free();
  }
}

function fileBytes(cpu, drive, name) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return Buffer.from(disk.read_file(name));
  } finally {
    disk.free();
  }
}

function createMachine({
  bFiles = [["INPUT.NU", ascii("original editor text\r\n\x1a")]],
  bExtra = [],
  bDiskImage = null,
  cFiles = [["C_NOTE.TXT", ascii("C drive\r\n\x1a")]],
  dFiles = [["D_NOTE.TXT", ascii("D drive\r\n\x1a")]],
} = {}) {
  const aImage = bootImage(
    makeDisk([
      ["HORTON.COM", hortonBytes],
      ["EDIT.COM", editBytes],
      ["ANOTE.NU", ascii("A drive stays read only\r\n\x1a")],
    ]),
  );
  const bImage = bDiskImage ? Buffer.from(bDiskImage) : makeDisk([...bFiles, ...bExtra]);
  const cImage = makeDisk(cFiles);
  const dImage = makeDisk(dFiles);
  const initialDrives = [aImage, bImage, cImage, dImage].map((image) =>
    Buffer.from(image),
  );
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

  function waitPrompt(drive, description = `${drive}> CCP prompt`) {
    waitFor(description, (fresh) =>
      new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
    );
  }

  function waitPanel(description) {
    const start = transcript.length;
    waitFor(description, (fresh) =>
      fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
      fresh.includes(ascii("Q quit")), start);
  }

  function launch() {
    waitPrompt("A");
    send(ascii("A:HORTON\r"), "launch HORTON");
    waitPanel("Horton panel appears");
    return terminal.text();
  }

  function runCommand(command, drive, expected = undefined) {
    const start = transcript.length;
    send(ascii(`${command}\r`), `enter CCP command ${command}`);
    if (expected)
      waitFor(`${command} output`, (fresh) => fresh.includes(ascii(expected)), start);
    waitPrompt(drive, `${command} returns to ${drive}>`);
  }

  function waitResumePrompt() {
    return waitFor("resume confirmation prompt", (fresh) =>
      fresh.includes(ascii("Resume this session? Y/N:")),
    );
  }

  function confirmResume() {
    send(ascii("y"), "confirm saved session resume");
    waitPanel("saved panel state returns");
  }

  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, initialDrives[drive], drive !== 0);

  return {
    cpu,
    terminal,
    transcript: () => Buffer.from(transcript),
    initialDrives,
    send,
    waitFor,
    waitPrompt,
    waitPanel,
    waitResumePrompt,
    confirmResume,
    launch,
    runCommand,
    fileNames: (drive) => fileNames(cpu, drive),
    fileBytes: (drive, name) => fileBytes(cpu, drive, name),
    free() {
      cpu.free();
    },
  };
}

function crc16CcittFalse(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function makeSessionRecord({ leftName = null, rightName = null, kind = 1 } = {}) {
  const record = Buffer.alloc(128, 0);
  record.write("HORTONRS", 0, "ascii");
  record[8] = 1;
  record[9] = 128;
  record[10] = 0;
  record[11] = 0;
  record[12] = 0;
  record[13] = 1;
  record[14] = 2;
  record[15] = (leftName ? 1 : 0) | (rightName ? 2 : 0);
  if (leftName) Buffer.from(leftName, "ascii").copy(record, 16);
  if (rightName) Buffer.from(rightName, "ascii").copy(record, 27);
  record[38] = kind;
  record.writeUInt16LE(crc16CcittFalse(record.subarray(0, 126)), 126);
  return record;
}

const measurements = { scenarios: [] };

// Real editor handoff: the selected B: file is edited, saved, and resumed by
// name while the other panel and the previous default drive are restored.
{
  const machine = createMachine();
  try {
    machine.launch();
    machine.send([9], "activate the B: panel");
    machine.waitPanel("B: panel becomes active");
    const handoffAt = machine.transcript().length;
    machine.send(ascii("e"), "start Edit handoff");
    machine.waitPrompt("A", "Edit handoff returns to CCP");
    const handoff = machine.transcript().subarray(handoffAt).toString("latin1");
    assert.ok(handoff.includes("Session saved to B:HORTON.RSM."), handoff);
    assert.ok(handoff.includes("B:"), handoff);
    assert.ok(handoff.includes("A:EDIT INPUT.NU"), handoff);
    assert.ok(handoff.includes("\r\nA:\r\n"), handoff);
    assert.ok(handoff.includes("A:HORTON /R"), handoff);
    assert.deepEqual(machine.fileNames(1).sort(), ["HORTON.RSM", "INPUT.NU"]);
    const record = machine.fileBytes(1, "HORTON.RSM");
    assert.equal(record.length, 128);
    assert.equal(record.toString("ascii", 0, 8), "HORTONRS");
    assert.equal(record[8], 1);
    assert.equal(record[9], 128);
    assert.equal(record[10], 1, "active right panel saved");
    assert.equal(record[11], 0, "previous default drive A: saved");
    assert.equal(record[13], 1, "left panel A: saved");
    assert.equal(record[14], 2, "right panel B: saved");
    assert.equal(record[15], 3, "both panel selections saved");
    assert.equal(record.subarray(16, 24).toString("ascii"), "HORTON  ");
    assert.equal(record.subarray(24, 27).toString("ascii"), "COM");
    assert.equal(record.subarray(27, 35).toString("ascii"), "INPUT   ");
    assert.equal(record.subarray(35, 38).toString("ascii"), "NU ");
    assert.equal(record[38], 1, "editor handoff kind saved");
    assert.equal(record.readUInt16LE(126), crc16CcittFalse(record.subarray(0, 126)));

    machine.runCommand("B:", "B");
    const editAt = machine.transcript().length;
    machine.send(ascii("A:EDIT INPUT.NU\r"), "run Edit from A: on B: file");
    machine.waitFor("real Edit opens the selected B: file", (_fresh, screen) =>
      screen.text().includes("^S Save") && screen.text().includes("original editor text"),
      editAt,
    );
    machine.send(ascii("x"), "modify the opened file");
    machine.send([0x13], "save the edited file with Ctrl-S");
    machine.waitFor("Edit reports successful save", (fresh) =>
      fresh.includes(ascii("Saved")),
      editAt,
    );
    machine.send([0x11], "quit Edit with Ctrl-Q");
    machine.waitPrompt("B", "Edit returns through CCP");
    assert.ok(machine.fileBytes(1, "INPUT.NU").toString("ascii").startsWith("x"));

    const resumeAt = machine.transcript().length;
    machine.send(ascii("A:HORTON /R\r"), "explicitly resume the saved session");
    machine.waitResumePrompt();
    const summary = machine.terminal.text();
    assert.ok(summary.includes("Left panel, drive A:"), summary);
    assert.ok(summary.includes("Right panel, drive B:"), summary);
    assert.ok(summary.includes("INPUT.NU"), summary);
    machine.confirmResume();
    const screen = machine.terminal.text();
    assert.ok(screen.includes("A: *.*"), screen);
    assert.ok(screen.includes("B: *.*"), screen);
    assert.ok(screen.includes("INPUT   .NU"), screen);
    assert.equal(machine.fileNames(1).includes("HORTON.RSM"), false, "session is single use");
    machine.send(ascii("!"), "probe restored default drive with a second handoff");
    machine.waitFor("second command prompt", (fresh) =>
      fresh.includes(ascii("CCP command, up to 64 chars")),
    );
    machine.send(ascii("DIR"), "enter second CCP command");
    machine.waitFor("second command echoes", (fresh) => fresh.includes(ascii("DIR")));
    machine.send([13], "accept second CCP command");
    machine.waitPrompt("B", "second command handoff returns to the CCP drive");
    const resumedDriveRecord = machine.fileBytes(1, "HORTON.RSM");
    assert.equal(resumedDriveRecord[11], 0, "BDOS current drive is restored to A:");
    machine.send(ascii("DIR\r"), "enter the printed command at CCP");
    machine.waitFor("printed command runs through CCP", (fresh) =>
      fresh.includes(ascii("HORTON   RSM")) &&
      /\r\nB>\s*$/.test(fresh.toString("latin1")),
    );
    machine.send(ascii("A:\r"), "restore the saved CCP drive explicitly");
    machine.waitPrompt("A", "CCP selects the saved default drive");
    machine.send(ascii("A:HORTON /R\r"), "resume after restoring CCP drive");
    machine.waitResumePrompt();
    machine.confirmResume();
    machine.send(ascii("q"), "quit after the explicit drive restoration");
    machine.waitPrompt("A", "restored CCP drive survives the resume cycle");
    measurements.scenarios.push({
      name: "edit, save and single-use resume",
      actualEditSave: true,
      selectedNameRestored: true,
      bothPanelDrivesRestored: true,
      previousDefaultDrive: "A",
      crc16: record.readUInt16LE(126).toString(16).padStart(4, "0"),
      defaultDriveAfterResume: resumedDriveRecord[11],
      resumeTranscriptBytes: machine.transcript().length - resumeAt,
    });
  } finally {
    machine.free();
  }
}

// The CCP parser rejects extra arguments instead of treating them as /R.
{
  const machine = createMachine();
  try {
    machine.waitPrompt("A");
    const start = machine.transcript().length;
    machine.send(ascii("A:HORTON /R EXTRA\r"), "request resume with a trailing argument");
    machine.waitFor("malformed command tail shows usage", (fresh) =>
      fresh.includes(ascii("Usage: HORTON or HORTON /R")), start);
    machine.waitPrompt("A", "malformed command tail returns to CCP");
    assert.ok(!machine.fileNames(1).includes("HORTON.RSM"));
    measurements.scenarios.push({ name: "malformed resume command tail", rejected: true });
  } finally {
    machine.free();
  }
}

// A second ordinary launch ignores a valid one-shot session. Explicit /R is
// required, and the record remains available until the user confirms it.
{
  const machine = createMachine();
  try {
    machine.launch();
    machine.send(ascii("!"), "start CCP command handoff");
    machine.waitFor("bounded command prompt", (fresh) =>
      fresh.includes(ascii("CCP command, up to 64 chars")),
    );
    machine.send(ascii("DIR"), "enter CCP directory command");
    machine.waitFor("command line echoes", (fresh) => fresh.includes(ascii("DIR")));
    machine.send([13], "accept CCP command");
    machine.waitPrompt("A", "command handoff returns to CCP");
    const output = machine.transcript().toString("latin1");
    assert.ok(output.includes("\nA:\r\nA:HORTON /R"), output.slice(-1000));
    assert.ok(output.includes("A:HORTON /R"), output.slice(-1000));
    assert.ok(machine.fileNames(1).includes("HORTON.RSM"));

    machine.send(ascii("DIR\r"), "run the displayed DIR command at CCP");
    machine.waitFor("DIR lists the files", (fresh) =>
      fresh.includes(ascii("HORTON   COM")) &&
      /\r\nA>\s*$/.test(fresh.toString("latin1")),
    );

    machine.send(ascii("A:HORTON\r"), "ordinary launch with a saved session present");
    machine.waitPanel("normal launch starts a fresh panel without prompting");
    assert.ok(machine.fileNames(1).includes("HORTON.RSM"));
    machine.send(ascii("q"), "quit fresh Horton");
    machine.waitPrompt("A");
    machine.send(ascii("A:HORTON /R\r"), "resume only on explicit /R");
    machine.waitResumePrompt();
    machine.send([27], "cancel saved session confirmation");
    machine.waitPrompt("A", "cancel returns to CCP and keeps the record");
    assert.ok(machine.fileNames(1).includes("HORTON.RSM"));
    measurements.scenarios.push({
      name: "CCP command, fresh launch, and resume cancellation",
      typedCommandExecuted: true,
      normalLaunchIgnoresSession: true,
      cancelKeepsSession: true,
    });
  } finally {
    machine.free();
  }
}

// Restore independent panel drives from all four assumed Triptych slots, and
// find a selection on a later page by its name rather than an old row number.
{
  const bFiles = Array.from({ length: 20 }, (_, index) => [
    `F${String(index).padStart(7, "0")}.TXT`,
    ascii(`B file ${index}\r\n\x1a`),
  ]);
  const dFiles = Array.from({ length: 19 }, (_, index) => [
    `D${String(index).padStart(7, "0")}.TXT`,
    ascii(`D file ${index}\r\n\x1a`),
  ]);
  dFiles.push(["D_PICK.TXT", ascii("D selection\r\n\x1a")]);
  const machine = createMachine({
    bFiles,
    cFiles: [["C_PICK.TXT", ascii("C selection\r\n\x1a")]],
    dFiles,
  });
  try {
    machine.launch();
    for (let step = 0; step < 2; step += 1) {
      const start = machine.transcript().length;
      machine.send(ascii("]"), "advance left panel drive");
      machine.waitPanel(`left panel drive advances ${step + 1}`);
      assert.ok(machine.transcript().length > start);
    }
    machine.send([9], "activate right panel");
    machine.waitPanel("right panel is active");
    for (let step = 0; step < 2; step += 1) {
      machine.send(ascii("]"), "advance right panel drive");
      machine.waitPanel(`right panel drive advances ${step + 1}`);
    }
    assert.ok(machine.terminal.text().includes("C: *.*"));
    assert.ok(machine.terminal.text().includes("D: *.*"));
    machine.send(ascii(">"), "advance D: to its second page");
    machine.waitPanel("D: second page appears");
    machine.send([0x1b, 0x5b, 0x42], "select D: page-two item");
    machine.waitPanel("D: second-page selection moves down");
    assert.ok(machine.terminal.text().includes("D_PICK"));
    machine.send(ascii("!"), "start handoff with C: and D: panels");
    machine.waitFor("bounded command prompt", (fresh) =>
      fresh.includes(ascii("CCP command, up to 64 chars")),
    );
    const command = "ERA D:D0000000.TXT";
    machine.send(ascii(command), "enter ERA to change D: directory ordering");
    machine.waitFor("ERA command echoes", (fresh) => fresh.includes(ascii(command)));
    machine.send([13], "accept ERA handoff");
    machine.waitPrompt("A", "four-drive handoff returns to CCP");
    const record = machine.fileBytes(1, "HORTON.RSM");
    assert.equal(record[10], 1, "right panel remains active");
    assert.equal(record[13], 3, "left panel C: saved");
    assert.equal(record[14], 4, "right panel D: saved");
    assert.equal(record[15], 3, "both selections saved");
    assert.equal(record.subarray(27, 35).toString("ascii"), "D_PICK  ");
    assert.equal(record.subarray(35, 38).toString("ascii"), "TXT");

    machine.send(ascii(`${command}\r`), "remove an earlier D: entry before resume");
    machine.waitPrompt("A", "directory-changing command returns to CCP");
    assert.ok(!machine.fileNames(3).includes("D0000000.TXT"));
    machine.send(ascii("A:HORTON /R\r"), "resume saved C:/D: panels after directory change");
    machine.waitResumePrompt();
    const resumeAt = machine.transcript().length;
    machine.send(ascii("y"), "confirm C:/D: session");
    machine.waitPanel("C:/D: panel state restored");
    const resumed = machine.transcript().subarray(resumeAt).toString("latin1");
    assert.ok(machine.terminal.text().includes("C: *.*"));
    assert.ok(machine.terminal.text().includes("D: *.*"));
    assert.ok(resumed.includes("\u001b[7mD_PICK"), resumed);
    machine.send(ascii("q"), "quit four-drive restored session");
    machine.waitPrompt("A", "four-drive session returns to CCP");
    measurements.scenarios.push({
      name: "independent C:/D: panels after directory ordering changes",
      bothPanelDrivesRestored: true,
      bothSelectionsRestored: true,
      activePanelRestored: "right",
    });
  } finally {
    machine.free();
  }
}

// Reserved-name collisions are refused before any file is changed.
{
  const machine = createMachine({ bExtra: [["HORTON.TMP", Buffer.alloc(128)]] });
  try {
    machine.launch();
    machine.send([9], "activate B: panel");
    machine.waitPanel("B: panel active");
    const before = machine.fileBytes(1, "HORTON.TMP");
    const start = machine.transcript().length;
    machine.send(ascii("e"), "attempt handoff with a reserved-name collision");
    machine.waitFor("collision is reported", (fresh) =>
      fresh.includes(ascii("Handoff refused; remove B:HORTON.RSM or B:HORTON.TMP")),
      start,
    );
    assert.deepEqual(machine.fileBytes(1, "HORTON.TMP"), before);
    assert.ok(!machine.fileNames(1).includes("HORTON.RSM"));
    measurements.scenarios.push({ name: "reserved temporary collision", refused: true });
  } finally {
    machine.free();
  }
}

// A staged record from an interrupted save blocks resume and stays untouched.
{
  const record = makeSessionRecord();
  const incomplete = Buffer.alloc(128, 0x1a);
  Buffer.from("partial handoff write").copy(incomplete);
  const machine = createMachine({
    bExtra: [["HORTON.RSM", record], ["HORTON.TMP", incomplete]],
  });
  try {
    machine.waitPrompt("A");
    const start = machine.transcript().length;
    machine.send(ascii("A:HORTON /R\r"), "request resume with a staged file present");
    machine.waitFor("staged file blocks resume", (fresh) =>
      fresh.includes(ascii("Incomplete B:HORTON.TMP; remove it at CCP before handoff.")), start);
    machine.waitPrompt("A", "staged file rejection returns to CCP");
    assert.deepEqual(machine.fileBytes(1, "HORTON.RSM"), record);
    assert.deepEqual(machine.fileBytes(1, "HORTON.TMP"), incomplete);
    measurements.scenarios.push({ name: "interrupted staged session", rejectedAndPreserved: true });
  } finally {
    machine.free();
  }
}

// Function 35 must reject a valid first record in a short first extent followed
// by a later extent. Sequential EOF at that short extent must not consume it.
{
  const firstRecord = makeSessionRecord();
  const extraExtent = Buffer.concat([firstRecord, Buffer.alloc(128 * 128, 0x5a)]);
  const bDiskImage = makeDisk([["HORTON.RSM", extraExtent]]);
  const directoryStart = 16_384;
  assert.equal(bDiskImage[directoryStart + 15], 128, "fixture begins with a complete first extent");
  assert.equal(bDiskImage[directoryStart + 32 + 15], 1, "later extent contains one record");
  bDiskImage[directoryStart + 15] = 1;
  const machine = createMachine({ bFiles: [], bDiskImage });
  try {
    machine.waitPrompt("A");
    const start = machine.transcript().length;
    machine.send(ascii("A:HORTON /R\r"), "request resume of a multi-extent session file");
    machine.waitFor("multi-extent session is refused", (fresh) =>
      fresh.includes(ascii("Saved session is invalid; it has been left untouched.")), start);
    machine.waitPrompt("A", "invalid multi-extent session returns to CCP");
    assert.deepEqual(
      Buffer.from(machine.cpu.export_drive_checkpoint(1)),
      bDiskImage,
      "malformed session extent remains byte-identical",
    );
    measurements.scenarios.push({ name: "extra-extent session", rejectedAndPreserved: true });
  } finally {
    machine.free();
  }
}

// A missing saved filename falls back to the first entry on that panel.
{
  const missing = makeSessionRecord({ leftName: "GONE    TXT" });
  const machine = createMachine({ bExtra: [["HORTON.RSM", missing]] });
  try {
    machine.waitPrompt("A");
    machine.send(ascii("A:HORTON /R\r"), "resume a session with a missing selection");
    machine.waitResumePrompt();
    machine.send(ascii("y"), "confirm missing-name session");
    machine.waitFor("missing selection is reported", (fresh) =>
      fresh.includes(ascii("File is no longer present on this drive.")) &&
      fresh.includes(ascii("Q quit")));
    assert.ok(machine.transcript().toString("latin1").includes("\u001b[7mHORTON  .COM"));
    assert.equal(machine.fileNames(1).includes("HORTON.RSM"), false);
    machine.send(ascii("x"), "dismiss missing-selection notice");
    machine.waitPanel("panel remains usable after missing selection");
    machine.send(ascii("q"), "quit the resumed session");
    machine.waitPrompt("A");
    measurements.scenarios.push({ name: "missing saved selection", fallsBackAndReports: true });
  } finally {
    machine.free();
  }
}

// A structurally plausible record with a bad checksum is never applied or
// consumed. It is seeded through the public disk-image builder.
{
  const invalid = Buffer.alloc(128, 0);
  invalid.write("HORTONRS", 0, "ascii");
  invalid[8] = 1;
  invalid[9] = 128;
  invalid[10] = 0;
  invalid[11] = 0;
  invalid[12] = 0;
  invalid[13] = 1;
  invalid[14] = 2;
  invalid[38] = 1;
  invalid[126] = 0x12;
  invalid[127] = 0x34;
  const machine = createMachine({ bExtra: [["HORTON.RSM", invalid]] });
  try {
    machine.waitPrompt("A");
    const start = machine.transcript().length;
    machine.send(ascii("A:HORTON /R\r"), "request resume of an invalid session");
    machine.waitFor("invalid record is refused", (fresh) =>
      fresh.includes(ascii("Saved session is invalid; it has been left untouched.")),
      start,
    );
    assert.ok(machine.fileNames(1).includes("HORTON.RSM"));
    measurements.scenarios.push({ name: "bad-checksum session", rejectedAndPreserved: true });
  } finally {
    machine.free();
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      schema: "horton-increment-5-proof-v1",
      passed: true,
      triptych: {
        commit: systemBuild.descriptor.machine.revision,
        cleanCheckout: !systemBuild.descriptor.machine.dirty,
        profile: profileId,
        configuredDrives: ["A", "B", "C", "D"],
      },
      artifact: { bytes: hortonBytes.length, sha256: hash(hortonBytes) },
      scenarios: measurements.scenarios,
    },
    null,
    2,
  )}\n`,
);
