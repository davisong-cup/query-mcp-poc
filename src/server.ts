import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RedshiftProvider } from "./redshift.js";
import { Config } from "./config.js";
import { registerAllTools } from "./tools/index.js";

export function createMcpServer(config: Config, provider: RedshiftProvider): McpServer {
  const server = new McpServer({
    name: "query-mcp",
    version: "0.1.0",
  },
    {
      capabilities: {
        logging: {},
        tools: {
          listChanged: false,
        },
      },
    },
  );

  registerAllTools(server, provider, config);

  return server;
}
