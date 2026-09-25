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
    )
  ),
  import(pathToFileURL(resolve(triptychRoot, "tools/lib/two-mib-system.mjs"))),
]);
const { TriptychCpu, CpmDisk } = createRequire(import.meta.url)(
  resolve(triptychRoot, "dist/wasm/triptych_host_wasm.js"),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ascii = (value) => Buffer.from(value, "ascii");
const descriptor = JSON.parse(
  await readFile(resolve(root, "site/releases/preview/system.json"), "utf8"),
);
const image = Buffer.from(
  await readFile(
    resolve(root, "site/releases/preview", descriptor.image.asset),
  ),
);
assert.equal(descriptor.profile, "triptych-cpu-v0.1-2m-n04");
assert.deepEqual(descriptor.workDrives, ["B", "C", "D"]);
assert.equal(descriptor.image.bytes, 2_097_152);
assert.equal(image.length, descriptor.image.bytes);
assert.equal(hash(image), descriptor.image.sha256);

const systemBuild = await buildTwoMibSystem(triptychRoot, 4, {
  allowDirty: false,
});
assert.equal(systemBuild.descriptor.residentProfile, descriptor.profile);
assert.deepEqual(
  image.subarray(0, systemBuild.system.length),
  Buffer.from(systemBuild.system),
  "published image contains the current matching CP/M residents",
);

const aDisk = new CpmDisk(Uint8Array.from(image));
try {
  assert.ok(aDisk.file_names().includes("HORTON.COM"));
  assert.deepEqual(
    Buffer.from(aDisk.read_file("HORTON.COM")).subarray(0, 10_854),
    await readFile(resolve(root, "dist/HORTON.COM")),
  );
} finally {
  aDisk.free();
}

const otherDrives = [];
for (let index = 0; index < 3; index += 1) {
  const disk = CpmDisk.create_two_mib();
  try {
    otherDrives.push(Buffer.from(disk.export_candidate()));
  } finally {
    disk.free();
  }
}

const cpu = new TriptychCpu(systemBuild.bootstrap);
const terminal = new TerminalBuffer();
let output = Buffer.alloc(0);
function drain() {
  const bytes = Buffer.from(cpu.take_serial_output());
  if (bytes.length > 0) {
    output = Buffer.concat([output, bytes]);
    terminal.write(bytes);
  }
}
function runUntil(description, predicate) {
  for (let slice = 0; slice < 20_000; slice += 1) {
    const reason = cpu.run_slice(20_000, 300_000);
    drain();
    if (predicate()) return;
    assert.notEqual(reason, 4, `${description}: CPU halted unexpectedly`);
  }
  throw new Error(`${description}: timed out`);
}

try {
  cpu.install_drive(0, Uint8Array.from(image), false);
  for (let index = 0; index < 3; index += 1)
    cpu.install_drive(index + 1, otherDrives[index], true);
  runUntil("A: CCP prompt", () => /\r\nA>\s*$/.test(output.toString("latin1")));
  assert.equal(cpu.enqueue_serial_input(ascii("A:HORTON\r")), true);
  runUntil("Horton file panels", () => terminal.text().includes("Q quit"));
  assert.match(terminal.text(), /HORTON\s+\.COM/);
  assert.match(terminal.text(), /A:/);
  assert.match(terminal.text(), /B:/);
  assert.match(terminal.text(), /Q quit/);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "horton-increment-8-preview-image-proof-v1",
        passed: true,
        imageBytes: image.length,
        imageSha256: hash(image),
        profile: descriptor.profile,
        attachedDrives: ["A", "B", "C", "D"],
        hortonLoadedFromPublishedAImage: true,
        panelScreenContains: ["HORTON.COM", "A:", "B:", "Q quit"],
      },
      null,
      2,
    )}\n`,
  );
} finally {
  cpu.free();
}
