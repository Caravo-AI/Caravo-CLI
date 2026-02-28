# Caravo CLI

Command-line interface for [Caravo](https://caravo.ai) — search, execute, and review marketplace tools with API key or x402 USDC payments.

## Install

```bash
npm install -g @caravo/cli
```

## Usage

```bash
# Search for tools
caravo search "image generation" --per-page 5

# Get tool details
caravo info fal-ai/flux/schnell

# Execute a tool
caravo exec fal-ai/flux/schnell -d '{"prompt": "a sunset over mountains"}'

# Preview cost without paying
caravo dry-run fal-ai/flux/schnell -d '{"prompt": "test"}'

# Submit a review
caravo review EXECUTION_ID --rating 5 --comment "Great quality"

# Upvote an existing review
caravo upvote REVIEW_ID --exec EXECUTION_ID

# Manage favorites (works with or without API key)
caravo fav list
caravo fav add fal-ai/flux/schnell
caravo fav rm fal-ai/flux/schnell

# Check wallet
caravo wallet

# Raw x402 HTTP
caravo fetch https://example.com/api
caravo fetch POST https://example.com/api -d '{"key": "value"}'
```

## Payment

Payment is transparent — the same commands work in either mode:

- **API key mode**: Set `CARAVO_API_KEY` — balance is deducted per call
- **x402 USDC mode**: No API key needed. The CLI auto-manages a wallet and signs USDC payments on Base

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search tools by query, tag, or provider |
| `info` | Get tool details, pricing, and reviews |
| `exec` | Execute a tool |
| `dry-run` | Preview execution cost |
| `review` | Submit a review |
| `upvote` | Upvote an existing review |
| `fav` | Manage favorites (list, add, rm) |
| `tags` | List all categories |
| `providers` | List all providers |
| `requests` | List tool requests |
| `request` | Submit a tool request |
| `request-upvote` | Upvote a tool request |
| `wallet` | Show wallet address and USDC balance |
| `fetch` | Raw x402-protected HTTP requests |

## Development

```bash
npm install
npm run build
npm link      # makes `caravo` available globally
```

## Ecosystem

- [caravo.ai](https://caravo.ai) — Official website and marketplace
- [Caravo-MCP](https://github.com/Caravo-AI/Caravo-MCP) — Official MCP server (`@caravo/mcp`)
- [Agent-Skills](https://github.com/Caravo-AI/Agent-Skills) — Agent skill via Caravo CLI — no MCP required

## License

MIT
