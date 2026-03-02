import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SynapseTestClient {
	callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
	close: () => void;
	tmpDir: string;
}

// JSON-RPC response shape
interface JsonRpcResponse {
	jsonrpc: string;
	id: number | string;
	result?: unknown;
	error?: { code: number; message: string };
}

/**
 * Spawn a Synapse MCP server as a subprocess for integration tests.
 * Uses stdio transport (JSON-RPC over stdin/stdout).
 *
 * The client handles:
 * - Spawning synapse-server with a temp LanceDB directory
 * - MCP initialization handshake
 * - Sending tool calls and reading responses
 * - Cleanup on close()
 */
export async function createSynapseTestClient(): Promise<SynapseTestClient> {
	const tmpDir = mkdtempSync(join(tmpdir(), "synapse-integration-"));

	// Resolve synapse-server path relative to this helper
	// In monorepo: packages/framework/test/helpers/ → 3 levels up to packages/ → server/
	const serverPath = join(import.meta.dir, "..", "..", "..", "server", "src", "index.ts");

	const proc = Bun.spawn(["bun", "run", serverPath, "--db", tmpDir], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			// Point to invalid Ollama URL so embedding calls fail fast (not hang)
			OLLAMA_URL: "http://localhost:19999",
			EMBED_MODEL: "nomic-embed-text",
		},
	});

	let requestId = 0;
	const decoder = new TextDecoder();
	let stdoutBuffer = "";
	// Pending request resolvers: id -> resolve function
	const pending = new Map<number | string, (response: JsonRpcResponse) => void>();
	// Queue of unprocessed lines
	let stdoutReaderActive = false;

	// Start a background reader for stdout that dispatches responses to pending resolvers
	async function startReader() {
		if (stdoutReaderActive) return;
		stdoutReaderActive = true;

		const reader = proc.stdout.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				stdoutBuffer += decoder.decode(value);

				// Parse complete newline-delimited lines
				const lines = stdoutBuffer.split("\n");
				stdoutBuffer = lines[lines.length - 1] ?? "";

				for (let i = 0; i < lines.length - 1; i++) {
					const line = lines[i]?.trim();
					if (!line) continue;
					try {
						const response = JSON.parse(line) as JsonRpcResponse;
						// Dispatch to pending resolver
						if (response.id !== undefined) {
							const resolve = pending.get(response.id);
							if (resolve) {
								pending.delete(response.id);
								resolve(response);
							}
						}
						// Ignore notifications (no id)
					} catch {
						// Skip malformed lines
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	// Start the background reader
	startReader().catch(() => {
		// Reader failure is expected when server closes
	});

	async function sendRequest(
		method: string,
		params: Record<string, unknown> = {},
	): Promise<JsonRpcResponse> {
		const id = ++requestId;
		const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

		const responsePromise = new Promise<JsonRpcResponse>((resolve) => {
			pending.set(id, resolve);
		});

		proc.stdin.write(msg);
		await proc.stdin.flush();

		// Wait for response with a 30-second timeout
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`Timeout waiting for response to ${method} (id=${id})`)), 30_000),
		);

		return Promise.race([responsePromise, timeoutPromise]);
	}

	function sendNotification(method: string, params: Record<string, unknown> = {}) {
		const msg = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
		proc.stdin.write(msg);
		proc.stdin.flush();
	}

	// MCP initialization handshake
	await sendRequest("initialize", {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "synapse-framework-test", version: "0.1.0" },
	});

	// Send initialized notification (required by MCP protocol before tool calls)
	sendNotification("notifications/initialized");

	async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
		const response = await sendRequest("tools/call", { name, arguments: args });
		return response;
	}

	function close() {
		try {
			proc.kill();
		} catch {
			// Process may already be dead
		}
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Directory may already be removed
		}
	}

	return { callTool, close, tmpDir };
}
