import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  assembleAtomProject,
  materializeAtomGeneration,
  writeAtomD8,
} from "atom-z80";
import { verifyEditorCore } from "./check-editor-core.mjs";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "src/main.asm");
const hortonEntry = resolve(root, "src/horton.asm");
const editorSource = resolve(root, "src/editor/editor.asm");
const editorCore = await verifyEditorCore({
  projectRoot: root,
  moduleDirectory: resolve(root, "src/editor"),
});
const outputDirectory = resolve(root, "dist");
const atomRevision = "802b5c2d320bec777f427755ff2d7338e3b80a05";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const hortonResult = await assembleAtomProject({
  root: dirname(hortonEntry),
  entry: "horton.asm",
});
const editorResult = await assembleAtomProject({
  root: dirname(editorSource),
  entry: "editor.asm",
});
const addressRange = (generation, description) => {
  const addresses = [
    ...generation.images.map((image) => image.address),
    ...generation.layout.map((event) => event.address),
  ];
  assert.ok(addresses.length > 0, `${description} emitted no image`);
  return { start: Math.min(...addresses), end: Math.max(...addresses) + 1 };
};
const hortonRange = addressRange(hortonResult.generation, "HORTON");
const editorRange = addressRange(editorResult.generation, "Edit");
const baseAddress = hortonRange.start;
const editorBase = 0x3400;
assert.equal(baseAddress, 0x0100, "HC.COM load address");
assert.equal(editorRange.start, editorBase, "Edit entry segment address");
assert.ok(hortonRange.end <= editorBase, "Horton code does not overlap Edit");
assert.ok(editorRange.end <= 0x4c00, "Edit code does not overlap its workspace");
const horton = materializeAtomGeneration(hortonResult.generation, {
  base: baseAddress,
});
const editor = materializeAtomGeneration(editorResult.generation, {
  base: editorBase,
});
assert.ok(horton.bytes.length > 0, "ATOM emitted an empty Horton image");
assert.ok(editor.bytes.length > 0, "ATOM emitted an empty Edit image");
const editorOffset = editorBase - baseAddress;
assert.ok(horton.bytes.length <= editorOffset, "Horton bytes do not overlap Edit");
const bytes = Buffer.alloc(editorOffset + editor.bytes.length, 0);
bytes.set(horton.bytes, 0);
bytes.set(editor.bytes, editorOffset);

await mkdir(outputDirectory, { recursive: true });
for (const obsoleteArtifact of ["HORTON.COM", "HORTON.d8.json"]) {
  try {
    await unlink(resolve(outputDirectory, obsoleteArtifact));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const binaryPath = resolve(outputDirectory, "HC.COM");
await writeFile(binaryPath, bytes);
const hortonDebugMap = writeAtomD8(hortonResult.project, hortonResult.generation, {
  base: baseAddress,
});
const editorDebugMap = writeAtomD8(editorResult.project, editorResult.generation, {
  base: editorBase,
});
const debugMap = {
  ...hortonDebugMap,
  files: { ...hortonDebugMap.files, ...editorDebugMap.files },
  segments: [...hortonDebugMap.segments, ...editorDebugMap.segments].sort(
    (left, right) => left.start - right.start,
  ),
  fileList: [...new Set([...hortonDebugMap.fileList, ...editorDebugMap.fileList])],
  symbols: [...hortonDebugMap.symbols, ...editorDebugMap.symbols].sort(
    (left, right) => left.address - right.address,
  ),
};
await writeFile(
  resolve(outputDirectory, "HC.d8.json"),
  `${JSON.stringify(debugMap, null, 2)}\n`,
);
const manifest = {
  schema: "horton-commander-build-v1",
  artifact: "HC.COM",
  loadAddress: baseAddress,
  bytes: bytes.length,
  sha256: sha256(bytes),
  sourceSha256: sha256(await readFile(source)),
  sourceFiles: await Promise.all(
    ["src/horton.asm", "src/main.asm", "src/sizes.asm"].map(async (path) => ({
      path,
      sha256: sha256(await readFile(resolve(root, path))),
    })),
  ),
  editor: {
    profile: "horton-quick-edit",
    source: "src/editor/editor.asm",
    core: editorCore,
    loadAddress: editorBase,
    bytes: editor.bytes.length,
    endAddress: editorRange.end,
    sha256: sha256(editor.bytes),
  },
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
