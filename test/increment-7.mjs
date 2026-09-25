import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const triptychRoot = resolve(
  process.env.TRIPTYCH_ROOT ?? resolve(root, "../triptych"),
);
const [{ buildTwoMibSystem }, { encodeSavedMachine }, { CpmDisk }] =
  await Promise.all([
    import(pathToFileURL(resolve(triptychRoot, "tools/lib/two-mib-system.mjs"))),
    import(
      pathToFileURL(
        resolve(triptychRoot, "crates/triptych-host-wasm/web/saved-machine.js"),
      ),
    ),
    Promise.resolve(
      createRequire(import.meta.url)(
        resolve(triptychRoot, "dist/wasm/triptych_host_wasm.js"),
      ),
    ),
  ]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ascii = (value) => Buffer.from(value, "ascii");
const expectedSource = ascii("Native Triptych edit and copy test.\r\n");
const expectedPaddedSource = Buffer.alloc(128, 0x1a);
expectedSource.copy(expectedPaddedSource);
const expectedEditedSource = Buffer.alloc(128, 0x1a);
ascii(`x${expectedSource.toString("ascii")}`).copy(expectedEditedSource);

function makeDisk(files) {
  const disk = CpmDisk.create_two_mib();
  try {
    for (const [name, bytes] of files)
      disk.add_import(name, Uint8Array.from(bytes));
    return Buffer.from(disk.export_candidate());
  } finally {
    disk.free();
  }
}

function readDisk(path) {
  return readFile(path).then((image) => new CpmDisk(image));
}

const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.configuredCount, 4);
assert.equal(systemBuild.descriptor.residentProfile, "triptych-cpu-v0.1-2m-n04");

const hortonBytes = await readFile(resolve(root, "dist/HORTON.COM"));
const editBytes = await readFile(resolve(triptychRoot, "third_party/edit/EDIT.COM"));
const editManifest = JSON.parse(
  await readFile(resolve(triptychRoot, "third_party/edit/manifest.json"), "utf8"),
);
assert.equal(editManifest.artifact, "EDIT.COM");
assert.equal(editBytes.length, editManifest.bytes);
assert.equal(hash(editBytes), editManifest.sha256);

const aImage = makeDisk([
  ["HORTON.COM", hortonBytes],
  ["EDIT.COM", editBytes],
]);
aImage.set(systemBuild.system, 0);
const initialImages = [
  aImage,
  makeDisk([["HELLO.TXT", expectedSource]]),
  makeDisk([]),
  makeDisk([]),
];
const slots = initialImages.map((bytes, index) => ({
  instanceId: randomUUID(),
  name: `horton-release-${String.fromCharCode(65 + index)}.img`,
  bytes,
}));

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "horton-increment-7-"));
const archivePath = resolve(temporaryRoot, "horton.tds");
const deploymentPath = resolve(temporaryRoot, "deployment.json");
const sessionPath = resolve(temporaryRoot, "session");
const logPath = resolve(temporaryRoot, "native-terminal.log");
const archive = await encodeSavedMachine(
  {
    schema: "triptych-drive-set-v4",
    configuredCount: 4,
    bootstrap: {
      profile: systemBuild.descriptor.residentProfile,
      bytes: systemBuild.bootstrap,
    },
    slots,
  },
  webcrypto,
);
const archiveSha256 = hash(archive);
await writeFile(archivePath, archive, { flag: "wx" });
await writeFile(
  deploymentPath,
  `${JSON.stringify(
    {
      schema: "triptych-browser-deployment-v1",
      twoMibProfiles: [systemBuild.descriptor],
      assets: ["system", "bootstrap"].map((role) => ({
        path: systemBuild.descriptor[role].asset,
        bytes: systemBuild.descriptor[role].bytes,
        sha256: systemBuild.descriptor[role].sha256,
      })),
    },
    null,
    2,
  )}\n`,
  { flag: "wx" },
);

let passed = false;
let persistedFiles;
try {
  execFileSync("cargo", ["build", "--locked", "-p", "triptych-host-native"], {
    cwd: triptychRoot,
    stdio: "inherit",
  });
  const host = resolve(triptychRoot, "target/debug/triptych-host-native");
  const ptyProof = spawnSync(
    "python3",
    [
      resolve(root, "test/increment-7-native.py"),
      "--archive",
      archivePath,
      "--deployment",
      deploymentPath,
      "--session",
      sessionPath,
      "--host",
      host,
      "--log",
      logPath,
    ],
    {
      cwd: triptychRoot,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 2_000_000,
      env: { ...process.env, TRIPTYCH_ROOT: triptychRoot },
    },
  );
  if (ptyProof.stdout) process.stdout.write(ptyProof.stdout);
  if (ptyProof.stderr) process.stderr.write(ptyProof.stderr);
  if (ptyProof.error) throw ptyProof.error;
  assert.equal(ptyProof.status, 0, "native Triptych interactive session passes");

  const opened = await Promise.all(
    ["A", "B", "C", "D"].map((letter) =>
      readDisk(resolve(sessionPath, `drive-${letter}.img`)),
    ),
  );
  try {
    const [a, b, c, d] = opened;
    assert.equal(a.file_names().includes("HORTON.COM"), true);
    assert.equal(a.file_names().includes("EDIT.COM"), true);
    assert.equal(b.file_names().includes("HELLO.TXT"), true);
    assert.equal(b.file_names().includes("HORTON.RSM"), false);
    assert.equal(b.file_names().includes("HORTON.TMP"), false);
    assert.equal(c.file_names().includes("HELLO.TXT"), true);
    assert.deepEqual(
      Buffer.from(c.read_file("HELLO.TXT")),
      expectedPaddedSource,
      "C: retains the verified pre-edit copy",
    );
    const edited = Buffer.from(b.read_file("HELLO.TXT"));
    assert.deepEqual(
      edited,
      expectedEditedSource,
      "B: contains the exact 128-byte file saved by EDIT.COM",
    );
    assert.deepEqual(d.file_names(), [], "the attached D: drive remains empty");
    assert.ok(
      opened.every((disk) => disk.export_candidate().length === 2_097_152),
      "all four native working drives retain the expected 2 MiB geometry",
    );
    persistedFiles = {
      copiedBytes: expectedPaddedSource.length,
      copiedSha256: hash(Buffer.from(c.read_file("HELLO.TXT"))),
      editedBytes: edited.length,
      editedSha256: hash(edited),
    };
  } finally {
    for (const disk of opened) disk.free();
  }
  assert.equal(hash(await readFile(archivePath)), archiveSha256);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "horton-increment-7-native-proof-v1",
        passed: true,
        triptychCommit: systemBuild.descriptor.machine.revision,
        triptychProfile: systemBuild.descriptor.residentProfile,
        attachedDrives: ["A", "B", "C", "D"],
        hortonBytes: hortonBytes.length,
        hortonSha256: hash(hortonBytes),
        editVersion: editManifest.version,
        editSha256: editManifest.sha256,
        files: persistedFiles,
        nativeWorkflow: "view, verified copy, Edit save, CCP return, /R resume, reopen",
        savedSessionConsumed: true,
        sourceArchiveUnchanged: true,
      },
      null,
      2,
    )}\n`,
  );
  passed = true;
} finally {
  if (passed) await rm(temporaryRoot, { recursive: true, force: true });
  else process.stderr.write(`Native proof artifacts retained at ${temporaryRoot}\n`);
}
