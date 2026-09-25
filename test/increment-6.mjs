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
const profileId = "triptych-cpu-v0.1-2m-n04";
const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, profileId);
assert.equal(systemBuild.descriptor.configuredCount, 4);
const tpaEndAddress = systemBuild.descriptor.layout.ccp;
const tpaLoadCapacityBytes = tpaEndAddress - 0x0100;
const ccpLabels = systemBuild.evidence.residents.ccp.labels;
const bdosLabels = systemBuild.evidence.residents.bdos.labels;
const hortonStartAddress = 0x0100;

const hortonBytes = await readFile(resolve(root, "dist/HORTON.COM"));
const sourceBytes = await readFile(resolve(root, "src/main.asm"));
const debugMap = JSON.parse(
  await readFile(resolve(root, "dist/HORTON.d8.json"), "utf8"),
);
const symbols = debugMap.files["main.asm"].symbols;
const symbol = (name) => {
  const match = symbols.find((entry) => entry.name === name);
  assert.ok(match, `ATOM map contains ${name}`);
  return match.address;
};
const vstartAddress = symbol("VSTART");
const viewerRecordsAddress = symbol("VSIZE");
const viewerEofAddress = symbol("VEOF");

function cpuState(cpu) {
  const state = cpu.cpu_state();
  try {
    return { pc: state.pc(), sp: state.sp() };
  } finally {
    state.free();
  }
}

function makeCanary(length, seed) {
  return Uint8Array.from(
    { length },
    (_, index) => (seed + index * 37) & 0xff,
  );
}

function inspectStackCanary(cpu, start, top, expected, label) {
  const actual = cpu.read_ram(start, expected.length);
  let lowestChangedIndex = -1;
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      lowestChangedIndex = index;
      break;
    }
  }
  assert.notEqual(lowestChangedIndex, -1, `${label} canary observed stack use`);
  assert.ok(
    lowestChangedIndex > 0,
    `${label} stack reached its reserved lower boundary`,
  );
  return {
    base: `0x${start.toString(16).padStart(4, "0")}`,
    top: `0x${top.toString(16).padStart(4, "0")}`,
    lowestChangedAddress: `0x${(start + lowestChangedIndex).toString(16).padStart(4, "0")}`,
    bytesTouchedDownFromTop: top - (start + lowestChangedIndex),
    untouchedBytesBelowLowestChange: lowestChangedIndex,
  };
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

function storedRecords(bytes) {
  const records = Buffer.alloc(Math.ceil(bytes.length / 128) * 128, 0x1a);
  bytes.copy(records);
  return records;
}

function bootImage(image) {
  const result = Buffer.from(image);
  result.set(systemBuild.system, 0);
  return result;
}

function diskStats(cpu, drive, name = "CAPACITY.BIN") {
  const disk = new CpmDisk(cpu.export_drive_checkpoint(drive));
  try {
    return {
      bytes: Buffer.from(disk.read_file(name)),
      fileRecords: disk.file_records(name),
      freeBytes: disk.free_bytes(),
    };
  } finally {
    disk.free();
  }
}

function createMachine({
  bFiles = [],
  cFiles = [],
  dFiles = [],
} = {}) {
  const aImage = bootImage(makeDisk([["HORTON.COM", hortonBytes]]));
  const images = [
    aImage,
    makeDisk(bFiles),
    makeDisk(cFiles),
    makeDisk(dFiles),
  ];
  const checkpoints = images.map((image) => Buffer.from(image));
  const cpu = new TriptychCpu(systemBuild.bootstrap);
  const terminal = new TerminalBuffer();
  let transcript = Buffer.alloc(0);
  let stackTracking = false;
  let trackedStepLimit = 5_000_000;
  let minHortonStackPointer = 0xffff;
  let minBdosStackPointer = 0xffff;
  let trackedSteps = 0;
  let trackedTstates = 0n;
  let stackCanaries;

  function isHortonPc(pc) {
    return pc >= hortonStartAddress && pc < hortonStartAddress + hortonBytes.length;
  }

  function transientStackPointer() {
    const { pc, sp } = cpuState(cpu);
    if (isHortonPc(pc)) return sp;
    assert.ok(
      sp >= bdosLabels.STKBASE && sp <= bdosLabels.STKTOP,
      "interactive input is waiting on the resident BDOS stack",
    );
    const savedSp = cpu.read_ram(bdosLabels.OLDSP, 2);
    return savedSp[0] | (savedSp[1] << 8);
  }

  function drain() {
    const bytes = Buffer.from(cpu.take_serial_output());
    if (bytes.length > 0) {
      transcript = Buffer.concat([transcript, bytes]);
      terminal.write(bytes);
    }
  }

  function observeStack() {
    const { pc, sp } = cpuState(cpu);
    if (isHortonPc(pc))
      minHortonStackPointer = Math.min(minHortonStackPointer, sp);
    if (sp >= bdosLabels.STKBASE && sp <= bdosLabels.STKTOP)
      minBdosStackPointer = Math.min(minBdosStackPointer, sp);
    return { pc, sp };
  }

  function waitFor(description, predicate, start = transcript.length) {
    const sampleSlice = 512;
    for (let slice = 0; slice < (stackTracking ? trackedStepLimit / sampleSlice : 20_000); slice += 1) {
      const reason = stackTracking
        ? cpu.run_slice(sampleSlice, 20_000)
        : cpu.run_slice(20_000, 300_000);
      if (stackTracking) {
        trackedSteps += Number(cpu.last_steps());
        trackedTstates += cpu.last_tstates();
        observeStack();
      }
      drain();
      if (predicate(transcript.subarray(start), terminal)) return terminal.text();
      assert.notEqual(reason, 4, `${description}: unexpected CP/M warm boot`);
      assert.notEqual(reason, 0, `${description}: CPU halted unexpectedly`);
    }
    throw new Error(
      `${description}: timed out${stackTracking ? " during stack sampling" : ""}; current screen: ${terminal
        .text()
        .slice(-800)}; output was ${transcript
        .subarray(start)
        .toString("latin1")}`,
    );
  }

  function pumpSlices(count, description) {
    for (let slice = 0; slice < count; slice += 1) {
      const reason = cpu.run_slice(20_000, 300_000);
      drain();
      assert.notEqual(reason, 4, `${description}: unexpected CP/M warm boot`);
      assert.notEqual(reason, 0, `${description}: CPU halted unexpectedly`);
    }
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
    drain();
    const start = transcript.length;
    const screen = waitFor(
      description,
      (fresh) =>
        fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
        fresh.includes(ascii("Q quit")),
      start,
    );
    for (let slice = 0; slice < 4; slice += 1) {
      const reason = cpu.run_slice(20_000, 300_000);
      if (stackTracking) {
        trackedSteps += Number(cpu.last_steps());
        trackedTstates += cpu.last_tstates();
        observeStack();
      }
      drain();
      assert.notEqual(reason, 4, `${description}: unexpected CP/M warm boot after redraw`);
      assert.notEqual(reason, 0, `${description}: CPU halted after redraw`);
    }
    return screen;
  }

  function launch() {
    waitPrompt("A");
    send(ascii("A:HORTON\r"), "launch HORTON from the CCP");
    return waitPanel("Horton panels appear");
  }

  for (let drive = 0; drive < 4; drive += 1)
    cpu.install_drive(drive, images[drive], drive !== 0);

  return {
    cpu,
    terminal,
    checkpoints,
    transcript: () => Buffer.from(transcript),
    waitFor,
    waitPrompt,
    waitPanel,
    send,
    launch,
    get minHortonStackPointer() {
      return minHortonStackPointer;
    },
    get minBdosStackPointer() {
      return minBdosStackPointer;
    },
    get trackedSteps() {
      return trackedSteps;
    },
    get trackedTstates() {
      return trackedTstates;
    },
    armStackCanaries() {
      const sp = transientStackPointer();
      assert.ok(
        sp > ccpLabels.STKBASE && sp <= ccpLabels.STKTOP,
        "Horton SP, saved by BDOS when needed, is inside the CCP transient stack",
      );
      assert.ok(
        cpu
          .read_ram(ccpLabels.STKGUARD, ccpLabels.STKGUEND - ccpLabels.STKGUARD)
          .every((byte) => byte === 0xa5),
        "resident CCP stack guard is intact before the workload",
      );
      const hortonExpected = makeCanary(sp - ccpLabels.STKBASE, 0x35);
      const bdosExpected = makeCanary(
        bdosLabels.STKTOP - bdosLabels.STKBASE,
        0x69,
      );
      cpu.write_ram(ccpLabels.STKBASE, hortonExpected);
      cpu.write_ram(bdosLabels.STKBASE, bdosExpected);
      stackCanaries = { hortonExpected, bdosExpected, entrySp: sp };
      return sp;
    },
    beginStackTracking() {
      minHortonStackPointer = transientStackPointer();
      minBdosStackPointer = bdosLabels.STKTOP;
      stackTracking = true;
      return minHortonStackPointer;
    },
    finishStackTracking() {
      assert.ok(stackCanaries, "stack canaries were armed");
      const finalTransientSp = transientStackPointer();
      assert.ok(
        finalTransientSp > ccpLabels.STKBASE && finalTransientSp <= ccpLabels.STKTOP,
        "saved Horton stack is still inside the CCP transient stack",
      );
      const ccpGuard = cpu.read_ram(
        ccpLabels.STKGUARD,
        ccpLabels.STKGUEND - ccpLabels.STKGUARD,
      );
      assert.ok(
        ccpGuard.every((byte) => byte === 0xa5),
        "application stack did not overwrite the resident CCP guard",
      );
      const horton = inspectStackCanary(
        cpu,
        ccpLabels.STKBASE,
        stackCanaries.entrySp,
        stackCanaries.hortonExpected,
        "Horton transient",
      );
      const bdos = inspectStackCanary(
        cpu,
        bdosLabels.STKBASE,
        bdosLabels.STKTOP,
        stackCanaries.bdosExpected,
        "BDOS resident",
      );
      return {
        horton: {
          ...horton,
          sampledLowWaterSp: `0x${minHortonStackPointer.toString(16).padStart(4, "0")}`,
          sampleMethod: "512-instruction slices plus persistent stack canary",
        },
        bdos: {
          ...bdos,
          sampledLowWaterSp: `0x${minBdosStackPointer.toString(16).padStart(4, "0")}`,
          sampleMethod: "separate resident-stack canary; SP samples classified by address range",
        },
        ccpGuard: {
          start: `0x${ccpLabels.STKGUARD.toString(16).padStart(4, "0")}`,
          bytes: ccpGuard.length,
          unchanged: true,
        },
      };
    },
    pumpSlices,
    setTrackedStepLimit(limit) {
      trackedStepLimit = limit;
    },
    checkpoint(drive) {
      return Buffer.from(cpu.export_drive_checkpoint(drive));
    },
    free() {
      cpu.free();
    },
  };
}

function capacityDisk() {
  const disk = CpmDisk.create_two_mib();
  try {
    const bytes = disk.free_bytes();
    assert.equal(bytes, 2_048_000, "known allocatable capacity in a blank 2 MiB disk");
    const contents = Buffer.alloc(bytes);
    for (let i = 0; i < contents.length; i += 1)
      contents[i] = 65 + (i % 26);
    contents.write("LAST DISK RECORD", contents.length - 128, "ascii");
    disk.add_import("CAPACITY.BIN", contents);
    const image = Buffer.from(disk.export_candidate());
    const reopened = new CpmDisk(image);
    try {
      assert.equal(reopened.file_records("CAPACITY.BIN"), 16_000);
      assert.equal(reopened.free_bytes(), 0);
      assert.deepEqual(Buffer.from(reopened.read_file("CAPACITY.BIN")), contents);
    } finally {
      reopened.free();
    }
    return { image, contents };
  } finally {
    disk.free();
  }
}

const capacity = capacityDisk();
const capacityProof = { scenarios: [] };

// Fill B:'s profile data area with one logical file. Host-seed the viewer near
// the EOF boundary to qualify the final records without claiming ordinary key
// paging was exercised across all 16,000 records.
{
  const machine = createMachine({
    bFiles: [["CAPACITY.BIN", capacity.contents]],
  });
  try {
    machine.launch();
    machine.send(ascii("?"), "send an unsupported key");
    machine.pumpSlices(4, "unsupported key is ignored");
    assert.ok(machine.terminal.text().includes("A: *.*"));
    assert.ok(machine.terminal.text().includes("B: *.*"));
    assert.deepEqual(machine.checkpoint(1), machine.checkpoints[1]);

    machine.send(ascii("s"), "open left panel drive selector");
    machine.waitFor("left drive selector prompt", (fresh) =>
      fresh.includes(ascii("Select drive A-D")),
    );
    machine.send(ascii("B"), "set left panel to B:");
    machine.waitPanel("left panel switches to B:");
    const source = diskStats(machine.cpu, 1);
    assert.deepEqual(source.bytes, capacity.contents, "full source file remains byte-identical");
    assert.equal(source.fileRecords, 16_000);
    assert.equal(source.freeBytes, 0);

    const viewerAt = machine.transcript().length;
    machine.send([13], "view the full-capacity file");
    machine.waitFor(
      "viewer opens the maximum-size profile file",
      (fresh) => fresh.includes(ascii("Esc/Q: return")),
      viewerAt,
    );
    const initialViewerRecords = machine.cpu.read_ram(viewerRecordsAddress, 2);
    assert.equal(
      initialViewerRecords[0] | (initialViewerRecords[1] << 8),
      16_000,
      "viewer records the full-profile file length",
    );
    assert.equal(machine.cpu.read_ram(viewerEofAddress, 1)[0], 0, "viewer starts before EOF");
    machine.cpu.write_ram(vstartAddress, Uint8Array.of(0x70, 0x3e)); // record 15,984
    assert.deepEqual(machine.cpu.read_ram(vstartAddress, 2), Uint8Array.of(0x70, 0x3e));
    const lastPageAt = machine.transcript().length;
    machine.send(ascii(">"), "open the last page of the 16,000-record file");
    machine.waitFor(
      "viewer reads the final records",
      (fresh) =>
        fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
        fresh.includes(ascii("Esc/Q: return")),
      lastPageAt,
    );
    assert.ok(machine.terminal.text().includes("LAST DISK RECORD"), machine.terminal.text());
    const viewerRecords = machine.cpu.read_ram(viewerRecordsAddress, 2);
    assert.equal(viewerRecords[0] | (viewerRecords[1] << 8), 16_000);
    machine.send([27], "return from the maximum-size viewer");
    machine.waitPanel("maximum-size viewer returns to panels");
    machine.send(ascii("q"), "return to CCP after capacity proof");
    machine.waitPrompt("A");

    capacityProof.scenarios.push({
      name: "maximum CP/M file view",
      sourceBytes: source.bytes.length,
      sourceRecords: source.fileRecords,
      sourceDiskFreeBytes: source.freeBytes,
      maximumProfileFileOpened: true,
      viewerCursorSetup: "host-seeded VSTART to record 15,984 before the public next-page key",
      maximumFilePagedFromStart: false,
      finalPageAccessedWithSeededCursor: true,
      finalRecordViewed: true,
      unsupportedKeyIgnored: true,
    });
    assert.deepEqual(machine.checkpoint(0), machine.checkpoints[0]);
    assert.deepEqual(machine.checkpoint(2), machine.checkpoints[2]);
    assert.deepEqual(machine.checkpoint(3), machine.checkpoints[3]);
  } finally {
    machine.free();
  }
}

// Measure the transient and BDOS resident stacks separately while copying
// and verifying a 129-record, two-extent file.
{
  const copyBytes = Buffer.alloc(129 * 128);
  for (let i = 0; i < copyBytes.length; i += 1)
    copyBytes[i] = (i * 29 + 13) & 0xff;
  const machine = createMachine({ bFiles: [["COPYTEST.BIN", copyBytes]] });
  try {
    machine.launch();
    machine.send(ascii("s"), "open left panel drive selector");
    machine.waitFor("left drive selector prompt", (fresh) =>
      fresh.includes(ascii("Select drive A-D")),
    );
    machine.send(ascii("B"), "set left source panel to B:");
    machine.waitPanel("B: source file is visible");
    machine.send([9], "activate the right panel");
    machine.waitPanel("right panel is active");
    machine.send(ascii("s"), "open right panel drive selector");
    machine.waitFor("right drive selector prompt", (fresh) =>
      fresh.includes(ascii("Select drive A-D")),
    );
    machine.send(ascii("C"), "set right destination panel to C:");
    machine.waitPanel("C: is the copy destination");
    machine.send([9], "activate the left source panel");
    machine.waitPanel("B: is active for copy");
    machine.send(ascii("c"), "request the multi-extent copy");
    machine.waitFor("copy confirmation", (fresh) =>
      fresh.includes(ascii("Copy selected name to the other panel's drive? Y/N")) &&
      fresh.includes(ascii("Q quit")),
    );
    machine.pumpSlices(4, "copy confirmation settles before input");
    const entryStackPointer = machine.armStackCanaries();
    machine.beginStackTracking();
    machine.setTrackedStepLimit(400_000_000);
    const copyAt = machine.transcript().length;
    machine.send(ascii("y"), "confirm multi-extent copy");
    machine.waitFor(
      "multi-extent copy verifies and completes",
      (fresh) => fresh.includes(ascii("Copy verified and complete; both panels refreshed.")),
      copyAt,
    );
    const stack = machine.finishStackTracking();
    assert.ok(
      machine.minHortonStackPointer < entryStackPointer,
      "application SP sampling observes nested copy calls",
    );
    const source = diskStats(machine.cpu, 1, "COPYTEST.BIN");
    const destination = diskStats(machine.cpu, 2, "COPYTEST.BIN");
    assert.deepEqual(source.bytes, copyBytes);
    assert.deepEqual(destination.bytes, copyBytes);
    assert.equal(source.fileRecords, 129);
    assert.equal(destination.fileRecords, 129);
    capacityProof.stack = {
      ccpTransientStack: {
        reservedBytes: ccpLabels.STKTOP - ccpLabels.STKBASE,
        entrySp: `0x${entryStackPointer.toString(16).padStart(4, "0")}`,
        sampledLowWaterSp: stack.horton.sampledLowWaterSp,
        canary: stack.horton,
        residentGuard: stack.ccpGuard,
      },
      bdosResidentStack: {
        reservedBytes: bdosLabels.STKTOP - bdosLabels.STKBASE,
        sampledLowWaterSp: stack.bdos.sampledLowWaterSp,
        canary: stack.bdos,
      },
      instructionsSampled: machine.trackedSteps,
      samplingIntervalInstructions: 512,
      tstatesSampled: machine.trackedTstates.toString(),
      workload: "129-record copy, read-back verification, and panel refresh",
    };
    capacityProof.scenarios.push({
      name: "129-record verified copy and stack high-water sample",
      copiedBytes: destination.bytes.length,
      copiedRecords: destination.fileRecords,
      sourcePreserved: true,
      destinationByteIdentical: true,
    });
  } finally {
    machine.free();
  }
}

// The assumed A: system disk is write-protected. A cross-panel copy must
// follow CP/M's fatal read-only path and leave both files intact.
{
  const sourceBytes = ascii("READ ONLY DESTINATION CHECK\r\n\x1a");
  const machine = createMachine({ bFiles: [["SOURCE.TXT", sourceBytes]] });
  try {
    machine.launch();
    machine.send([9], "select B: source panel");
    machine.waitPanel("B: is active for protected-destination test");
    machine.send(ascii("c"), "request copy to protected A:");
    machine.waitFor("protected-destination confirmation", (fresh) =>
      fresh.includes(ascii("Copy selected name to the other panel's drive? Y/N")),
    );
    const fatalAt = machine.transcript().length;
    machine.send(ascii("y"), "confirm write to protected A:");
    machine.waitFor(
      "CP/M reports read-only destination as fatal",
      (fresh) => fresh.includes(ascii("Bdos Err On A:")),
      fatalAt,
    );
    const promptAt = machine.transcript().length;
    machine.send(ascii("x"), "acknowledge CP/M fatal disk error");
    machine.waitFor(
      "fatal read-only path warm-boots to CCP",
      (fresh) => /\r\nA>\s*$/.test(fresh.toString("latin1")),
      promptAt,
    );
    const source = new CpmDisk(machine.checkpoint(1));
    const protectedSystem = new CpmDisk(machine.checkpoint(0));
    try {
      assert.deepEqual(Buffer.from(source.read_file("SOURCE.TXT")), storedRecords(sourceBytes));
      assert.deepEqual(machine.checkpoint(0), machine.checkpoints[0]);
      assert.equal(protectedSystem.file_names().includes("HCOPY.$$$"), false);
    } finally {
      source.free();
      protectedSystem.free();
    }
    capacityProof.scenarios.push({
      name: "write-protected target fatal path",
      returnedToCcp: true,
      sourcePreserved: true,
      protectedSystemUnchanged: true,
    });
  } finally {
    machine.free();
  }
}

const profile = systemBuild.descriptor;
const fixedBuffers = {
  directoryFcbs: 2 * 36,
  copyAndViewFcbs: 4 * 36,
  recordDmas: 2 * 128,
  panelNameCaches: 2 * 18 * 11,
  filenameInput: 12,
  ccpCommandInput: 64,
  copyTemporaryName: 11,
};
const fixedBufferBytes = Object.values(fixedBuffers).reduce((sum, size) => sum + size, 0);
assert.equal(fixedBufferBytes, 955);
assert.ok(
  hortonBytes.length <= tpaLoadCapacityBytes,
  "COM image fits the named profile's TPA load capacity",
);

process.stdout.write(
  `${JSON.stringify(
    {
      schema: "horton-increment-6-proof-v1",
      passed: true,
      triptych: {
        commit: profile.machine.revision,
        cleanCheckout: !profile.machine.dirty,
        profile: profileId,
        configuredDrives: ["A", "B", "C", "D"],
      },
      artifact: {
        bytes: hortonBytes.length,
        sha256: sha256(hortonBytes),
        sourceSha256: sha256(sourceBytes),
        atomRevision: "802b5c2d320bec777f427755ff2d7338e3b80a05",
      },
      capacity: {
        tpaEndAddress: `0x${tpaEndAddress.toString(16).padStart(4, "0")}`,
        tpaLoadCapacityBytes,
        tpaBytesRemainingAfterLoad: tpaLoadCapacityBytes - hortonBytes.length,
        fixedApplicationBuffers: fixedBuffers,
        fixedApplicationBufferBytes: fixedBufferBytes,
        maximumProfileFileBytes: capacity.contents.length,
        maximumProfileFileRecords: 16_000,
        maximumProfileFileOpened: true,
        maximumFilePagedFromStart: false,
        finalPageAccessedWithSeededCursor: true,
        largestCopyTestedBytes: 129 * 128,
        largestCopyTestedRecords: 129,
        maximumProfileFileCopyQualified: false,
      },
      stack: capacityProof.stack,
      scenarios: capacityProof.scenarios,
      driveAssumption: "A:, B:, C:, and D: are attached; absent-drive behavior is outside this target gate",
      fatalBiosIoInjection: "not exposed by this Triptych guest-scenario API; external CP/M fatal-path proof does not inject faults into Horton",
      earlierNormalFailureGates: [
        "1,024 directory slots and page-56 access",
        "full-disk, directory-full, and partial-copy cleanup",
        "invalid rename input and Backspace recovery",
        "malformed, interrupted, and multi-extent handoff records",
      ],
      ordinaryFatalFailureCoverage: [
        "write-protected A: returns to CCP through the public BDOS path",
        "Horton-specific runtime BIOS bad-sector injection remains unavailable in the Triptych scenario API",
      ],
      externalFailureEvidence: "Triptych tools/prove-ccp-failures.mjs exercises generic CP/M fatal bad-sector paths; it does not inject faults into Horton",
    },
    null,
    2,
  )}\n`,
);
