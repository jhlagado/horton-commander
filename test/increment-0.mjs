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
const profileId = "triptych-cpu-v0.1-2m-n04";
const editManifest = JSON.parse(
  await readFile(
    resolve(triptychRoot, "third_party/edit/manifest.json"),
    "utf8",
  ),
);
const editBytes = await readFile(
  resolve(triptychRoot, "third_party/edit/EDIT.COM"),
);
const hortonBytes = await readFile(resolve(root, "dist/HORTON.COM"));

assert.equal(editManifest.artifact, "EDIT.COM");
assert.equal(editManifest.version, "0.2.0");
assert.equal(editBytes.length, editManifest.bytes);
assert.equal(hash(editBytes), editManifest.sha256);

const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, profileId);
assert.equal(systemBuild.descriptor.configuredCount, 4);

function makeDisk(files = []) {
  const disk = CpmDisk.create_two_mib();
  try {
    for (const [name, bytes] of files) disk.add_import(name, Uint8Array.from(bytes));
    return Buffer.from(disk.export_candidate());
  } finally {
    disk.free();
  }
}

const aBytes = makeDisk([
  ["HORTON.COM", hortonBytes],
  ["EDIT.COM", editBytes],
  ["ANOTE.NU", ascii("A DRIVE SENTINEL: READ ONLY\r\n\x1a")],
]);
aBytes.set(systemBuild.system, 0);
const bBytes = makeDisk([
  ["INPUT.NU", ascii("B DRIVE SENTINEL: EDIT THIS FILE\r\n\x1a")],
]);
const cBytes = makeDisk([["C_NOTE.TXT", ascii("C DRIVE MEDIA\r\n\x1a")]]);
const dBytes = makeDisk([["D_NOTE.TXT", ascii("D DRIVE MEDIA\r\n\x1a")]]);
const initialDrives = [aBytes, bBytes, cBytes, dBytes].map((bytes) =>
  Buffer.from(bytes),
);

const cpu = new TriptychCpu(systemBuild.bootstrap);
const terminal = new TerminalBuffer();
let transcript = Buffer.alloc(0);
const segments = [];

function drain() {
  const bytes = Buffer.from(cpu.take_serial_output());
  if (bytes.length > 0) {
    transcript = Buffer.concat([transcript, bytes]);
    terminal.write(bytes);
  }
  return bytes;
}

function waitFor(description, predicate, start = transcript.length) {
  for (let slice = 0; slice < 3000; slice += 1) {
    const reason = cpu.run_slice(20_000, 300_000);
    drain();
    const fresh = transcript.subarray(start);
    if (predicate(fresh, terminal)) {
      segments.push({
        description,
        bytes: fresh.length,
        sha256: hash(fresh),
      });
      return fresh;
    }
    assert.notEqual(reason, 4, `${description}: CPU halted unexpectedly`);
  }
  throw new Error(
    `${description}: timed out; output was ${transcript
      .subarray(start)
      .toString("latin1")}`,
  );
}

function waitText(text, description = `output ${JSON.stringify(text)}`) {
  return waitFor(description, (fresh) => fresh.includes(ascii(text)));
}

function waitPrompt(drive, description = `${drive}> CCP prompt`) {
  return waitFor(description, (fresh) =>
    new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
  );
}

function send(bytes, description) {
  assert.equal(cpu.enqueue_serial_input(Buffer.from(bytes)), true, description);
}

function enterCommand(command, drive, requiredOutput = undefined) {
  const start = transcript.length;
  send(ascii(`${command}\r`), `queue CCP command ${command}`);
  if (requiredOutput) waitText(requiredOutput, `${command} response`);
  waitPrompt(drive, `${command} leaves CCP at ${drive}>`);
  if (transcript.length === start)
    throw new Error(`CCP command produced no output: ${command}`);
}

function launchHorton() {
  const start = transcript.length;
  send(ascii("A:HORTON\r"), "queue HORTON launch");
  waitFor("HORTON completes the panel screen", (fresh) =>
    fresh.includes(ascii("HORTON COMMANDER")) && fresh.includes(ascii("Q quit")),
    start,
  );
  const screen = terminal.text();
  assert.ok(screen.includes("ANOTE"), `A panel lists a real file:\n${screen}`);
  assert.ok(screen.includes("INPUT"), `B panel lists a real file:\n${screen}`);
  assert.equal(terminal.snapshot().columns, 80);
  assert.equal(terminal.snapshot().rows, 24);
  return { start, screen };
}

function leaveHorton(drive) {
  send(ascii("q"), "queue ordinary-key exit");
  waitPrompt(drive, `HORTON returns to ${drive}>`);
}

function openInEdit(filename, sentinel, drive) {
  const start = transcript.length;
  send(ascii(`A:EDIT ${filename}\r`), `queue Edit for ${drive}:${filename}`);
  waitFor(`${drive}:${filename} appears in Edit`, (_fresh, screen) => {
    const text = screen.text();
    return text.includes("^Q Quit") && text.includes(sentinel);
  }, start);
  const text = terminal.text();
  assert.match(text, /EDIT/);
  assert.ok(text.includes(sentinel), `${drive}:${filename} content shown by Edit`);
  const quitStart = transcript.length;
  send([0x11], "queue Edit Ctrl-Q");
  waitPrompt(drive, `Edit returns through CCP to ${drive}>`);
  return transcript.subarray(start, quitStart).toString("latin1");
}

try {
  cpu.install_drive(0, aBytes, false);
  cpu.install_drive(1, bBytes, true);
  cpu.install_drive(2, cBytes, true);
  cpu.install_drive(3, dBytes, true);

  waitPrompt("A", "boot reaches A> on four-drive N04 profile");
  assert.equal(cpu.boot_rom_enabled(), false);
  for (let drive = 0; drive < 4; drive += 1) {
    assert.deepEqual(
      Buffer.from(cpu.export_drive(drive)),
      initialDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: has inserted media`,
    );
  }

  launchHorton();
  const redrawStart = transcript.length;
  send([0x1b, 0x5b, 0x42], "queue raw down arrow");
  waitFor("down arrow redraws the listing", (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
    fresh.includes(ascii("Q quit")),
    redrawStart,
  );
  segments.push({ description: "down key redraw", bytes: transcript.length - redrawStart });
  send([0x1b, 0x5b, 0x41], "queue raw up arrow");
  waitFor("up arrow redraws the listing", (fresh) =>
    fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
      fresh.includes(ascii("Q quit")),
  );
  leaveHorton("A");

  openInEdit("ANOTE.NU", "A DRIVE SENTINEL", "A");
  enterCommand("B:", "B");
  openInEdit("INPUT.NU", "B DRIVE SENTINEL", "B");

  const relaunched = launchHorton();
  assert.ok(relaunched.screen.includes("INPUT"));
  leaveHorton("B");

  for (let drive = 0; drive < 4; drive += 1) {
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      initialDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: remains byte-identical`,
    );
  }

  const result = {
    schema: "horton-increment-0-proof-v1",
    passed: true,
    triptych: {
      commit: systemBuild.descriptor.machine.revision,
      cleanCheckout: !systemBuild.descriptor.machine.dirty,
      profile: profileId,
      systemSha256: systemBuild.descriptor.system.sha256,
      bootstrapSha256: systemBuild.descriptor.bootstrap.sha256,
    },
    configuredAndInsertedDrives: ["A", "B", "C", "D"],
    horton: {
      bytes: hortonBytes.length,
      sha256: hash(hortonBytes),
      entryAddress: 0x0100,
      screen: { columns: 80, rows: 24 },
    },
    edit: {
      version: editManifest.version,
      bytes: editBytes.length,
      sha256: editManifest.sha256,
      openedOnA: true,
      openedOnBUsingACommandDrivePrefix: true,
      returnedToCcpAndRelaunchedHorton: true,
    },
    drivesUnchanged: true,
    segments,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  cpu.free();
}
