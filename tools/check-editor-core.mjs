import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const pinned = {
  schema: "z80-editor-core-lock-v1",
  name: "edit-document-core",
  version: 1,
  repository: "https://github.com/jhlagado/edit.git",
  revision: "63762528365f8db04464d2fe9bcf4cc4e8091a68",
  license: "GPL-3.0-or-later",
  modules: [
    {
      file: "editor-document.asm",
      sha256: "5f74b04c2108da4f97907e4e1252adfb34f5f22ffb1e4a33c5cc2c7ec8af0f89",
    },
    {
      file: "editor-buffer.asm",
      sha256: "6e22329a51aeb384e2417a254517cb1ec046ef602e03067af75e2d75a1b2c158",
    },
    {
      file: "editor-navigation.asm",
      sha256: "14a952caa3931fdc978ac1b2d453075a7bf7f8119996c563289b7a3b883163c2",
    },
  ],
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function verifyEditorCore({ projectRoot, moduleDirectory }) {
  const lock = JSON.parse(
    await readFile(resolve(projectRoot, "editor-core.lock.json"), "utf8"),
  );
  if (!isDeepStrictEqual(lock, pinned)) {
    throw new Error("editor-core.lock.json does not match the pinned Edit core revision");
  }

  const source = [];
  for (const module of pinned.modules) {
    const actual = sha256(await readFile(resolve(moduleDirectory, module.file)));
    if (actual !== module.sha256) {
      throw new Error(
        `pinned editor core changed: ${module.file} has ${actual}, expected ${module.sha256}`,
      );
    }
    source.push({ file: module.file, sha256: actual });
  }
  return { name: pinned.name, version: pinned.version, revision: pinned.revision, source };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    throw new Error("usage: node tools/check-editor-core.mjs <module-directory>");
  }
  const moduleDirectory = resolve(root, process.argv[2]);
  const result = await verifyEditorCore({ projectRoot: root, moduleDirectory });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
