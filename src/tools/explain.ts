import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RedshiftProvider, QueryResult } from "../redshift.js";
import { Config } from "../config.js";
import { submitAndPoll } from "../tasks.js";

function explainSQL(sql: string): string {
  return `EXPLAIN ${sql}`;
}

function formatExplainPlan(result: QueryResult): Record<string, unknown> {
  return {
    steps: result.rows.map((row) => Object.values(row)[0] as string),
  };
}

export function registerExplainTool(server: McpServer, provider: RedshiftProvider, config: Config) {
  server.registerTool(
    "explain",
    {
      description: "Show the query execution plan (EXPLAIN) for a SQL query.",
      inputSchema: {
        sql: z.string().describe("The SQL query to explain"),
      },
      outputSchema: {
        steps: z.array(z.string()).describe("Lines of the query execution plan"),
      },
    },
    async ({ sql }) => {
      try {
        const result = await submitAndPoll(provider, config, explainSQL(sql));
        const structured = formatExplainPlan(result);
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
