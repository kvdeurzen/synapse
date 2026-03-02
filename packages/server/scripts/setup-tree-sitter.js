#!/usr/bin/env node
/**
 * setup-tree-sitter.js
 *
 * Bun-specific workaround for tree-sitter native bindings.
 *
 * Background: tree-sitter's index.js has a Bun-specific code path that tries
 * to load from `./prebuilds/${process.platform}-${process.arch}/tree-sitter.node`.
 * However, when bun installs tree-sitter, the native addon is compiled from source
 * (using node-gyp) and placed in `build/Release/tree_sitter_runtime_binding.node`
 * -- NOT in the prebuilds/ directory that the Bun code path expects.
 *
 * This script copies the compiled binary to the expected prebuilds location so
 * that `import Parser from "tree-sitter"` works correctly in Bun.
 *
 * This postinstall script runs automatically after `bun install`.
 */

import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const builtBinary = join(
  projectRoot,
  "node_modules/tree-sitter/build/Release/tree_sitter_runtime_binding.node"
);
const prebuildDir = join(
  projectRoot,
  `node_modules/tree-sitter/prebuilds/${process.platform}-${process.arch}`
);
const prebuildBinary = join(prebuildDir, "tree-sitter.node");

// Only run if we are under Bun (the setup is only needed for Bun)
if (typeof process.versions.bun === "string") {
  if (!existsSync(builtBinary)) {
    // tree-sitter build hasn't run yet or failed — node-gyp-build will handle it for Node.js
    console.log(
      "[setup-tree-sitter] No compiled binary found at",
      builtBinary,
      "— skipping Bun prebuilds workaround"
    );
    process.exit(0);
  }

  if (!existsSync(prebuildDir)) {
    mkdirSync(prebuildDir, { recursive: true });
  }

  if (!existsSync(prebuildBinary)) {
    copyFileSync(builtBinary, prebuildBinary);
    console.log(
      "[setup-tree-sitter] Copied tree-sitter native binary to",
      prebuildBinary
    );
  } else {
    console.log(
      "[setup-tree-sitter] Prebuilt binary already in place at",
      prebuildBinary
    );
  }
} else {
  // Under Node.js, tree-sitter's node-gyp-build path works correctly
  console.log(
    "[setup-tree-sitter] Running under Node.js — no Bun workaround needed"
  );
}
