import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const triptychRoot = resolve(
  process.env.TRIPTYCH_ROOT ?? resolve(root, "../triptych"),
);
const baseRevision =
  "20f331a4b984a4a580dd191cec5f8aca78071067e8495741e54edc4b70933f92";
const baseAsset = `library-system-2m-n04-${baseRevision}.img`;
const previewDirectory = resolve(root, "site/releases/preview");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const [{ buildTwoMibSystem }, { CpmDisk }] = await Promise.all([
  import(pathToFileURL(resolve(triptychRoot, "tools/lib/two-mib-system.mjs"))),
  Promise.resolve(
    createRequire(import.meta.url)(
      resolve(triptychRoot, "dist/wasm/triptych_host_wasm.js"),
    ),
  ),
]);

const base = Buffer.from(
  await readFile(resolve(triptychRoot, "distribution/disk-library", baseAsset)),
);
assert.equal(base.length, 2_097_152, "retained base image is 2 MiB");
assert.equal(hash(base), baseRevision, "retained base image matches its pin");

const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, "triptych-cpu-v0.1-2m-n04");
const horton = Buffer.from(await readFile(resolve(root, "dist/HORTON.COM")));

const disk = new CpmDisk(Uint8Array.from(base));
let image;
try {
  assert.ok(!disk.file_names().includes("HORTON.COM"), "base image has no old Horton binary");
  disk.add_import("HORTON.COM", Uint8Array.from(horton));
  image = Buffer.from(disk.export_candidate());
} finally {
  disk.free();
}

assert.deepEqual(
  image.subarray(0, systemBuild.system.length),
  Buffer.from(systemBuild.system),
  "preview image contains the pinned Triptych residents",
);
const verified = new CpmDisk(Uint8Array.from(image));
try {
  assert.ok(verified.file_names().includes("HORTON.COM"));
  assert.equal(verified.file_records("HORTON.COM"), Math.ceil(horton.length / 128));
  assert.deepEqual(
    Buffer.from(verified.read_file("HORTON.COM")).subarray(0, horton.length),
    horton,
    "preview image contains the exact built Horton executable",
  );
} finally {
  verified.free();
}

const imageSha256 = hash(image);
const imageAsset = `horton-preview-${imageSha256}.img`;
const descriptor = {
  schema: "triptych-external-system-v1",
  name: "Horton Commander preview",
  instruction: "Type HORTON to start Horton Commander. B, C and D are persistent writable disks.",
  profile: "triptych-cpu-v0.1-2m-n04",
  image: {
    asset: imageAsset,
    bytes: image.length,
    sha256: imageSha256,
  },
  workDisk: "copy-image",
  workDrives: ["B", "C", "D"],
};

await mkdir(previewDirectory, { recursive: true });
await writeFile(resolve(previewDirectory, imageAsset), image);
await writeFile(
  resolve(previewDirectory, "system.json"),
  `${JSON.stringify(descriptor, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify(
    {
      schema: "horton-preview-build-v1",
      baseImage: { asset: baseAsset, sha256: baseRevision },
      triptychCommit: systemBuild.descriptor.machine.revision,
      horton: { bytes: horton.length, sha256: hash(horton) },
      preview: {
        asset: imageAsset,
        bytes: image.length,
        sha256: imageSha256,
        descriptor: "site/releases/preview/system.json",
      },
    },
    null,
    2,
  )}\n`,
);
