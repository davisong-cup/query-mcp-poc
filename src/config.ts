import { cleanEnv, str, num } from "envalid";

export interface RedshiftConfig {
  awsRegion: string;
  clusterId: string;
  database: string;
  dbUser: string;
}

export interface Config {
  queryTimeoutSeconds: number;
  maxRowLimit: number;
  redshift: RedshiftConfig;
}

export function loadConfig(): Config {
  const env = cleanEnv(process.env, {
    QUERY_TIMEOUT_SECONDS: num({ default: 90 }),
    MAX_ROW_LIMIT: num({ default: 500 }),
    AWS_REGION: str(),
    REDSHIFT_CLUSTER_ID: str(),
    REDSHIFT_DATABASE: str(),
    REDSHIFT_DB_USER: str()
  });

  return {
    queryTimeoutSeconds: env.QUERY_TIMEOUT_SECONDS,
    maxRowLimit: env.MAX_ROW_LIMIT,
    redshift: {
      awsRegion: env.AWS_REGION,
      clusterId: env.REDSHIFT_CLUSTER_ID,
      database: env.REDSHIFT_DATABASE,
      dbUser: env.REDSHIFT_DB_USER
    },
  };
}
