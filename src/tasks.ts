import { StatusString } from "@aws-sdk/client-redshift-data";
import { RedshiftProvider, QueryResult } from "./redshift.js";
import { Config } from "./config.js";

const MAX_POLL_MS = 10_000;

export async function submitAndPoll(
  provider: RedshiftProvider,
  config: Config,
  sql: string,
): Promise<QueryResult> {
  const statementId = await provider.submitQuery(sql);
  return await pollUntilDone(provider, config, statementId);
}

async function pollUntilDone(
  provider: RedshiftProvider,
  config: Config,
  statementId: string,
): Promise<QueryResult> {
  const deadline = Date.now() + config.queryTimeoutSeconds * 1000;
  let pollMs = 500;

  while (Date.now() < deadline) {
    await sleep(pollMs);

    const state = await provider.getStatementStatus(statementId);

    if (state.status === StatusString.FINISHED) {
      return await provider.fetchResults(statementId, config.maxRowLimit);
    }

    if (state.status === StatusString.FAILED) {
      throw new Error(`Database error: ${state.error ?? "Unknown"}`);
    }

    if (state.status === StatusString.ABORTED) {
      throw new Error("Query was aborted");
    }

    pollMs = Math.min(pollMs * 2, MAX_POLL_MS);
  }

  await provider.cancelStatement(statementId);
  throw new Error(`Query timed out after ${config.queryTimeoutSeconds} seconds`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
