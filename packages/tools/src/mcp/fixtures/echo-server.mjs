#!/usr/bin/env node
/**
 * Minimal stdio MCP server for `@agent-dev-lab/tools` tests.
 * Speaks newline-delimited JSON-RPC: initialize, tools/list, tools/call (echo).
 */
import { createInterface } from "node:readline";

const PROTOCOL_VERSION = "2025-06-18";

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "adl-echo-fixture", version: "0.0.0" },
      },
    });
    return;
  }

  if (method === "tools/list") {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "echo",
            description: "Echo the message argument back as text.",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "Text to echo" },
              },
              required: ["message"],
              additionalProperties: false,
            },
          },
        ],
      },
    });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (name !== "echo") {
      write({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `Unknown tool: ${String(name)}` }],
          isError: true,
        },
      });
      return;
    }
    const messageText = typeof args.message === "string" ? args.message : "";
    write({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: messageText }],
        isError: false,
      },
    });
    return;
  }

  if (id !== undefined) {
    write({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${String(method)}` },
    });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (message.method && message.id === undefined) {
    // notifications (e.g. notifications/initialized) — ignore
    return;
  }
  if (message.method) {
    handleRequest(message);
  }
});
