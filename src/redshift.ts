import {
  RedshiftDataClient,
  ExecuteStatementCommand,
  DescribeStatementCommand,
  GetStatementResultCommand,
  CancelStatementCommand,
  type Field,
  type GetStatementResultCommandOutput,
  type StatusString,
} from "@aws-sdk/client-redshift-data";
import { RedshiftConfig } from "./config.js";

export interface ColumnMetadata {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: ColumnMetadata[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface StatementState {
  status: StatusString;
  error?: string;
}

function extractFieldValue(field: Field): unknown {
  if ("isNull" in field && field.isNull) return null;
  if ("stringValue" in field) return field.stringValue;
  if ("longValue" in field) return field.longValue;
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("blobValue" in field) return field.blobValue;
  return null;
}

export class RedshiftProvider {
  private readonly client: RedshiftDataClient;
  private readonly clusterId: string;
  private readonly database: string;
  private readonly dbUser: string;

  constructor(config: RedshiftConfig) {
    this.client = new RedshiftDataClient({ region: config.awsRegion });
    this.clusterId = config.clusterId;
    this.database = config.database;
    this.dbUser = config.dbUser;
  }

  // Idempotent — RedshiftDataClient.destroy() may throw if called twice
  // depending on SDK version. Shutdown hooks can invoke this multiple times.
  async disconnect(): Promise<void> {
    try {
      this.client.destroy();
    } catch {
      // Already destroyed
    }
  }

  async submitQuery(sql: string): Promise<string> {
    return this.executeStatement(sql);
  }

  async getStatementStatus(statementId: string): Promise<StatementState> {
    const { Status, Error: errorMessage } = await this.client.send(
      new DescribeStatementCommand({ Id: statementId }),
    );
    return {
      status: Status ?? "SUBMITTED" as StatusString,
      error: errorMessage,
    };
  }

  async cancelStatement(statementId: string): Promise<void> {
    try {
      await this.client.send(new CancelStatementCommand({ Id: statementId }));
    } catch {
      // Best effort — statement may have already completed or been cancelled
    }
  }

  async fetchResults(statementId: string, maxRows: number): Promise<QueryResult> {
    // First page gives us column metadata and total row count
    const firstPage = await this.client.send(new GetStatementResultCommand({ Id: statementId }));
    const columns = (firstPage.ColumnMetadata ?? []).map((col) => ({
      name: col.name || "unknown",
      type: col.typeName || "unknown",
    }));

    // TotalNumRows tells us the full result set size before client-side limiting,
    // so we can detect truncation without over-fetching.
    const totalNumRows = firstPage.TotalNumRows ?? 0;
    const rows = this.parseRecords(firstPage.Records, columns, maxRows);
    let nextToken = firstPage.NextToken;

    while (nextToken && rows.length < maxRows) {
      const page = await this.client.send(new GetStatementResultCommand({ Id: statementId, NextToken: nextToken }));
      rows.push(...this.parseRecords(page.Records, columns, maxRows - rows.length));
      nextToken = page.NextToken;
    }

    return {
      columns,
      rows,
      rowCount: totalNumRows,
      truncated: totalNumRows > maxRows,
    };
  }

  private async executeStatement(sql: string): Promise<string> {
    const response = await this.client.send(new ExecuteStatementCommand({
      ClusterIdentifier: this.clusterId,
      Database: this.database,
      DbUser: this.dbUser,
      Sql: sql,
    }));

    if (!response.Id) {
      throw new Error("No statement ID returned");
    }
    return response.Id;
  }

  private parseRecords(records: GetStatementResultCommandOutput["Records"], columns: ColumnMetadata[], limit: number): Record<string, unknown>[] {
    if (!records) return [];

    return records.slice(0, limit).map((record) => {
      const row: Record<string, unknown> = {};
      columns.forEach((column, i) => {
        const field = record[i];
        if (field) row[column.name] = extractFieldValue(field);
      });
      return row;
    });
  }
}
