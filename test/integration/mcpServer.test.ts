import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RenderService, LocalObjectStorage, InMemoryJobStore, JobRunner } from "../../src/index.js";
import { DirectBackend, createMcpServer } from "../../src/index.js";

let dataDir: string;
let client: Client;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "showman-mcpsrv-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({ storage, workDir: join(dataDir, "tmp") });
  const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 1 });
  const server = createMcpServer(new DirectBackend(service, jobRunner));

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("MCP server protocol round-trip (M4.1)", () => {
  it("lists the capability tools over MCP", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("showman_get_schema");
    expect(names).toContain("showman_submit_render");
  });

  it("calls get_schema and gets the contract back", async () => {
    const res = await client.callTool({ name: "showman_get_schema", arguments: {} });
    const content = res.content as Array<{ type: string; text: string }>;
    const schema = JSON.parse(content[0]!.text);
    expect(schema.specVersion).toBe(1);
  });

  it("validates a scene through the protocol", async () => {
    const res = await client.callTool({
      name: "showman_validate_scene",
      arguments: { spec: { specVersion: 1, width: 64, height: 64, fps: 5, duration: 1, nodes: [{ id: "a", type: "rect" }] } },
    });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]!.text).valid).toBe(true);
  });
});
