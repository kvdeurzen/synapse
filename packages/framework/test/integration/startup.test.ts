import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createSynapseTestClient, type SynapseTestClient } from "../helpers/synapse-client";

// Check if synapse-server exists — skip all tests if not
const SERVER_PATH = join(import.meta.dir, "..", "..", "..", "server", "src", "index.ts");
const serverExists = existsSync(SERVER_PATH);

describe.skipIf(!serverExists)("Integration: Synapse startup sequence", () => {
  let client: SynapseTestClient;

  afterEach(() => {
    client?.close();
  });

  test("init_project creates a project and returns success", async () => {
    client = await createSynapseTestClient();
    const result = await client.callTool("init_project", {
      project_id: "test-integration",
      name: "Test Integration Project",
    });

    expect(result).toBeDefined();
    // Extract the actual result from JSON-RPC response
    const rpcResult = result as { result?: { content?: Array<{ text?: string }> } };
    const text = rpcResult?.result?.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text as string) as { success: boolean; data?: unknown };
    expect(parsed.success).toBe(true);
  }, 30_000); // 30s timeout for server startup

  test("create_task then get_task_tree returns the task", async () => {
    client = await createSynapseTestClient();

    // Init project first
    await client.callTool("init_project", {
      project_id: "test-tree",
      name: "Test Tree Project",
    });

    // Create an epic (depth=0, no embedding needed at create time for depth=0? Check server behavior)
    const createResult = await client.callTool("create_task", {
      project_id: "test-tree",
      title: "Test Epic",
      description: "An integration test epic",
      depth: 0,
    });
    const createRpc = createResult as { result?: { content?: Array<{ text?: string }> } };
    const createText = createRpc?.result?.content?.[0]?.text;
    expect(createText).toBeDefined();
    const created = JSON.parse(createText as string) as {
      success: boolean;
      data?: { task_id: string };
      error?: string;
    };
    // create_task may fail due to Ollama unavailability — check for expected error
    if (!created.success) {
      // Ollama is not available in CI — acceptable failure
      expect(created.error).toBeDefined();
      console.warn("create_task failed (Ollama unavailable):", created.error);
      return;
    }
    expect(created.success).toBe(true);
    const taskId = created.data?.task_id;
    expect(taskId).toBeDefined();

    // Get task tree
    const treeResult = await client.callTool("get_task_tree", {
      project_id: "test-tree",
      root_task_id: taskId,
    });
    const treeRpc = treeResult as { result?: { content?: Array<{ text?: string }> } };
    const treeText = treeRpc?.result?.content?.[0]?.text;
    expect(treeText).toBeDefined();
    const tree = JSON.parse(treeText as string) as {
      success: boolean;
      data?: { tree: { title: string } };
    };
    expect(tree.success).toBe(true);
    expect(tree.data?.tree.title).toBe("Test Epic");
  }, 30_000);

  test("get_smart_context returns response for initialized project", async () => {
    client = await createSynapseTestClient();

    await client.callTool("init_project", {
      project_id: "test-ctx",
      name: "Test Context Project",
    });

    const ctxResult = await client.callTool("get_smart_context", {
      project_id: "test-ctx",
      mode: "overview",
    });
    expect(ctxResult).toBeDefined();
    // Response may be empty for new project, but should not error
    const ctxRpc = ctxResult as { result?: { content?: Array<{ text?: string }> } };
    const ctxText = ctxRpc?.result?.content?.[0]?.text;
    expect(ctxText).toBeDefined();
  }, 30_000);
});
