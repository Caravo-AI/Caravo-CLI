#!/usr/bin/env node

import { resolveAuth } from "./lib/auth.js";
import { log } from "./lib/output.js";

const HELP = `caravo — Caravo CLI

Usage:
  caravo <command> [args] [options]

Commands:
  search [query]             Search tools by keyword
  tags                       List all tags/categories
  providers                  List all providers
  info <tool-id>             Get tool details + reviews
  exec <tool-id> -d <json>   Execute a tool
  dry-run <tool-id> -d <json> Preview execution cost
  review <exec-id> --rating <1-5> --comment <text>
                             Submit a review
  upvote <review-id> --exec <exec-id>
                             Upvote a review
  fav list|add|rm [tool-id]  Manage favorites (API key required)
  requests                   List tool requests
  request --title <t> --desc <d>
                             Submit a tool request
  request-upvote <req-id>    Upvote a tool request
  wallet                     Show wallet + balance info
  fetch [METHOD] <url>       Raw x402 HTTP request

Options:
  --tag <name|slug>   Filter by tag name or slug (search)
  --provider <name|slug> Filter by provider name or slug (search)
  --page <n>          Page number
  --per-page <n>      Results per page
  --status <s>        Filter requests by status (open|fulfilled|closed)
  --rating <1-5>      Review rating
  --comment <text>    Review comment
  --exec <id>         Execution ID (for upvote/request)
  --title <text>      Tool request title
  --desc <text>       Tool request description
  --use-case <text>   Tool request use case
  --agent-id <id>     Agent identifier
  --api-key <key>     API key (default: $CARAVO_API_KEY)
  --base-url <url>    API base URL
  --compact           Compact JSON output (single line)
  -d, --data <json>   Request body (JSON string)
  -H, --header <k:v>  Additional header (fetch command, repeatable)
  -o, --output <file> Write response to file (fetch command)
  -w, --wallet <path> Custom wallet path
  -h, --help          Show this help
  -v, --version       Show version
`;

interface ParsedArgs {
  subcommand: string;
  positional: string[];
  data: string | null;
  headers: Record<string, string>;
  output: string | null;
  walletPath: string | undefined;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  compact: boolean;
  dryRun: boolean;
  help: boolean;
  version: boolean;
  tag: string | undefined;
  provider: string | undefined;
  page: string | undefined;
  perPage: string | undefined;
  rating: string | undefined;
  comment: string | undefined;
  exec: string | undefined;
  title: string | undefined;
  desc: string | undefined;
  useCase: string | undefined;
  status: string | undefined;
  agentId: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    subcommand: "",
    positional: [],
    data: null,
    headers: {},
    output: null,
    walletPath: undefined,
    apiKey: undefined,
    baseUrl: undefined,
    compact: false,
    dryRun: false,
    help: false,
    version: false,
    tag: undefined,
    provider: undefined,
    page: undefined,
    perPage: undefined,
    rating: undefined,
    comment: undefined,
    exec: undefined,
    title: undefined,
    desc: undefined,
    useCase: undefined,
    status: undefined,
    agentId: undefined,
  };

  let i = 0;
  // First non-flag arg is the subcommand
  while (i < argv.length && argv[i].startsWith("-")) {
    // Handle global flags before subcommand
    if (argv[i] === "-h" || argv[i] === "--help") {
      args.help = true;
    } else if (argv[i] === "-v" || argv[i] === "--version") {
      args.version = true;
    }
    i++;
  }

  if (i < argv.length && !argv[i].startsWith("-")) {
    args.subcommand = argv[i];
    i++;
  }

  // Parse remaining args
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "-v" || arg === "--version") {
      args.version = true;
    } else if (arg === "--compact") {
      args.compact = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "-d" || arg === "--data") {
      args.data = argv[++i];
    } else if (arg === "-H" || arg === "--header") {
      const val = argv[++i];
      if (val) {
        const colonIdx = val.indexOf(":");
        if (colonIdx > 0) {
          args.headers[val.slice(0, colonIdx).trim()] = val.slice(colonIdx + 1).trim();
        }
      }
    } else if (arg === "-o" || arg === "--output") {
      args.output = argv[++i];
    } else if (arg === "-w" || arg === "--wallet") {
      args.walletPath = argv[++i];
    } else if (arg === "--api-key") {
      args.apiKey = argv[++i];
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++i];
    } else if (arg === "--tag") {
      args.tag = argv[++i];
    } else if (arg === "--provider") {
      args.provider = argv[++i];
    } else if (arg === "--page") {
      args.page = argv[++i];
    } else if (arg === "--per-page") {
      args.perPage = argv[++i];
    } else if (arg === "--rating") {
      args.rating = argv[++i];
    } else if (arg === "--comment") {
      args.comment = argv[++i];
    } else if (arg === "--exec") {
      args.exec = argv[++i];
    } else if (arg === "--title") {
      args.title = argv[++i];
    } else if (arg === "--desc") {
      args.desc = argv[++i];
    } else if (arg === "--use-case") {
      args.useCase = argv[++i];
    } else if (arg === "--status") {
      args.status = argv[++i];
    } else if (arg === "--agent-id") {
      args.agentId = argv[++i];
    } else if (!arg.startsWith("-")) {
      args.positional.push(arg);
    } else {
      // Unknown flag
      process.stderr.write(`[caravo] unknown option: ${arg}\n`);
      process.exit(1);
    }

    i++;
  }

  return args;
}

const VERSION = "0.2.1";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    process.stdout.write(`caravo ${VERSION}\n`);
    process.exit(0);
  }

  if (args.help || !args.subcommand) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const auth = resolveAuth({
    apiKey: args.apiKey,
    baseUrl: args.baseUrl,
    walletPath: args.walletPath,
  });

  switch (args.subcommand) {
    case "search": {
      const { runSearch } = await import("./commands/search.js");
      // Join all positional args so "caravo search image generation" works like "image generation"
      const query = args.positional.length > 0 ? args.positional.join(" ") : undefined;
      await runSearch(query, {
        tag: args.tag,
        provider: args.provider,
        page: args.page,
        perPage: args.perPage,
      }, auth, args.compact);
      break;
    }
    case "tags": {
      const { runTags } = await import("./commands/search.js");
      await runTags(auth, args.compact);
      break;
    }
    case "providers": {
      const { runProviders } = await import("./commands/search.js");
      await runProviders(auth, args.compact);
      break;
    }
    case "info": {
      const { run } = await import("./commands/info.js");
      await run(args.positional[0], auth, args.compact);
      break;
    }
    case "exec": {
      if (args.dryRun) {
        const { runDryRun } = await import("./commands/exec.js");
        await runDryRun(args.positional[0], args.data, auth, args.compact);
      } else {
        const { run } = await import("./commands/exec.js");
        await run(args.positional[0], args.data, auth, args.compact);
      }
      break;
    }
    case "dry-run": {
      const { runDryRun } = await import("./commands/exec.js");
      await runDryRun(args.positional[0], args.data, auth, args.compact);
      break;
    }
    case "review": {
      const { runReview } = await import("./commands/review.js");
      await runReview(args.positional[0], {
        rating: args.rating,
        comment: args.comment,
        agentId: args.agentId,
      }, auth, args.compact);
      break;
    }
    case "upvote": {
      const { runUpvote } = await import("./commands/review.js");
      await runUpvote(args.positional[0], args.exec, auth, args.compact);
      break;
    }
    case "fav": {
      const { run } = await import("./commands/fav.js");
      await run(args.positional[0], args.positional[1], auth, args.compact);
      break;
    }
    case "requests": {
      const { runList } = await import("./commands/requests.js");
      await runList({
        status: args.status,
        page: args.page,
        perPage: args.perPage,
      }, auth, args.compact);
      break;
    }
    case "request": {
      const { runRequest } = await import("./commands/requests.js");
      await runRequest({
        title: args.title,
        desc: args.desc,
        useCase: args.useCase,
        exec: args.exec,
        agentId: args.agentId,
      }, auth, args.compact);
      break;
    }
    case "request-upvote": {
      const { runUpvote: runReqUpvote } = await import("./commands/requests.js");
      await runReqUpvote(args.positional[0], args.exec, auth, args.compact);
      break;
    }
    case "wallet": {
      const { run } = await import("./commands/wallet-cmd.js");
      await run(auth, args.compact);
      break;
    }
    case "fetch": {
      const { run } = await import("./commands/fetch.js");
      await run(args.positional, {
        data: args.data,
        headers: args.headers,
        output: args.output,
        dryRun: args.dryRun,
        compact: args.compact,
      }, auth);
      break;
    }
    default:
      log(`Unknown command: ${args.subcommand}`);
      process.stdout.write(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  log(`error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
