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
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ascii = (value) => Buffer.from(value, "ascii");
const debugMap = JSON.parse(
  await readFile(resolve(root, "dist/HORTON.d8.json"), "utf8"),
);
const cacheLeft = debugMap.files["main.asm"].symbols.find(
  (symbol) => symbol.name === "CACHEL",
)?.address;
assert.equal(typeof cacheLeft, "number", "ATOM debug map exposes CACHEL");
const escapeWait = debugMap.files["main.asm"].symbols.find(
  (symbol) => symbol.name === "VESCWAIT",
)?.address;
assert.equal(typeof escapeWait, "number", "ATOM debug map exposes VESCWAIT");
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

function makeLongText() {
  const recordCount = 139;
  const bytes = Buffer.alloc(recordCount * 128, 0x20);
  const markers = [
    [0, "REC00 FIRST PAGE"],
    [8, "REC08 FIRST PAGE LAST RECORD"],
    [9, "REC09 SECOND PAGE"],
    [10, "REC10 SECOND PAGE LAST RECORD"],
    [117, "REC117 PRE-EXTENT PAGE"],
    [126, "REC126 BEFORE EXTENT"],
    [127, "REC127 LAST RECORD IN EXTENT"],
    [128, "REC128 FIRST RECORD OF NEXT EXTENT"],
    [138, "REC138 FINAL RECORD"],
  ];
  for (let record = 0; record < recordCount; record += 1)
    bytes.fill(0x61 + (record % 26), record * 128, (record + 1) * 128);
  for (const [record, marker] of markers)
    bytes.write(marker, record * 128, "ascii");
  bytes[40] = 9;
  bytes[41] = 0xe9;
  bytes[recordCount * 128 - 1] = 0x1a;
  return bytes;
}

const aImage = makeDisk([
  ["A_NOTE.TXT", ascii("A DRIVE TEXT\r\n\x1a")],
  ["HORTON.COM", hortonBytes],
]);
const bImage = makeDisk([["B_NOTE.TXT", ascii("B DRIVE TEXT\r\n\x1a")]]);
const cImage = makeDisk([["C_LONG.TXT", makeLongText()]]);
const dImage = makeDisk([
  ["D_NOTE.TXT", ascii("D DRIVE TEXT\r\n\x1a")],
  ["D_DATA.BIN", Buffer.from([...Buffer.alloc(127, 0x42), 0x1a])],
]);

const aBytes = Buffer.from(aImage);
aBytes.set(systemBuild.system, 0);
const initialDrives = [aBytes, bImage, cImage, dImage].map((bytes) =>
  Buffer.from(bytes),
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

function sendArrowInParts(direction, description) {
  send([0x1b], `${description}: escape prefix`);
  const reason = cpu.run_slice(1_000, 20_000);
  drain();
  assert.notEqual(reason, 4, `${description}: CPU halted while awaiting CSI bytes`);
  const remaining = cpu.read_ram(escapeWait, 1)[0];
  assert.ok(
    remaining > 0 && remaining < 255,
    `${description}: CSI wait is active (counter ${remaining})`,
  );
  send([0x5b, direction], `${description}: CSI suffix`);
}

function waitPanel(description) {
  const start = transcript.length;
  waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
    fresh.includes(ascii("Q quit")), start);
  return terminal.text();
}

function selectDrive(letter, description) {
  const promptStart = transcript.length;
  send(ascii("s"), `${description}: open drive selector`);
  waitFor(
    `${description}: drive selector prompt`,
    (fresh) => fresh.includes(ascii("Select drive A-D")),
    promptStart,
  );
  send(ascii(letter), `${description}: choose ${letter}:`);
  return waitPanel(`${description}: selected ${letter}:`);
}

function waitViewer(description) {
  const start = transcript.length;
  waitFor(description, (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
    fresh.includes(ascii("Esc/Q: return")), start);
  return terminal.text();
}

function enterViewer(label) {
  send([13], `open selected ${label}`);
  return waitViewer(`${label} viewer screen`);
}

function returnToPanels(label) {
  send([27], `leave ${label} viewer`);
  return waitPanel(`${label} viewer returns to panels`);
}

try {
  cpu.install_drive(0, aBytes, true);
  cpu.install_drive(1, bImage, true);
  cpu.install_drive(2, cImage, true);
  cpu.install_drive(3, dImage, true);
  waitPrompt("A");
  send(ascii("A:HORTON\r"), "launch HORTON");
  waitFor("initial panels", (fresh) => fresh.includes(ascii("Q quit")));
  assert.ok(terminal.text().includes("A: *.*"));
  assert.ok(terminal.text().includes("B: *.*"));

  // Change only the selected cache name to simulate a stale row while the
  // program is open. The real guest BDOS returns its ordinary open-miss
  // status; disk media stays untouched.
  const originalCachedName = Buffer.from(cpu.read_ram(cacheLeft, 11));
  assert.equal(originalCachedName.toString("ascii"), "A_NOTE  TXT");
  cpu.write_ram(cacheLeft, ascii("GONE    TXT"));
  const missingStart = transcript.length;
  send([13], "open a stale cached directory entry");
  waitFor(
    "ordinary BDOS missing-file message",
    (fresh) => fresh.includes(ascii("File is no longer present on this drive.")),
    missingStart,
  );
  assert.ok(terminal.text().includes("GONE"), "stale selected name is visible");
  cpu.write_ram(cacheLeft, originalCachedName);
  send(ascii("x"), "dismiss ordinary missing-file message");
  let screen = waitPanel("missing-file error returns to both panels");
  assert.ok(screen.includes("A: *.*"));
  assert.ok(screen.includes("B: *.*"));
  assert.ok(screen.includes("A_NOTE"), "selection remains usable after failure");
  screen = enterViewer("A_NOTE after ordinary open failure");
  assert.ok(screen.includes("A DRIVE TEXT"), "viewer works after error recovery");
  screen = returnToPanels("A_NOTE after ordinary open failure");
  assert.ok(screen.includes("A_NOTE"));

  screen = enterViewer("A_NOTE");
  assert.ok(screen.includes("Drive A: A_NOTE"), screen);
  assert.ok(screen.includes(".TXT"), screen);
  assert.ok(screen.includes("A DRIVE TEXT"), screen);
  screen = returnToPanels("A_NOTE");
  assert.ok(screen.includes("A: *.*"));
  assert.ok(screen.includes("B: *.*"));
  assert.ok(screen.includes("A_NOTE"), "panel and selected file return intact");

  screen = selectDrive("B", "active panel changes to B:");
  assert.ok(screen.includes("B: *.*"));
  screen = enterViewer("B_NOTE");
  assert.ok(screen.includes("Drive B: B_NOTE"), screen);
  assert.ok(screen.includes("B DRIVE TEXT"), screen);
  screen = returnToPanels("B_NOTE");
  assert.ok(screen.includes("B: *.*"));

  screen = selectDrive("C", "active panel changes to C:");
  assert.ok(screen.includes("C: *.*"));
  assert.ok(screen.includes("C_LONG"));
  screen = enterViewer("C_LONG");
  assert.ok(screen.includes("Drive C: C_LONG"), screen);
  assert.ok(screen.includes(".TXT"), screen);
  assert.ok(screen.includes("REC00 FIRST PAGE"), screen);
  assert.ok(screen.includes("REC08 FIRST PAGE"), screen);
  assert.ok(!screen.includes("REC09 SECOND PAGE"), "first view page stops at record eight");
  assert.ok(!screen.includes("\t"), "tabs are rendered safely as spaces");
  assert.ok(!screen.includes("é"), "high bytes are not emitted directly");

  for (let page = 2; page <= 15; page += 1) {
    send(ascii(">"), `advance viewer to page ${page}`);
    screen = waitViewer(`viewer displays page ${page}`);
    if (page === 2) {
      assert.ok(screen.includes("REC09 SECOND PAGE"), screen);
      assert.ok(screen.includes("REC10 SECOND PAGE"), screen);
      assert.ok(!screen.includes("REC00 FIRST PAGE"), "second page begins at record nine");
    }
  }
  assert.ok(screen.includes("REC126 BEFORE EXTENT"), screen);
  assert.ok(screen.includes("REC127 LAST RECORD IN EXTENT"), screen);
  assert.ok(screen.includes("REC128 FIRST RECORD OF NEXT EXTENT"), screen);
  assert.ok(!screen.includes("REC138 FINAL RECORD"), "page stops after record 134");

  sendArrowInParts(0x42, "advance viewer with Triptych down arrow");
  screen = waitViewer("viewer consumes down arrow and advances one page");
  assert.ok(screen.includes("REC138 FINAL RECORD"), screen);
  assert.ok(!screen.includes("REC128 FIRST RECORD OF NEXT EXTENT"), screen);

  send([0x1b, 0x5b, 0x41], "return viewer with Triptych up-arrow bytes");
  screen = waitViewer("viewer consumes up arrow and returns one page");
  assert.ok(screen.includes("REC128 FIRST RECORD OF NEXT EXTENT"), screen);
  assert.ok(!screen.includes("REC138 FINAL RECORD"), screen);

  send(ascii("<"), "return viewer to previous page");
  screen = waitViewer("viewer returns to the previous page");
  assert.ok(screen.includes("REC117"), screen);
  assert.ok(!screen.includes("REC126 BEFORE EXTENT"), "back navigation restores prior page");
  screen = returnToPanels("C_LONG");
  assert.ok(screen.includes("C: *.*"));
  assert.ok(screen.includes("B: *.*"));
  assert.ok(screen.includes("C_LONG"), "selected C: entry survives view and return");

  screen = selectDrive("D", "active panel changes to D:");
  assert.ok(screen.includes("D: *.*"));
  screen = enterViewer("D_NOTE");
  assert.ok(screen.includes("Drive D: D_NOTE"), screen);
  assert.ok(screen.includes(".TXT"), screen);
  assert.ok(screen.includes("D DRIVE TEXT"), screen);
  screen = returnToPanels("D_NOTE");
  assert.ok(screen.includes("D: *.*"));
  send([0x1b, 0x5b, 0x42], "select D_DATA below D_NOTE");
  waitPanel("D_DATA becomes selected");
  screen = enterViewer("D_DATA");
  assert.ok(screen.includes("Drive D: D_DATA"), screen);
  assert.ok(screen.includes("B".repeat(20)), "binary control bytes are rendered as text");
  assert.ok(!screen.includes("\x1a"), "CP/M text EOF is not shown");
  returnToPanels("D_DATA");
  send(ascii("q"), "quit HORTON after viewing all four drives");
  waitPrompt("A");

  for (let drive = 0; drive < 4; drive += 1) {
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      initialDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: unchanged by browsing`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "horton-increment-2-proof-v1",
        passed: true,
        triptych: {
          commit: systemBuild.descriptor.machine.revision,
          cleanCheckout: !systemBuild.descriptor.machine.dirty,
          profile: profileId,
          systemSha256: systemBuild.descriptor.system.sha256,
          bootstrapSha256: systemBuild.descriptor.bootstrap.sha256,
        },
        drives: ["A", "B", "C", "D"],
        driveSelection: "active panel explicitly selects A through D with S",
        viewer: {
          readOnly: true,
          recordsPerPage: 9,
          bytesPerRecord: 128,
          handlesTextEofAndControlBytes: true,
          forwardAndBackwardPaging: true,
          arrowPageNavigation: true,
          multiExtentRandomRead: true,
          missingFileRecovery: true,
        },
        fatalRead: "not injected in this host profile; public BDOS fatal errors transfer to CCP",
        horton: { bytes: hortonBytes.length, sha256: hash(hortonBytes) },
        drivesUnchanged: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  cpu.free();
}
