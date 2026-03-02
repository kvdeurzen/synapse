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
 *
 * In a Bun workspace, tree-sitter may be hoisted to the root node_modules/.
 * This script checks both the package-local and root node_modules locations.
 *
 * Node.js 24 / tree-sitter@0.25.x compatibility note:
 * tree-sitter's binding.gyp requests -std=c++17, but Node.js 24 headers require C++20.
 * If the binary is missing (build failed), this script attempts to rebuild with
 * CXXFLAGS=-std=c++20 using node-gyp. If node-gyp is unavailable, it logs a
 * warning and exits — the server will fail to start until the binary is built.
 */

import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Package-local paths (non-hoisted case: packages/server/node_modules/tree-sitter/)
const builtBinary = join(
  projectRoot,
  "node_modules/tree-sitter/build/Release/tree_sitter_runtime_binding.node"
);
const prebuildDir = join(
  projectRoot,
  `node_modules/tree-sitter/prebuilds/${process.platform}-${process.arch}`
);
const tsDir = join(projectRoot, "node_modules/tree-sitter");

// Root node_modules paths (hoisted case: <repo-root>/node_modules/tree-sitter/)
const rootBuiltBinary = join(
  projectRoot,
  "../../node_modules/tree-sitter/build/Release/tree_sitter_runtime_binding.node"
);
const rootPrebuildDir = join(
  projectRoot,
  `../../node_modules/tree-sitter/prebuilds/${process.platform}-${process.arch}`
);
const rootTsDir = join(projectRoot, "../../node_modules/tree-sitter");

// Only run if we are under Bun (the setup is only needed for Bun)
if (typeof process.versions.bun === "string") {
  // Try to build tree-sitter if the binary is missing but the source directory exists
  function tryBuild(tsDirectory, binaryPath) {
    if (!existsSync(binaryPath) && existsSync(tsDirectory)) {
      console.log("[setup-tree-sitter] Binary missing — attempting to build with C++20 support...");
      try {
        // Node.js 24 requires C++20; override tree-sitter's binding.gyp C++17 default
        execSync("bunx node-gyp rebuild", {
          cwd: tsDirectory,
          env: { ...process.env, CXXFLAGS: "-std=c++20" },
          stdio: "inherit",
        });
        console.log("[setup-tree-sitter] Build succeeded.");
      } catch (err) {
        console.warn(
          "[setup-tree-sitter] Build failed. Try: cd",
          tsDirectory,
          "&& CXXFLAGS=-std=c++20 bunx node-gyp rebuild"
        );
      }
    }
  }

  // Determine which location has (or should have) the compiled binary
  let activeBuiltBinary = null;
  let activePrebuildDir = null;

  // Check package-local first
  tryBuild(tsDir, builtBinary);

  if (existsSync(builtBinary)) {
    activeBuiltBinary = builtBinary;
    activePrebuildDir = prebuildDir;
  } else {
    // Check root (hoisted case)
    tryBuild(rootTsDir, rootBuiltBinary);
    if (existsSync(rootBuiltBinary)) {
      activeBuiltBinary = rootBuiltBinary;
      activePrebuildDir = rootPrebuildDir;
    }
  }

  if (!activeBuiltBinary) {
    console.log(
      "[setup-tree-sitter] No compiled binary found — skipping Bun prebuilds workaround"
    );
    process.exit(0);
  }

  const prebuildBinary = join(activePrebuildDir, "tree-sitter.node");

  if (!existsSync(activePrebuildDir)) {
    mkdirSync(activePrebuildDir, { recursive: true });
  }

  if (!existsSync(prebuildBinary)) {
    copyFileSync(activeBuiltBinary, prebuildBinary);
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
