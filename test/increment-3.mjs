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
const messageAndFooter = (fresh, message) => {
  const start = fresh.indexOf(ascii(message));
  return start >= 0 && fresh.indexOf(ascii("Q quit"), start + message.length) >= 0;
};
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

function makeFullDisk() {
  const disk = CpmDisk.create_two_mib();
  try {
    const freeBytes = disk.free_bytes();
    disk.add_import("FULL.BIN", Buffer.alloc(freeBytes, 0x5a));
    const image = Buffer.from(disk.export_candidate());
    const check = new CpmDisk(Uint8Array.from(image));
    try {
      assert.equal(check.free_bytes(), 0, "fixture consumes every data block");
    } finally {
      check.free();
    }
    return image;
  } finally {
    disk.free();
  }
}

function makeOneBlockFreeDisk() {
  const disk = CpmDisk.create_two_mib();
  try {
    const freeBytes = disk.free_bytes();
    assert.equal(freeBytes % 2048, 0, "Triptych allocation blocks are 2 KiB");
    disk.add_import("FULL.BIN", Buffer.alloc(freeBytes - 2048, 0x5a));
    const image = Buffer.from(disk.export_candidate());
    const check = new CpmDisk(Uint8Array.from(image));
    try {
      assert.equal(check.free_bytes(), 2048, "fixture leaves one allocation block");
      assert.equal(check.free_directory_entries() > 0, true);
    } finally {
      check.free();
    }
    return image;
  } finally {
    disk.free();
  }
}

function makeFullDirectoryDisk() {
  const image = makeDisk();
  const directoryOffset = 16_384;
  const entryBytes = 32;
  const directoryEntries = 1_024;
  for (let index = 0; index < directoryEntries; index += 1) {
    const offset = directoryOffset + index * entryBytes;
    image.fill(0, offset, offset + entryBytes);
    image[offset] = 0;
    image.write(`F${String(index).padStart(7, "0")}`, offset + 1, 8, "ascii");
    image.write("DAT", offset + 9, 3, "ascii");
  }
  const check = new CpmDisk(Uint8Array.from(image));
  try {
    assert.equal(check.free_directory_entries(), 0);
    assert.equal(check.file_names().length, directoryEntries);
  } finally {
    check.free();
  }
  return image;
}

function bootImage(dataImage) {
  const image = Buffer.from(dataImage);
  image.set(systemBuild.system, 0);
  return image;
}

function createMachine(drives) {
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

  function settle() {
    for (let slice = 0; slice < 4; slice += 1) {
      cpu.run_slice(20_000, 300_000);
      drain();
    }
  }

  function waitPrompt(drive) {
    waitFor(`${drive}> CCP prompt`, (fresh) =>
      new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
    );
  }

  function waitPanel(description) {
    const screen = waitFor(description, (fresh) => fresh.includes(ascii("Q quit")));
    settle();
    return screen;
  }

  function launch() {
    waitPrompt("A");
    send(ascii("A:HORTON\r"), "launch HORTON from A:");
    return waitPanel("Horton panel screen");
  }

  function arrowDown(expectedSelection) {
    send([0x1b, 0x5b, 0x42], "move the active selection down");
    const screen = waitFor(`selection moves to ${expectedSelection}`, (fresh) =>
      fresh.includes(ascii(`\u001b[7m${expectedSelection}`)) &&
      fresh.includes(ascii("Q quit")),
    );
    settle();
    return screen;
  }

  function switchPanel(expectedSelection) {
    send([9], "switch the active panel");
    const screen = waitFor(`panel switches to ${expectedSelection}`, (fresh) =>
      fresh.includes(ascii(`\u001b[7m${expectedSelection}`)) &&
      fresh.includes(ascii("Q quit")),
    );
    settle();
    return screen;
  }

  function copySelected(resultText) {
    const promptAt = transcript.length;
    send(ascii("c"), "request a copy");
    waitFor("copy confirmation prompt", (fresh) =>
      fresh.includes(ascii("Copy selected name to the other panel's drive? Y/N")) &&
      fresh.includes(ascii("Q quit")),
      promptAt,
    );
    const resultAt = transcript.length;
    send(ascii("y"), "confirm the copy");
    waitFor(`copy result: ${resultText}`, (fresh) =>
      fresh.includes(ascii(resultText)) && fresh.includes(ascii("Q quit")), resultAt,
    );
    send(ascii("x"), "dismiss the copy result");
    return waitPanel("panels return after copy");
  }

  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, Uint8Array.from(drives[drive]), true);

  return {
    cpu,
    terminal,
    waitFor,
    waitPrompt,
    waitPanel,
    send,
    settle,
    launch,
    arrowDown,
    switchPanel,
    copySelected,
    free() {
      cpu.free();
    },
  };
}

function readFileFrom(cpu, drive, name) {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return Buffer.from(disk.read_file(name));
  } finally {
    disk.free();
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

const textBytes = ascii("TEXT COPY\r\n\x1a");
const secondTextBytes = ascii("TEXT COPY WITHOUT A COLLISION\r\n\x1a");
const binaryBytes = Buffer.alloc(3 * 128);
for (let index = 0; index < binaryBytes.length; index += 1)
  binaryBytes[index] = (index * 37 + 0x1a) & 0xff;
const multiBytes = Buffer.alloc(129 * 128);
for (let index = 0; index < multiBytes.length; index += 1)
  multiBytes[index] = (index * 19 + 7) & 0xff;
const partialTextBytes = Buffer.alloc(173, 0x20);
partialTextBytes.write("PARTIAL TEXT\r\n", 0, "ascii");
partialTextBytes[31] = 0x1a;

const sourceA = makeDisk([
  ["HORTON.COM", hortonBytes],
  ["COPYTXT.TXT", textBytes],
  ["TEXTOK.TXT", secondTextBytes],
  ["COPYBIN.BIN", binaryBytes],
  ["MULTI.DAT", multiBytes],
  ["PARTIAL.TXT", partialTextBytes],
]);
const sourceCheck = new CpmDisk(Uint8Array.from(sourceA));
let expectedFiles;
try {
  expectedFiles = Object.fromEntries(
    ["COPYTXT.TXT", "TEXTOK.TXT", "COPYBIN.BIN", "MULTI.DAT", "PARTIAL.TXT"].map((name) => [
      name,
      Buffer.from(sourceCheck.read_file(name)),
    ]),
  );
} finally {
  sourceCheck.free();
}
const bOriginal = makeDisk([
  ["COPYTXT.TXT", ascii("KEEP THE OLD FILE\r\n\x1a")],
  ["KEEP.BIN", Buffer.from([0, 0x1a, 0xff, 0x5a])],
]);
const dInterrupted = makeDisk([
  ["HCOPY.$$$", Buffer.from("unfinished temporary data")],
  ["DKEEP.TXT", ascii("KEEP D DRIVE\r\n\x1a")],
]);
const drives = [bootImage(sourceA), bOriginal, makeDisk(), dInterrupted];
const untouchedC = Buffer.from(drives[2]);
const originalB = new CpmDisk(Uint8Array.from(bOriginal));
const oldCollision = Buffer.from(originalB.read_file("COPYTXT.TXT"));
originalB.free();

const machine = createMachine(drives);
try {
  machine.waitPrompt("A");
  machine.send(ascii("A:HORTON\r"), "launch HORTON from A:");
  const recoveryAt = 0;
  machine.waitFor("startup offers interrupted copy cleanup", (fresh) =>
    messageAndFooter(fresh, "Interrupted copy found on drive D: HCOPY.$$$"), recoveryAt,
  );
  machine.send(ascii("d"), "accept cleanup of reserved interrupted copy");
  machine.waitFor("startup removes the interrupted temporary", (fresh) =>
    messageAndFooter(fresh, "Interrupted copy on drive D: removed"), recoveryAt,
  );
  machine.send(ascii("x"), "dismiss temporary cleanup result");
  let screen = machine.waitPanel("Horton panels after recovery");
  assert.ok(screen.includes("COPYTXT"), screen);
  assert.deepEqual(fileNamesFrom(machine.cpu, 3), ["DKEEP.TXT"]);

  screen = machine.arrowDown("COPYTXT .TXT");
  assert.ok(screen.includes("COPYTXT"), screen);
  machine.copySelected("Destination already exists; Horton will not overwrite it.");
  assert.deepEqual(readFileFrom(machine.cpu, 1, "COPYTXT.TXT"), oldCollision);

  screen = machine.arrowDown("TEXTOK  .TXT");
  assert.ok(screen.includes("TEXTOK"), screen);
  machine.copySelected("Copy verified and complete; both panels refreshed.");

  screen = machine.arrowDown("COPYBIN .BIN");
  assert.ok(screen.includes("COPYBIN"), screen);
  machine.copySelected("Copy verified and complete; both panels refreshed.");

  screen = machine.arrowDown("MULTI   .DAT");
  assert.ok(screen.includes("MULTI"), screen);
  machine.copySelected("Copy verified and complete; both panels refreshed.");

  screen = machine.arrowDown("PARTIAL .TXT");
  assert.ok(screen.includes("PARTIAL"), screen);
  machine.copySelected("Copy verified and complete; both panels refreshed.");

  screen = machine.switchPanel("COPYTXT .TXT");
  assert.ok(screen.includes("KEEP"), screen);
  screen = machine.arrowDown("KEEP    .BIN");
  assert.ok(screen.includes("KEEP"), screen);
  machine.copySelected("Copy verified and complete; both panels refreshed.");

  for (const name of ["TEXTOK.TXT", "COPYBIN.BIN", "MULTI.DAT", "PARTIAL.TXT"])
    assert.deepEqual(readFileFrom(machine.cpu, 1, name), expectedFiles[name], `${name} records match`);
  const keepRecord = Buffer.alloc(128, 0x1a);
  Buffer.from([0, 0x1a, 0xff, 0x5a]).copy(keepRecord);
  assert.deepEqual(readFileFrom(machine.cpu, 1, "KEEP.BIN"), keepRecord);
  assert.deepEqual(readFileFrom(machine.cpu, 0, "KEEP.BIN"), keepRecord);
  assert.deepEqual(readFileFrom(machine.cpu, 0, "COPYTXT.TXT"), expectedFiles["COPYTXT.TXT"]);
  for (const name of ["COPYTXT.TXT", "TEXTOK.TXT", "COPYBIN.BIN", "MULTI.DAT", "PARTIAL.TXT"])
    assert.deepEqual(readFileFrom(machine.cpu, 0, name), expectedFiles[name], `${name} source remains intact`);
  const hortonRecords = Buffer.alloc(Math.ceil(hortonBytes.length / 128) * 128, 0x1a);
  hortonBytes.copy(hortonRecords);
  assert.deepEqual(readFileFrom(machine.cpu, 0, "HORTON.COM"), hortonRecords);
  assert.ok(!fileNamesFrom(machine.cpu, 1).includes("HCOPY.$$$"));
  assert.deepEqual(Buffer.from(machine.cpu.export_drive_checkpoint(2)), untouchedC);
} finally {
  machine.free();
}

// A retained temporary must block another copy without being overwritten.
const tempCollisionA = bootImage(
  makeDisk([
    ["HORTON.COM", hortonBytes],
    ["SOURCE.BIN", Buffer.alloc(128, 0x6d)],
  ]),
);
const tempCollisionB = makeDisk([
  ["HCOPY.$$$", Buffer.from("keep this recovery file")],
]);
const tempCollisionBStart = Buffer.from(tempCollisionB);
const tempCollisionMachine = createMachine([
  tempCollisionA,
  tempCollisionB,
  makeDisk(),
  makeDisk(),
]);
try {
  tempCollisionMachine.launch();
  tempCollisionMachine.waitFor(
    "startup identifies the retained B: temporary",
    (fresh) => messageAndFooter(fresh, "Interrupted copy found on drive B: HCOPY.$$$"),
    0,
  );
  tempCollisionMachine.settle();
  tempCollisionMachine.send(ascii("x"), "keep the reserved temporary for recovery");
  tempCollisionMachine.waitPanel("panels return with the reserved temporary retained");
  tempCollisionMachine.arrowDown("SOURCE  .BIN");
  tempCollisionMachine.copySelected(
    "Reserved copy temporary exists; restart Horton to review it.",
  );
  assert.deepEqual(
    Buffer.from(tempCollisionMachine.cpu.export_drive_checkpoint(1)),
    tempCollisionBStart,
  );
  assert.deepEqual(
    readFileFrom(tempCollisionMachine.cpu, 0, "SOURCE.BIN"),
    Buffer.alloc(128, 0x6d),
  );
  assert.deepEqual(fileNamesFrom(tempCollisionMachine.cpu, 1), ["HCOPY.$$$"]);
} finally {
  tempCollisionMachine.free();
}

// Exhaust data blocks but leave directory slots: the temporary file can be
// made, then sequential write returns the ordinary disk-full status.
const fullA = bootImage(
  makeDisk([
    ["HORTON.COM", hortonBytes],
    ["SOURCE.BIN", Buffer.alloc(128, 0xa5)],
  ]),
);
const fullB = makeFullDisk();
const fullDisk = new CpmDisk(Uint8Array.from(fullB));
let fullFileExpected;
try {
  fullFileExpected = Buffer.from(fullDisk.read_file("FULL.BIN"));
} finally {
  fullDisk.free();
}
const fullMachine = createMachine([fullA, fullB, makeDisk(), makeDisk()]);
try {
  fullMachine.launch();
  fullMachine.arrowDown("SOURCE  .BIN");
  fullMachine.copySelected("Disk full during copy; source kept and temp cleanup attempted.");
  assert.deepEqual(fileNamesFrom(fullMachine.cpu, 1), ["FULL.BIN"]);
  const fullAfter = readFileFrom(fullMachine.cpu, 1, "FULL.BIN");
  assert.deepEqual(fullAfter, fullFileExpected, "existing full-disk file is intact");
  assert.deepEqual(readFileFrom(fullMachine.cpu, 0, "SOURCE.BIN"), Buffer.alloc(128, 0xa5));
  assert.ok(!fileNamesFrom(fullMachine.cpu, 1).includes("HCOPY.$$$"));
} finally {
  fullMachine.free();
}

// Leave one 2 KiB allocation block. The first sixteen records allocate and
// fill it; the seventeenth write then fails after the temporary has data.
const partialSource = Buffer.alloc(17 * 128, 0xa5);
const partialFullA = bootImage(
  makeDisk([
    ["HORTON.COM", hortonBytes],
    ["SOURCE.BIN", partialSource],
  ]),
);
const partialFullB = makeOneBlockFreeDisk();
const partialFullBefore = new CpmDisk(Uint8Array.from(partialFullB));
let partialFullContents;
try {
  partialFullContents = Buffer.from(partialFullBefore.read_file("FULL.BIN"));
} finally {
  partialFullBefore.free();
}
const partialFullMachine = createMachine([
  partialFullA,
  partialFullB,
  makeDisk(),
  makeDisk(),
]);
try {
  partialFullMachine.launch();
  partialFullMachine.arrowDown("SOURCE  .BIN");
  partialFullMachine.copySelected(
    "Disk full during copy; source kept and temp cleanup attempted.",
  );
  const target = new CpmDisk(
    Uint8Array.from(partialFullMachine.cpu.export_drive_checkpoint(1)),
  );
  try {
    assert.deepEqual(target.file_names(), ["FULL.BIN"]);
    assert.equal(target.free_bytes(), 2048, "allocated temporary block was reclaimed");
  } finally {
    target.free();
  }
  assert.deepEqual(
    readFileFrom(partialFullMachine.cpu, 1, "FULL.BIN"),
    partialFullContents,
    "existing target file survives the later disk-full failure",
  );
  assert.deepEqual(
    readFileFrom(partialFullMachine.cpu, 0, "SOURCE.BIN"),
    partialSource,
    "source survives failure after sixteen destination records were written",
  );
} finally {
  partialFullMachine.free();
}

// Exhaust the directory while leaving data space. BDOS refuses the temporary
// Make File call; Horton must preserve the source and the whole target image.
const dirFullA = bootImage(
  makeDisk([
    ["HORTON.COM", hortonBytes],
    ["SOURCE.BIN", Buffer.alloc(128, 0x3c)],
  ]),
);
const dirFullB = makeFullDirectoryDisk();
const dirFullStart = Buffer.from(dirFullB);
const dirFullMachine = createMachine([dirFullA, dirFullB, makeDisk(), makeDisk()]);
try {
  dirFullMachine.launch();
  dirFullMachine.arrowDown("SOURCE  .BIN");
  dirFullMachine.copySelected("Could not create the copy temporary; directory may be full.");
  assert.deepEqual(Buffer.from(dirFullMachine.cpu.export_drive_checkpoint(1)), dirFullStart);
  assert.deepEqual(readFileFrom(dirFullMachine.cpu, 0, "SOURCE.BIN"), Buffer.alloc(128, 0x3c));
  assert.ok(!fileNamesFrom(dirFullMachine.cpu, 1).includes("HCOPY.$$$"));
} finally {
  dirFullMachine.free();
}

process.stdout.write(
  `${JSON.stringify(
    {
      schema: "horton-increment-3-proof-v1",
      passed: true,
      triptych: {
        commit: systemBuild.descriptor.machine.revision,
        cleanCheckout: !systemBuild.descriptor.machine.dirty,
        profile: profileId,
        systemSha256: systemBuild.descriptor.system.sha256,
        bootstrapSha256: systemBuild.descriptor.bootstrap.sha256,
      },
      copy: {
        completeRecordEquality: ["TEXTOK.TXT", "COPYBIN.BIN", "MULTI.DAT", "PARTIAL.TXT"],
        multiExtentRecords: 129,
        refusesExistingDestination: true,
        refusesTemporaryCollision: true,
        copiesFromBothActivePanels: true,
        recoversReservedTemporaryAtStartup: true,
        handlesDiskFull: true,
        handlesDiskFullAfterPartialWrite: true,
        handlesDirectoryFull: true,
        preservesSourceAndUnrelatedFiles: true,
      },
      artifact: { bytes: hortonBytes.length, sha256: hash(hortonBytes) },
    },
    null,
    2,
  )}\n`,
);
