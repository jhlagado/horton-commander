import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  assembleAtomProject,
  materializeAtomGeneration,
  writeAtomD8,
} from "atom-z80";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "src/main.asm");
const outputDirectory = resolve(root, "dist");
const atomRevision = "802b5c2d320bec777f427755ff2d7338e3b80a05";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const result = await assembleAtomProject({
  root: dirname(source),
  entry: "main.asm",
});
const addresses = [
  ...result.generation.images.map((image) => image.address),
  ...result.generation.layout.map((event) => event.address),
];
assert.ok(addresses.length > 0, "ATOM emitted no image");
const baseAddress = Math.min(...addresses);
assert.equal(baseAddress, 0x0100, "HORTON.COM load address");
const { bytes } = materializeAtomGeneration(result.generation, {
  base: baseAddress,
});
assert.ok(bytes.length > 0, "ATOM emitted an empty COM image");

await mkdir(outputDirectory, { recursive: true });
const binaryPath = resolve(outputDirectory, "HORTON.COM");
await writeFile(binaryPath, bytes);
const debugMap = writeAtomD8(result.project, result.generation, {
  base: baseAddress,
});
await writeFile(
  resolve(outputDirectory, "HORTON.d8.json"),
  `${JSON.stringify(debugMap, null, 2)}\n`,
);
const manifest = {
  schema: "horton-commander-build-v1",
  artifact: "HORTON.COM",
  loadAddress: baseAddress,
  bytes: bytes.length,
  sha256: sha256(bytes),
  sourceSha256: sha256(await readFile(source)),
  assembler: {
    package: "atom-z80",
    revision: atomRevision,
  },
};
await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
