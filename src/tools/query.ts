import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RedshiftProvider, QueryResult } from "../redshift.js";
import { Config } from "../config.js";
import { submitAndPoll } from "../tasks.js";

function formatQueryResult(result: QueryResult): Record<string, unknown> {
  return {
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    truncated: result.truncated,
  };
}

export function registerQueryTool(server: McpServer, provider: RedshiftProvider, config: Config) {
  server.registerTool(
    "query",
    {
      description: "Execute a read-only SQL query against the database and return results as JSON.",
      inputSchema: {
        sql: z.string().describe("The SQL query to execute"),
      },
      outputSchema: {
        columns: z.array(z.object({ name: z.string(), type: z.string() })),
        rows: z.array(z.record(z.string(), z.unknown())),
        rowCount: z.number(),
        truncated: z.boolean(),
      }
    },
    async ({ sql }) => {
      try {
        const result = await submitAndPoll(provider, config, sql);
        const structured = formatQueryResult(result);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    },
  );
}
