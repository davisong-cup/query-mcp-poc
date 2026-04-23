# query-mcp

A **Model Context Protocol (MCP)** server that lets AI assistants (like Claude) safely run read-only SQL queries against an **Amazon Redshift** database. Once installed, you can ask your AI assistant questions like *"How many orders were placed last week?"* or *"What columns are in the users table?"* and it will run the query for you and summarize the results.

This guide walks you through every step — even if you've never used a terminal, installed Node.js, or configured AWS before. Take it one section at a time.

---

## Table of contents

1. [What you'll need before starting](#1-what-youll-need-before-starting)
2. [Install the required software](#2-install-the-required-software)
3. [Get your AWS credentials set up](#3-get-your-aws-credentials-set-up)
4. [Get the code onto your computer](#4-get-the-code-onto-your-computer)
5. [Install the project's dependencies](#5-install-the-projects-dependencies)
6. [Configure the server (the `.env` file)](#6-configure-the-server-the-env-file)
7. [Build the server](#7-build-the-server)
8. [Connect the server to Claude Desktop](#8-connect-the-server-to-claude-desktop)
9. [Verify it works](#9-verify-it-works)
10. [Available tools](#10-available-tools)
11. [Troubleshooting](#11-troubleshooting)
12. [Updating the server later](#12-updating-the-server-later)

---

## 1. What you'll need before starting

Before you begin, make sure you have:

- A **Mac or Linux computer** (these instructions are written for macOS; they mostly apply to Linux too). Windows users can follow similar steps but may need to adapt commands.
- An **AWS account** that contains the Redshift cluster you want to query.
- From your AWS administrator or DevOps team, the following four pieces of information. Write them down somewhere safe:
  1. **AWS Region** — e.g. `us-east-1`, `us-west-2`
  2. **Redshift Cluster ID** — the identifier of the cluster (not the full URL)
  3. **Redshift Database name** — e.g. `analytics`, `warehouse`
  4. **Redshift Database user** — the username to connect as
- Permission in AWS to call the **Redshift Data API** (`redshift-data:ExecuteStatement`, `redshift-data:DescribeStatement`, `redshift-data:GetStatementResult`, `redshift-data:CancelStatement`) against your cluster. If unsure, ask your administrator.
- **Claude Desktop** installed (or another MCP-compatible AI client). Download it from <https://claude.ai/download>.

> If you don't yet have the AWS information, pause here and request it from whoever manages your company's AWS account.

---

## 2. Install the required software

You'll need two programs: **Node.js** (which runs the server) and **Git** (which downloads the code). Most Macs already have Git.

### 2a. Open the Terminal

On macOS, press `Cmd + Space`, type `Terminal`, and press Enter. A window with a command prompt will appear. Every command in this guide gets typed into that window, followed by Enter.

### 2b. Install Homebrew (if you don't have it)

Homebrew is the easiest way to install developer tools on a Mac. Check if it's already installed:

```bash
brew --version
```

If you see a version number (e.g. `Homebrew 4.x.x`), skip to the next step. If you see `command not found`, install it by copy-pasting this into Terminal and pressing Enter:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

When it finishes, it will print a few lines starting with `==> Next steps:`. Copy-paste and run each of those lines so Homebrew is added to your shell's path. Close and reopen Terminal, then confirm:

```bash
brew --version
```

### 2c. Install Node.js

This project requires Node.js version 20 or newer.

```bash
brew install node@20
```

After it finishes, verify:

```bash
node --version
```

You should see something like `v20.x.x`. If not, follow the instructions Homebrew printed to link `node@20` onto your path.

### 2d. Install Git (if you don't have it)

```bash
git --version
```

If you see a version number, you're set. Otherwise:

```bash
brew install git
```

### 2e. Install the AWS CLI

The AWS CLI is used to set up your credentials.

```bash
brew install awscli
aws --version
```

---

## 3. Get your AWS credentials set up

The server connects to Redshift using your AWS credentials. There are two common ways to set these up — ask your administrator which one your company uses, then follow that section.

### Option A: Access keys (simpler, but less common at larger companies)

Your admin will give you two strings: an **Access Key ID** and a **Secret Access Key**. Then run:

```bash
aws configure
```

You'll be prompted for:

- `AWS Access Key ID` — paste the access key
- `AWS Secret Access Key` — paste the secret key
- `Default region name` — e.g. `us-east-1`
- `Default output format` — press Enter to accept `json`

Test it:

```bash
aws sts get-caller-identity
```

You should see JSON with your AWS account number. If you see an error, your keys are wrong or expired — go back to your admin.

### Option B: AWS SSO / IAM Identity Center (most common at companies)

Your admin will give you a **start URL** (something like `https://mycompany.awsapps.com/start`) and an **SSO region**. Run:

```bash
aws configure sso
```

Answer the prompts:

- `SSO session name` — pick any name, e.g. `work`
- `SSO start URL` — paste the URL from your admin
- `SSO region` — e.g. `us-east-1`
- `SSO registration scopes` — press Enter to accept the default
- Press Enter when prompted — a browser window opens. Sign in and click **Allow access**.
- Back in Terminal, pick your AWS account and role from the list.
- `CLI default client Region` — the region your Redshift cluster is in
- `CLI default output format` — press Enter to accept `json`
- `CLI profile name` — pick a short memorable name, e.g. `redshift`

Test it:

```bash
aws sso login --profile redshift
aws sts get-caller-identity --profile redshift
```

**Important:** if you use SSO, you'll need to re-run `aws sso login --profile redshift` every few hours when your session expires. If the MCP server starts failing with credential errors later, this is usually why.

If you use an SSO profile, you'll also need to tell the server to use it. You'll do this in step 6 by adding an `AWS_PROFILE` environment variable.

---

## 4. Get the code onto your computer

Pick a folder to store the project in. A common choice is a `repos` folder inside your home directory:

```bash
mkdir -p ~/repos
cd ~/repos
```

Then clone (download) this project. **Replace the URL below with the real git URL for this repo** — ask whoever shared this project with you:

```bash
git clone <REPO_URL_HERE> query-mcp
cd query-mcp
```

After this, you should be *inside* the `query-mcp` folder. Confirm:

```bash
pwd
```

It should end with `/query-mcp`.

---

## 5. Install the project's dependencies

This downloads all the third-party libraries the server uses. From inside the `query-mcp` folder:

```bash
npm install
```

You'll see a lot of output. It may take a minute or two. If it finishes without any lines starting with `error`, you're good. A few `warn` messages are normal and safe to ignore.

---

## 6. Configure the server (the `.env` file)

The server reads its settings from a file called `.env` in the project folder. A template called `.env.example` is already provided.

Copy the template:

```bash
cp .env.example .env
```

Now open `.env` in a text editor. If you're not sure which editor to use, open it from the Finder (right-click → Open With → TextEdit) or run:

```bash
open -e .env
```

Fill in the values. Your file should look like this when you're done:

```ini
AWS_REGION=us-east-1
AWS_PROFILE=redshift
REDSHIFT_CLUSTER_ID=my-analytics-cluster
REDSHIFT_DATABASE=analytics
REDSHIFT_DB_USER=readonly_user
QUERY_TIMEOUT_SECONDS=30
MAX_ROW_LIMIT=100
```

Field-by-field:

| Variable | What to put here |
| --- | --- |
| `AWS_REGION` | The region your Redshift cluster lives in (e.g. `us-east-1`). |
| `AWS_PROFILE` | Only needed if you used AWS SSO in step 3b. Put the profile name you chose (e.g. `redshift`). If you used access keys (step 3a), leave this blank. |
| `REDSHIFT_CLUSTER_ID` | The cluster identifier, from your admin. |
| `REDSHIFT_DATABASE` | The database name inside the cluster. |
| `REDSHIFT_DB_USER` | The database user to connect as. |
| `QUERY_TIMEOUT_SECONDS` | How long a single query is allowed to run before it's cancelled. `30` is a good starting value. |
| `MAX_ROW_LIMIT` | The most rows a single query will return. `100` is a safe default. |

Save and close the file.

> **Security tip:** The `.env` file contains sensitive information. Never commit it to git, share it over chat, or email it. The project's `.gitignore` should already exclude it.

---

## 7. Build the server

Build turns the TypeScript source code into plain JavaScript that Node can run:

```bash
npm run build
```

If it completes with no errors, a new `dist/` folder will appear. That's the compiled server.

Do a quick sanity check — try starting the server manually:

```bash
npm start
```

If your `.env` is set up correctly, the command will appear to hang (that's normal — the server is waiting for an MCP client to connect). Press `Ctrl + C` to stop it. If instead it prints an error, see [Troubleshooting](#11-troubleshooting).

---

## 8. Connect the server to Claude Desktop

Now we'll tell Claude Desktop how to start the server.

### 8a. Find the path to your project

In Terminal, from inside the `query-mcp` folder, run:

```bash
pwd
```

Copy the full path it prints — for example, `/Users/yourname/repos/query-mcp`. You'll use this in the config.

### 8b. Open the Claude Desktop config file

On macOS:

```bash
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

If the file doesn't exist yet, create it first:

```bash
mkdir -p ~/Library/Application\ Support/Claude
touch ~/Library/Application\ Support/Claude/claude_desktop_config.json
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 8c. Add this server to the config

If the file is empty, paste in the following. **Replace `/FULL/PATH/TO/query-mcp` with the path you copied in step 8a.**

```json
{
  "mcpServers": {
    "query-mcp": {
      "command": "node",
      "args": ["/FULL/PATH/TO/query-mcp/dist/index.js"]
    }
  }
}
```

If the file already has an `mcpServers` section with other servers inside it, just add the `"query-mcp": { ... }` entry alongside the others, separated by a comma.

Save and close the file.

### 8d. Restart Claude Desktop

Fully quit Claude Desktop (`Cmd + Q` — closing the window isn't enough) and open it again. The server will be loaded automatically on startup.

---

## 9. Verify it works

Open a new chat in Claude Desktop. Look for a small tools/plug icon near the chat input — click it. You should see **query-mcp** listed with 4 tools: `query`, `list_tables`, `describe_table`, `explain`.

Ask Claude something simple like:

> *List the tables available in the database.*

Claude will call the `list_tables` tool and show you the results. Congratulations — the server is working!

Try a few more:

- *What columns are in the `users` table?*
- *How many rows are in the `orders` table?*
- *Show me the 10 most recent orders.*

---

## 10. Available tools

Once connected, Claude can call these tools on your behalf. You don't need to invoke them directly — just ask natural-language questions.

| Tool | What it does |
| --- | --- |
| `query` | Runs a read-only SQL query and returns the result rows. |
| `list_tables` | Lists the tables available in the configured schemas. |
| `describe_table` | Shows the columns (name, type, nullability) of a specific table. |
| `explain` | Returns Redshift's query execution plan — useful for checking query performance. |

Behavioral notes:

- Results are automatically capped at `MAX_ROW_LIMIT` rows. If truncation happens, the response says so.
- Queries that run longer than `QUERY_TIMEOUT_SECONDS` are cancelled.
- The server itself doesn't enforce "read-only" — that's governed by the permissions of your `REDSHIFT_DB_USER`. Use a user that only has `SELECT` privileges if you want a hard guarantee.

---

## 11. Troubleshooting

### "command not found: node" / "command not found: npm"

Node.js isn't installed or isn't on your PATH. Re-run step 2c, close and reopen Terminal, then try again.

### "command not found: aws"

The AWS CLI isn't installed. Re-run step 2e.

### The server starts in Terminal but errors as soon as Claude tries to use it

Most often an AWS credentials issue. Try:

```bash
aws sts get-caller-identity --profile <your-profile-name>
```

If that fails, your credentials have expired. For SSO, run `aws sso login --profile <your-profile-name>` again. Then fully quit and reopen Claude Desktop.

### "Missing environment variable" errors on startup

Open `.env` and confirm every variable listed in step 6 has a value (except `AWS_PROFILE`, which can be empty if you used access keys). No quotes needed around the values.

### "AccessDenied" / "not authorized to perform redshift-data:..."

Your IAM user or role doesn't have permission to use the Redshift Data API. Share the exact error message with your AWS admin and ask them to grant the four permissions listed in [section 1](#1-what-youll-need-before-starting).

### "ClusterNotFound" or "DatabaseNotFound"

Double-check `REDSHIFT_CLUSTER_ID`, `REDSHIFT_DATABASE`, and `AWS_REGION` in your `.env` file. A typo in any of these will cause this error. The cluster ID is the short identifier, not the full endpoint URL.

### Claude Desktop doesn't show the query-mcp tools

1. Confirm you fully quit Claude Desktop (`Cmd + Q`), not just closed the window.
2. Re-open the config file from step 8b and check for JSON syntax errors — a missing comma or quote will silently disable the server. You can paste the contents into <https://jsonlint.com> to validate.
3. Confirm the path in `args` points at the real `dist/index.js` file. Run `ls /FULL/PATH/TO/query-mcp/dist/index.js` in Terminal — if it says "No such file", re-run `npm run build`.

### Queries always time out

Increase `QUERY_TIMEOUT_SECONDS` in `.env` (e.g. to `120`), rebuild with `npm run build`, and restart Claude Desktop. If a *specific* query is slow, ask Claude to run the `explain` tool to see why.

### "Too many rows" or results cut off

The server caps output at `MAX_ROW_LIMIT` rows to keep responses manageable. Either raise the limit in `.env` (rebuild + restart afterwards) or ask Claude to refine the query with `WHERE`/`LIMIT` clauses.

---

## 12. Updating the server later

When new changes are released to this project, update your local copy like this:

```bash
cd ~/repos/query-mcp
git pull
npm install
npm run build
```

Then fully quit and reopen Claude Desktop. Your existing `.env` and Claude Desktop config don't need any changes.
