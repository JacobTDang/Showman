/**
 * M4.1 — MCP server. A thin adapter over the Showman capabilities, exposing them
 * as MCP tools so any agent can discover the schema, author + validate + preview a
 * scene, submit a render, and poll for the result URL. Runs over stdio.
 *
 * The backend is pluggable: in-process (DirectBackend) or over HTTP to a gateway
 * (HttpBackend). Tool dispatch lives in showmanTools.ts and is unit-tested
 * independently of this transport wiring.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFINITIONS, callTool, type ShowmanClient } from "./showmanTools.js";

/** Build an MCP Server bound to a Showman backend (does not start a transport). */
export function createMcpServer(client: ShowmanClient): Server {
  const server = new Server({ name: "showman", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await callTool(client, name, (args ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: JSON.stringify({ error: (err as Error).message }) }], isError: true };
    }
  });

  return server;
}

/** Start the MCP server over stdio. */
export async function startMcpServer(client: ShowmanClient): Promise<void> {
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
