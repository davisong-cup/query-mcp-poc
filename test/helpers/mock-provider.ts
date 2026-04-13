import {
  RedshiftProvider,
  QueryResult,
  StatementState,
} from "../../src/redshift.js";

export interface MockProviderOptions {
  submitError?: Error;
  terminalStatus?: StatementState;
  results?: QueryResult;
}

const DEFAULT_RESULTS: QueryResult = {
  columns: [
    { name: "id", type: "integer" },
    { name: "name", type: "varchar" },
    { name: "email", type: "varchar" },
  ],
  rows: [
    { id: 1, name: "Alice", email: "alice@example.com" },
    { id: 2, name: "Bob", email: "bob@example.com" },
    { id: 3, name: "Charlie", email: "charlie@example.com" },
  ],
  rowCount: 3,
  truncated: false,
};

export class MockProvider implements Pick<RedshiftProvider, "submitQuery" | "getStatementStatus" | "fetchResults" | "cancelStatement" | "disconnect"> {
  private readonly submitError?: Error;
  private readonly terminalStatus: StatementState;
  private readonly results: QueryResult;

  constructor(opts: MockProviderOptions = {}) {
    this.submitError = opts.submitError;
    this.terminalStatus = opts.terminalStatus ?? { status: "FINISHED" };
    this.results = opts.results ?? DEFAULT_RESULTS;
  }

  async submitQuery(_sql: string): Promise<string> {
    if (this.submitError) throw this.submitError;
    return "mock-statement-id";
  }

  async getStatementStatus(_statementId: string): Promise<StatementState> {
    return this.terminalStatus;
  }

  async fetchResults(_statementId: string, _maxRows: number): Promise<QueryResult> {
    return this.results;
  }

  async cancelStatement(_statementId: string): Promise<void> {}

  async disconnect(): Promise<void> {}
}
