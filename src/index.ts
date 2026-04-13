import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { RedshiftProvider } from "./redshift.js";
import { createMcpServer } from "./server.js";

const config = loadConfig();
const provider = new RedshiftProvider(config.redshift);
const server = createMcpServer(config, provider);
const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", async () => {
  await provider.disconnect();
  process.exit(0);
});
