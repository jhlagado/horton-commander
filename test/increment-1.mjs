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
const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, profileId);
assert.equal(systemBuild.descriptor.configuredCount, 4);

const hortonBytes = await readFile(resolve(root, "dist/HC.COM"));
const directoryOffset = 16_384;
const directoryEntries = 1_024;
const entryBytes = 32;

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

function makeFullDirectoryDisk() {
  const disk = CpmDisk.create_two_mib();
  try {
    disk.add_import("HC.COM", Uint8Array.from(hortonBytes));
    const multiExtent = Buffer.alloc(17 * 1024 + 1);
    for (let index = 0; index < multiExtent.length; index += 1)
      multiExtent[index] = index & 0xff;
    disk.add_import("MULTI.BIN", Uint8Array.from(multiExtent));
    const image = Buffer.from(disk.export_candidate());

    // The image builder deliberately rejects zero-byte imports. CP/M permits
    // empty files with RC=0 and no allocated blocks, so fill the remaining
    // directory slots with valid empty first extents to test the 1024-slot
    // search boundary without exhausting the disk's data blocks first.
    const occupied = [];
    for (let index = 0; index < directoryEntries; index += 1) {
      const offset = directoryOffset + index * entryBytes;
      if (image[offset] !== 0xe5) occupied.push(index);
    }
    const recordsPerExtent = 128;
    const bytesPerRecord = 128;
    const hortonExtentCount = Math.ceil(
      hortonBytes.length / (recordsPerExtent * bytesPerRecord),
    );
    const multiExtentCount = Math.ceil(
      multiExtent.length / (recordsPerExtent * bytesPerRecord),
    );
    const initialExtentNumbers = [
      ...Array.from({ length: hortonExtentCount }, (_, index) => index),
      ...Array.from({ length: multiExtentCount }, (_, index) => index),
    ];
    assert.deepEqual(
      occupied,
      Array.from({ length: initialExtentNumbers.length }, (_, index) => index),
      "initial file extents occupy consecutive directory entries",
    );
    for (let index = 0; index < initialExtentNumbers.length; index += 1) {
      const offset = directoryOffset + index * entryBytes;
      assert.equal(image[offset + 12], initialExtentNumbers[index]);
    }
    const emptyFileCount = directoryEntries - initialExtentNumbers.length;
    for (let index = 0; index < emptyFileCount; index += 1) {
      const base = `F${String(index).padStart(7, "0")}`;
      const entryIndex = index + initialExtentNumbers.length;
      const offset = directoryOffset + entryIndex * entryBytes;
      image.fill(0, offset, offset + entryBytes);
      image[offset] = 0;
      image.write(base, offset + 1, 8, "ascii");
      image.write("DAT", offset + 9, 3, "ascii");
      image[offset + 12] = 0;
      image[offset + 15] = 0;
    }
    const filled = [];
    for (let index = 0; index < directoryEntries; index += 1) {
      const offset = directoryOffset + index * entryBytes;
      if (image[offset] !== 0xe5) filled.push(index);
    }
    assert.equal(filled.length, directoryEntries, "all directory slots are occupied");
    const validated = new CpmDisk(Uint8Array.from(image));
    try {
      assert.equal(validated.free_directory_entries(), 0);
      assert.equal(validated.file_names().length, 2 + emptyFileCount);
    } finally {
      validated.free();
    }
    return { image, multiExtent, emptyFileCount };
  } finally {
    disk.free();
  }
}

const { image: aImage, multiExtent, emptyFileCount } = makeFullDirectoryDisk();
const bImage = makeDisk();
const cImage = makeDisk([["C_NOTE.TXT", ascii("C DRIVE MEDIA\r\n\x1a")]]);
const dImage = makeDisk([["D_NOTE.TXT", ascii("D DRIVE MEDIA\r\n\x1a")]]);
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
  throw new Error(`${description}: timed out`);
}

function waitPrompt(drive) {
  waitFor(`${drive}> CCP prompt`, (fresh) =>
    new RegExp(`\\r\\n${drive}>\\s*$`).test(fresh.toString("latin1")),
  );
}

function send(bytes, description) {
  assert.equal(cpu.enqueue_serial_input(Buffer.from(bytes)), true, description);
}

function waitScreenUpdate(description, start = transcript.length) {
  let tstates = 0;
  for (let slice = 0; slice < 20_000; slice += 1) {
    const reason = cpu.run_slice(20_000, 300_000);
    tstates += Number(cpu.last_tstates());
    drain();
    const fresh = transcript.subarray(start);
    if (
      fresh.includes(Buffer.from("\u001b[2J", "latin1")) &&
      fresh.includes(ascii("Q quit"))
    )
      return tstates;
    assert.notEqual(reason, 4, `${description}: CPU halted unexpectedly`);
  }
  throw new Error(`${description}: timed out`);
}

function rowTexts() {
  return terminal.text().split("\n");
}

function panelRows() {
  return rowTexts().filter(
    (row) => row.startsWith("|") && row.includes("||") && !row.includes("A: *.*"),
  );
}

function nameStyle(name) {
  const rows = rowTexts();
  const row = rows.findIndex((text) => text.includes(name));
  assert.notEqual(row, -1, `${name} is visible`);
  const cells = terminal.snapshot();
  const column = rows[row].indexOf(name);
  return cells.attributes[row * 80 + column];
}

try {
  cpu.install_drive(0, aBytes, false);
  cpu.install_drive(1, bImage, true);
  cpu.install_drive(2, cImage, true);
  cpu.install_drive(3, dImage, true);
  waitPrompt("A");
  send(ascii("A:HC\r"), "launch HORTON from A:");
  waitFor("initial complete two-panel listing", (fresh) =>
    fresh.includes(ascii("Q quit")),
  );

  let screen = terminal.text();
  assert.ok(screen.includes("HC"), "the renamed HC.COM entry is visible");
  assert.equal((screen.match(/MULTI/g) ?? []).length, 1, "multi-extent file appears once");
  assert.equal((screen.match(/F0000000/g) ?? []).length, 1);
  const firstRows = panelRows();
  assert.equal(firstRows.length, 18, "screen shows eighteen rows");
  assert.ok(firstRows.every((row) => row.slice(41, 79).trim() === ""), "empty B: is shown normally");
  assert.notEqual(nameStyle("HC") & 4, 0, "selected A: entry is highlighted");

  send([0x1b, 0x5b, 0x42], "move selection down");
  waitScreenUpdate("down-arrow selection redraw");
  assert.equal(nameStyle("HC") & 4, 0, "previous row loses selection highlight");
  assert.notEqual(nameStyle("MULTI") & 4, 0, "next row receives selection highlight");
  send([0x1b, 0x5b, 0x41], "move selection up");
  waitScreenUpdate("up-arrow selection redraw");
  assert.notEqual(nameStyle("HC") & 4, 0, "up restores the first selection");

  send([0x09], "switch to empty B: panel");
  waitScreenUpdate("Tab switches active panel");
  assert.equal(nameStyle("HC") & 4, 0, "inactive panel loses highlight");
  send([0x09], "switch back to A: panel");
  waitScreenUpdate("Tab switches back to A:");
  assert.notEqual(nameStyle("HC") & 4, 0, "A: keeps its selection");

  let slowestPage = 0;
  const pageMeasurements = [];
  for (let page = 1; page <= 56; page += 1) {
    const start = transcript.length;
    send(ascii(">"), `request page ${page}`);
    const tstates = waitScreenUpdate(`page ${page} scan`, start);
    pageMeasurements.push(tstates);
    slowestPage = Math.max(slowestPage, tstates);
  }

  screen = terminal.text();
  const lastEmptyFile = `F${String(emptyFileCount - 1).padStart(7, "0")}`;
  assert.ok(screen.includes(lastEmptyFile), "last first-extent entry is reachable on page 56");
  const lastRows = panelRows();
  const visibleAEntries = lastRows.filter((row) => row.slice(1, 39).trim() !== "");
  const firstNameOnLastPage = `F${String(56 * 18 - 2).padStart(7, "0")}`;
  assert.equal(
    visibleAEntries.length,
    2 + emptyFileCount - 56 * 18,
    "last page contains the remaining files",
  );
  assert.notEqual(nameStyle(firstNameOnLastPage) & 4, 0, "selection resets to the first row on a new page");
  // Page 56 begins after HC and MULTI, at empty-file index 1006.
  assert.ok(screen.includes(firstNameOnLastPage));

  send(ascii("q"), "quit HORTON");
  waitPrompt("A");
  for (let drive = 0; drive < 4; drive += 1) {
    assert.deepEqual(
      Buffer.from(cpu.export_drive_checkpoint(drive)),
      initialDrives[drive],
      `drive ${String.fromCharCode(65 + drive)}: remains unchanged`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "horton-increment-1-proof-v1",
        passed: true,
        triptych: {
          commit: systemBuild.descriptor.machine.revision,
          cleanCheckout: !systemBuild.descriptor.machine.dirty,
          profile: profileId,
          systemSha256: systemBuild.descriptor.system.sha256,
          bootstrapSha256: systemBuild.descriptor.bootstrap.sha256,
        },
        drives: ["A", "B", "C", "D"],
        directory: {
          slots: directoryEntries,
          occupiedSlots: directoryEntries,
          firstExtentFiles: 2 + emptyFileCount,
          multiExtentRecords: 2,
          emptyPanel: "B",
        },
        horton: {
          bytes: hortonBytes.length,
          sha256: hash(hortonBytes),
          screen: { columns: 80, rows: 24 },
          cachedNamesPerPanel: 18,
        },
        paging: {
          pagesVisited: 57,
          pageNavigationTstates: pageMeasurements,
          slowestPageNavigationTstates: slowestPage,
          finalPageFiles: visibleAEntries.length,
        },
        drivesUnchanged: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  cpu.free();
}
