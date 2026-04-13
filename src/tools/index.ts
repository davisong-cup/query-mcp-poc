import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RedshiftProvider } from "../redshift.js";
import { Config } from "../config.js";
import { registerQueryTool } from "./query.js";
import { registerListTablesTool } from "./list-tables.js";
import { registerDescribeTableTool } from "./describe-table.js";
import { registerExplainTool } from "./explain.js";

export function registerAllTools(server: McpServer, provider: RedshiftProvider, config: Config) {
  registerQueryTool(server, provider, config);
  registerListTablesTool(server, provider, config);
  registerDescribeTableTool(server, provider, config);
  registerExplainTool(server, provider, config);
}
