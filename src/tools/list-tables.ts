import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RedshiftProvider, QueryResult } from "../redshift.js";
import { Config } from "../config.js";
import { submitAndPoll } from "../tasks.js";

function listTablesSQL(): string {
  return `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('business_analytics')
    ORDER BY table_schema, table_name
  `;
}

function formatTableList(result: QueryResult): Record<string, unknown> {
  return {
    tables: result.rows.map((row) => ({
      schema: row.table_schema as string,
      name: row.table_name as string,
    })),
  };
}

export function registerListTablesTool(server: McpServer, provider: RedshiftProvider, config: Config) {
  server.registerTool(
    "list_tables",
    {
      description: "List all available tables in the database.",
      outputSchema: {
        tables: z.array(z.object({ schema: z.string(), name: z.string() })),
      },
    },
    async () => {
      try {
        const result = await submitAndPoll(provider, config, listTablesSQL());
        const structured = formatTableList(result);
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
