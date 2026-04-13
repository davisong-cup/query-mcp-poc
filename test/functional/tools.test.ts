import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/server.js";
import { MockProvider } from "../helpers/mock-provider.js";
import { Config } from "../../src/config.js";

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    queryTimeoutSeconds: 30,
    maxRowLimit: 500,
    redshift: {
      awsRegion: "us-east-1",
      clusterId: "test-cluster",
      database: "test-db",
      dbUser: "test-user",
    },
    ...overrides,
  };
}

async function setup(provider?: MockProvider, config?: Config) {
  const p = provider ?? new MockProvider();
  const c = config ?? makeConfig();
  const server = createMcpServer(c, p as any);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: "test-client", version: "0.1.0" },
    { capabilities: { tasks: {} } },
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  await client.listTools();

  return { client, server, provider: p };
}

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type TaskStreamOutcome =
  | { type: "result"; result: ToolResult }
  | { type: "error"; error: Error };

async function callTaskTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<TaskStreamOutcome> {
  const stream = client.experimental.tasks.callToolStream(
    { name, arguments: args },
    CallToolResultSchema,
  );

  for await (const message of stream) {
    if (message.type === "result") {
      return { type: "result", result: message.result as ToolResult };
    }
    if (message.type === "error") {
      return { type: "error", error: message.error };
    }
  }

  throw new Error("No result received from task stream");
}

describe("MCP tools via InMemoryTransport", () => {
  describe("list_tables", () => {
    it("returns structured table list", async () => {
      const provider = new MockProvider({
        results: {
          columns: [
            { name: "table_schema", type: "varchar" },
            { name: "table_name", type: "varchar" },
          ],
          rows: [
            { table_schema: "analytics", table_name: "users" },
            { table_schema: "analytics", table_name: "orders" },
          ],
          rowCount: 2,
          truncated: false,
        },
      });
      const { client } = await setup(provider);
      const outcome = await callTaskTool(client, "list_tables");
      expect(outcome.type).toBe("result");
      const tables = (outcome as { type: "result"; result: ToolResult }).result.structuredContent!.tables as Array<{ schema: string; name: string }>;
      expect(tables).toEqual([
        { schema: "analytics", name: "users" },
        { schema: "analytics", name: "orders" },
      ]);
    });
  });

  describe("describe_table", () => {
    it("returns column descriptions", async () => {
      const provider = new MockProvider({
        results: {
          columns: [
            { name: "column_name", type: "varchar" },
            { name: "data_type", type: "varchar" },
            { name: "is_nullable", type: "varchar" },
            { name: "column_default", type: "varchar" },
            { name: "ordinal_position", type: "integer" },
          ],
          rows: [
            { column_name: "id", data_type: "integer", is_nullable: "NO", column_default: null, ordinal_position: 1 },
            { column_name: "email", data_type: "varchar(255)", is_nullable: "YES", column_default: null, ordinal_position: 2 },
          ],
          rowCount: 2,
          truncated: false,
        },
      });
      const { client } = await setup(provider);
      const outcome = await callTaskTool(client, "describe_table", { table_name: "analytics.users" });
      expect(outcome.type).toBe("result");
      const columns = (outcome as { type: "result"; result: ToolResult }).result.structuredContent!.columns as Array<{
        name: string; type: string; nullable: boolean; ordinalPosition: number;
      }>;
      expect(columns).toEqual([
        { ordinalPosition: 1, name: "id", type: "integer", nullable: false, defaultValue: null },
        { ordinalPosition: 2, name: "email", type: "varchar(255)", nullable: true, defaultValue: null },
      ]);
    });
  });

  describe("explain", () => {
    it("returns query plan", async () => {
      const provider = new MockProvider({
        results: {
          columns: [{ name: "QUERY PLAN", type: "varchar" }],
          rows: [
            { "QUERY PLAN": "XN Seq Scan on users  (cost=0.00..0.03 rows=3 width=100)" },
            { "QUERY PLAN": "  Filter: (id > 0)" },
          ],
          rowCount: 2,
          truncated: false,
        },
      });
      const { client } = await setup(provider);
      const outcome = await callTaskTool(client, "explain", { sql: "SELECT * FROM users" });
      expect(outcome.type).toBe("result");
      const steps = (outcome as { type: "result"; result: ToolResult }).result.structuredContent!.steps as string[];
      expect(steps).toEqual([
        "XN Seq Scan on users  (cost=0.00..0.03 rows=3 width=100)",
        "  Filter: (id > 0)",
      ]);
    });
  });

  describe("query", () => {
    it("returns query results", async () => {
      const { client } = await setup();
      const outcome = await callTaskTool(client, "query", { sql: "SELECT * FROM users" });
      expect(outcome.type).toBe("result");
      const sc = (outcome as { type: "result"; result: ToolResult }).result.structuredContent!;
      expect(sc.rowCount).toBe(3);
      expect((sc.rows as Array<{ name: string }>)[0].name).toBe("Alice");
    });

    it("sets truncated flag when results are truncated", async () => {
      const provider = new MockProvider({
        results: {
          columns: [{ name: "id", type: "integer" }],
          rows: [{ id: 1 }, { id: 2 }],
          rowCount: 2,
          truncated: true,
        },
      });
      const { client } = await setup(provider);
      const outcome = await callTaskTool(client, "query", { sql: "SELECT * FROM users" });
      expect(outcome.type).toBe("result");
      expect((outcome as { type: "result"; result: ToolResult }).result.structuredContent!.truncated).toBe(true);
    });

    it("returns task failure for statement failure", async () => {
      const provider = new MockProvider({
        terminalStatus: { status: "FAILED", error: "Statement timed out" },
      });
      const { client } = await setup(provider);
      const outcome = await callTaskTool(client, "query", { sql: "SELECT * FROM users" });
      expect(outcome.type).toBe("error");
    });

    it("returns task failure for submit error", async () => {
      const provider = new MockProvider({
        submitError: new Error("Unable to reach Redshift Data API"),
      });
      const { client } = await setup(provider);
      const outcome = await callTaskTool(client, "query", { sql: "SELECT * FROM users" });
      expect(outcome.type).toBe("error");
    });
  });

  describe("task lifecycle", () => {
    it("can retrieve task status via tasks/get", async () => {
      const { client } = await setup();

      const stream = client.experimental.tasks.callToolStream(
        { name: "query", arguments: { sql: "SELECT 1" } },
        CallToolResultSchema,
      );

      let taskId: string | undefined;
      for await (const message of stream) {
        if (message.type === "taskCreated") {
          taskId = message.task.taskId;
          const taskStatus = await client.experimental.tasks.getTask(taskId);
          expect(taskStatus).toBeDefined();
          expect(taskStatus.taskId).toBe(taskId);
        }
        if (message.type === "result") {
          break;
        }
      }

      expect(taskId).toBeDefined();
    });

    it("can retrieve task result via tasks/result after completion", async () => {
      const { client } = await setup();

      const stream = client.experimental.tasks.callToolStream(
        { name: "query", arguments: { sql: "SELECT 1" } },
        CallToolResultSchema,
      );

      let taskId: string | undefined;
      for await (const message of stream) {
        if (message.type === "taskCreated") {
          taskId = message.task.taskId;
        }
      }

      expect(taskId).toBeDefined();

      const result = await client.experimental.tasks.getTaskResult(taskId!, CallToolResultSchema);
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.rowCount).toBe(3);
    });

    it("can list tasks", async () => {
      const { client } = await setup();
      await callTaskTool(client, "query", { sql: "SELECT 1" });

      const listing = await client.experimental.tasks.listTasks();
      expect(listing.tasks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("tool listing", () => {
    it("lists all four tools", async () => {
      const { client } = await setup();
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name).sort();
      expect(names).toEqual(["describe_table", "explain", "list_tables", "query"]);
    });
  });
});
