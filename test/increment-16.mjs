import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { verifyEditorCore } from "../tools/check-editor-core.mjs";

const root = resolve(import.meta.dirname, "..");
const moduleDirectory = resolve(root, "src/editor");
assert.equal(existsSync(resolve(root, "dist/HORTON.COM")), false, "obsolete binary name is absent");
assert.equal(existsSync(resolve(root, "dist/HORTON.d8.json")), false, "obsolete debug map is absent");
const core = await verifyEditorCore({ projectRoot: root, moduleDirectory });
const manifest = JSON.parse(await readFile(resolve(root, "dist/manifest.json"), "utf8"));
const lock = JSON.parse(await readFile(resolve(root, "editor-core.lock.json"), "utf8"));

assert.equal(lock.revision, "63762528365f8db04464d2fe9bcf4cc4e8091a68");
assert.deepEqual(manifest.editor.core, core, "HC.COM manifest records the pinned source core");
assert.equal(core.source.length, 3, "the stable document and editing modules are pinned");

const temporary = await mkdtemp(resolve(tmpdir(), "horton-editor-core-"));
try {
  const temporaryModules = resolve(temporary, "modules");
  await mkdir(temporaryModules);
  await writeFile(resolve(temporary, "editor-core.lock.json"), JSON.stringify(lock, null, 2));
  for (const module of lock.modules) {
    await writeFile(
      resolve(temporaryModules, module.file),
      await readFile(resolve(moduleDirectory, module.file)),
    );
  }
  await writeFile(resolve(temporaryModules, "editor-buffer.asm"), "; local edit\n", { flag: "a" });
  await assert.rejects(
    verifyEditorCore({ projectRoot: temporary, moduleDirectory: temporaryModules }),
    /pinned editor core changed: editor-buffer\.asm/,
    "the integrity check rejects an edited vendored module",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  schema: "horton-increment-16-proof-v1",
  passed: true,
  coreRevision: core.revision,
  artifactRename: "HC.COM",
  modules: core.source,
  buildRejectsModifiedCore: true,
}, null, 2)}\n`);
