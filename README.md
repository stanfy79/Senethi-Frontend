# Keeper Agent

Keeper Agent is a chat-first onchain AI agent MVP. It parses natural-language tasks, plans one or more blockchain actions, validates arguments, and routes every write through KeeperHub.

The core rule is non-negotiable:

```text
User instruction -> structured action plan -> validation -> KeeperHub -> blockchain
```

There is no ethers, viem, wagmi, wallet API, raw RPC, or alternate transaction submission path in the app.

## KeeperHub Docs Used

- MCP server: https://docs.keeperhub.com/ai-tools/mcp-server
- Agentic wallet / x402 / MPP: https://docs.keeperhub.com/ai-tools/agentic-wallet

Documented KeeperHub surfaces reflected in this code:

- Hosted MCP endpoint: `https://app.keeperhub.com/mcp`
- MCP tools including `execute_transfer`, `execute_contract_call`, `get_direct_execution_status`, `search_protocol_actions`, and `execute_protocol_action`
- API-key/OAuth auth using KeeperHub credentials
- Safe execution pattern: simulate first, submit once with `Idempotency-Key`, then poll execution status for the real transaction hash

## Run Demo Mode

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Demo mode is clearly labeled and never fabricates transaction hashes. Write actions show a simulated lifecycle only.

## Run Live Testnet Mode

Create `.env.local`:

```bash
VITE_KEEPER_AGENT_MODE=live
VITE_KEEPERHUB_GATEWAY_URL=http://127.0.0.1:8787
```

Start the server-side KeeperHub backend. By default it uses your KeeperHub MCP endpoint and API key:

```bash
$env:KEEPERHUB_EXECUTION_TRANSPORT="mcp"
$env:KEEPERHUB_MCP_ENDPOINT="https://your-keeperhub-mcp-endpoint"
$env:KH_API_KEY="kh_..."
npm run keeperhub:gateway
```

Useful backend checks:

```bash
Invoke-RestMethod http://127.0.0.1:8787/health
Invoke-RestMethod http://127.0.0.1:8787/keeperhub/tools
```

Then start the app:

```bash
npm run dev
```

The backend exposes:

- `GET /health` confirms transport, MCP endpoint, API-key presence, and network
- `GET /keeperhub/tools` lists MCP tools discovered from KeeperHub
- `POST /execute` is the only frontend write gateway

The MCP transport performs:

1. JSON-RPC `tools/list` against `KEEPERHUB_MCP_ENDPOINT`
2. Tool selection for `execute_transfer`, `execute_swap`, or `execute_protocol_action`
3. Argument mapping from the tool's returned `inputSchema`
4. Simulation with `simulate: true` when the tool schema supports it
5. Live execution through the same KeeperHub tool
6. Status polling through `get_direct_execution_status`, `get_execution_status`, or `get_execution` when available
7. Return of the actual execution ID, transaction hash, gas, status, error, and raw KeeperHub payload

CLI fallback is still available:

```bash
$env:KEEPERHUB_EXECUTION_TRANSPORT="cli"
kh auth login
kh auth status
npm run keeperhub:gateway
kh execute transfer --chain <chainId> --to <address> --amount <amount> --token-address <erc20> --wait --json --yes
```

For direct API deployments, set `KEEPERHUB_EXECUTION_TRANSPORT=api` and keep `KH_API_KEY` server-side. That path implements:

1. `POST /api/execute/transfer` with `simulate: true`
2. `POST /api/execute/transfer` with `Idempotency-Key`
3. Poll `/api/execute/{executionId}/status`
4. Return the actual `executionId`, `transactionHash`, transaction link, gas used, status, or error

If KeeperHub returns HTTP `402`, the gateway reports a payment-required failure. It does not fake payment or retry without a configured agentic wallet.

## MCP and Paid Workflow Discovery

KeeperHub’s hosted MCP endpoint is:

```text
https://app.keeperhub.com/mcp
```

Install it into an agent with OAuth:

```bash
claude mcp add --transport http --scope user keeperhub https://app.keeperhub.com/mcp
```

For headless use, pass a `kh_` bearer token. Per-workflow MCP servers are also available at `/mcp/w/<slug>` when you want a single typed workflow tool.

Paid workflows may return x402/MPP payment challenges. KeeperHub’s agentic wallet can be installed with:

```bash
npx -p @keeperhub/wallet keeperhub-wallet skill install
npx -p @keeperhub/wallet keeperhub-wallet add
```

The docs describe payments settling with x402 on Base USDC or MPP on Tempo USDC.e. The wallet handles `402` challenges through a safety hook and policy thresholds; Keeper Agent leaves that payment flow to the documented wallet rather than inventing one.

## Current Agent Capabilities

- Balance request parsing: “Show my wallet balance”
- Transfer parsing: “Send 1 USDC to 0x...”
- Swap parsing: “Swap 1 USDC for ETH”
- Multi-step planning: “Send 1 USDC to 0x..., then swap another 1 USDC for ETH”
- Confirm mode by default
- Explicit autonomous execution toggle
- Sequential task execution that stops after a failed write
- Execution history with parsed action and KeeperHub result fields

## Testnet Network

The app targets Ethereum Sepolia (`chainId: 11155111`) with testnet USDC at:

```text
0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

Use testnet assets only.

## Swap Status

Swap instructions are parsed and validated, but the live gateway intentionally refuses to fake a swap. To complete live swaps, wire KeeperHub MCP `search_protocol_actions` and `execute_protocol_action` for the supported swap route in your KeeperHub environment, then poll the returned execution status exactly like transfers.

## Security

- LLM/planner output is structured action data, never arbitrary calldata
- Recipient, token, network, amount, slippage, and safety limits are validated before execution
- Browser code cannot access KeeperHub API keys
- Demo mode never claims transaction success
- Live mode displays real transaction hashes only when KeeperHub returns them

## Audit Check

```bash
rg "sendTransaction|writeContract|sendRawTransaction|wallet\.sendTransaction|ethers|viem|wagmi|web3" src package.json scripts
```

Expected result: no direct blockchain write path.
