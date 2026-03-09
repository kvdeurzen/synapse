#!/usr/bin/env node
/**
 * setup-tree-sitter.js
 *
 * Postinstall script for tree-sitter native bindings (Bun + Node).
 *
 * Background: tree-sitter's index.js has a Bun-specific code path that tries
 * to load from `./prebuilds/${process.platform}-${process.arch}/tree-sitter.node`.
 * However, when bun installs tree-sitter, the native addon is compiled from source
 * (using node-gyp) and placed in `build/Release/tree_sitter_runtime_binding.node`
 * -- NOT in the prebuilds/ directory that the Bun code path expects.
 *
 * Under Node.js (the actual MCP server runtime via npx tsx), tree-sitter's
 * node-gyp-build path works correctly IF the binary was built. If the initial
 * build failed (e.g., missing C++20 headers on Node 24), this script attempts
 * a rebuild with CXXFLAGS=-std=c++20.
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
 * warning and exits — the server will start but code indexing will be unavailable.
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

/**
 * Attempt to build tree-sitter from source with C++20 support if the binary is missing.
 * Works under both Bun (bunx node-gyp) and Node (npx node-gyp).
 */
function tryBuild(tsDirectory, binaryPath) {
  if (!existsSync(binaryPath) && existsSync(tsDirectory)) {
    console.log("[setup-tree-sitter] Binary missing — attempting to build with C++20 support...");
    // Use bunx under Bun, npx under Node
    const runner = typeof process.versions.bun === "string" ? "bunx" : "npx";
    try {
      execSync(`${runner} node-gyp rebuild`, {
        cwd: tsDirectory,
        env: { ...process.env, CXXFLAGS: "-std=c++20" },
        stdio: "inherit",
      });
      console.log("[setup-tree-sitter] Build succeeded.");
    } catch (err) {
      console.warn(
        "[setup-tree-sitter] Build failed. Try: cd",
        tsDirectory,
        `&& CXXFLAGS=-std=c++20 ${runner} node-gyp rebuild`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Determine which location has (or should have) the compiled binary
// ---------------------------------------------------------------------------

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
  console.warn(
    "[setup-tree-sitter] No compiled binary found after build attempts.\n" +
      "  Code indexing (/synapse:map) will not work until tree-sitter is built.\n" +
      "  Fix: cd .claude/server && CXXFLAGS='-std=c++20' bun install"
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Bun-specific: copy binary to prebuilds/ directory
// ---------------------------------------------------------------------------
// Under Bun, tree-sitter looks for prebuilds/${platform}-${arch}/tree-sitter.node
// Under Node, node-gyp-build finds build/Release/ automatically — no copy needed

if (typeof process.versions.bun === "string") {
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
  console.log(
    "[setup-tree-sitter] Running under Node.js — binary at",
    activeBuiltBinary
  );
}
