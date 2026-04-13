import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RedshiftProvider, QueryResult } from "../redshift.js";
import { Config } from "../config.js";
import { submitAndPoll } from "../tasks.js";

function describeTableSQL(tableName: string): string {
  const [schema, table] = tableName.includes(".")
    ? tableName.split(".", 2)
    : ["business_analytics", tableName];

  return `
    SELECT column_name, data_type, is_nullable, column_default, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = '${schema}' AND table_name = '${table}'
    ORDER BY ordinal_position
  `;
}

function formatColumns(result: QueryResult): Record<string, unknown> {
  return {
    columns: result.rows.map((row) => ({
      ordinalPosition: row.ordinal_position as number,
      name: row.column_name as string,
      type: row.data_type as string,
      nullable: (row.is_nullable as string) === "YES",
      defaultValue: (row.column_default as string) || null,
    })),
  };
}

export function registerDescribeTableTool(server: McpServer, provider: RedshiftProvider, config: Config) {
  server.registerTool(
    "describe_table",
    {
      description: "Describe the columns of a specific table.",
      inputSchema: {
        table_name: z.string().describe("The fully qualified table name (e.g. analytics.users)"),
      },
      outputSchema: {
        columns: z.array(z.object({ ordinalPosition: z.number(), name: z.string(), type: z.string(), nullable: z.boolean(), defaultValue: z.unknown() })),
      },
    },
    async ({ table_name }) => {
      try {
        const result = await submitAndPoll(provider, config, describeTableSQL(table_name));
        const structured = formatColumns(result);
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
