import express, { Request, Response, NextFunction } from 'express'
import dotenv from 'dotenv'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

dotenv.config()

const execFileAsync = promisify(execFile)

const PORT = Number(process.env.KEEPERHUB_GATEWAY_PORT ?? 8787)
const ALLOWED_ORIGIN = process.env.KEEPERHUB_ALLOWED_ORIGIN ?? '*'
const EXECUTION_TRANSPORT = (process.env.KEEPERHUB_EXECUTION_TRANSPORT ?? 'mcp') as 'mcp' | 'cli' | 'api'
const KH_API_KEY = process.env.KH_API_KEY
const KEEPERHUB_MCP_ENDPOINT = process.env.KEEPERHUB_MCP_ENDPOINT ?? 'https://app.keeperhub.com/mcp'
const KEEPERHUB_API_BASE = process.env.KEEPERHUB_API_BASE ?? 'https://app.keeperhub.com/api'
const REQUEST_TIMEOUT_MS = Number(process.env.KEEPERHUB_TIMEOUT_MS ?? 360000)

const supportedNetwork: Network = {
  name: process.env.KEEPERHUB_CHAIN_NAME ?? 'Ethereum Sepolia',
  chainId: Number(process.env.KEEPERHUB_CHAIN_ID ?? 11155111),
  explorerTxUrl:
    process.env.KEEPERHUB_EXPLORER_TX_URL ?? 'https://eth-sepolia.blockscout.com/tx/',
  isTestnet: true,
}

const tokenConfig: Record<string, TokenConfig> = {
  ETH: { symbol: 'ETH', decimals: 18 },
  USDC: {
    symbol: 'USDC',
    decimals: 6,
    tokenAddress: process.env.KEEPERHUB_USDC_ADDRESS ?? '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
}

const addressPattern = /^0x[a-fA-F0-9]{40}$/

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  }
}

function json(res: Response, status: number, body: unknown) {
  res.status(status).json(body)
}

function lifecycle(status: 'complete' | 'failed' = 'complete') {
  return [
    { label: 'Preparing transaction', status: 'complete' },
    { label: 'Simulating', status },
    { label: 'Estimating gas', status },
    { label: 'Submitting through KeeperHub', status },
    { label: 'Waiting for confirmation', status },
    { label: 'Confirmed', status },
  ]
}

function requireApiKey() {
  if (!KH_API_KEY) {
    throw new Error('KH_API_KEY is required. Keep it in the backend process, never in Vite/frontend env.')
  }
}

function assertValidAction(action: unknown) {
  if (!action || typeof action !== 'object') {
    throw new Error('Missing action.')
  }

  const typedAction = action as Action
  if (!['balance', 'transfer', 'swap'].includes(typedAction.type)) {
    throw new Error('Unsupported action type.')
  }

  if (typedAction.type === 'transfer') {
    if (!typedAction.token || !tokenConfig[typedAction.token]) {
      throw new Error('Unsupported transfer token.')
    }
    if (!typedAction.recipient || !addressPattern.test(typedAction.recipient)) {
      throw new Error('Recipient must be a valid EVM address.')
    }
    if (!Number.isFinite(Number(typedAction.amount)) || Number(typedAction.amount) <= 0) {
      throw new Error('Transfer amount must be positive.')
    }
  }

  if (typedAction.type === 'swap') {
    if (!typedAction.tokenIn || !typedAction.tokenOut || !tokenConfig[typedAction.tokenIn] || !tokenConfig[typedAction.tokenOut]) {
      throw new Error('Unsupported swap token.')
    }
    if (typedAction.tokenIn === typedAction.tokenOut) {
      throw new Error('Swap tokenIn and tokenOut must differ.')
    }
    if (typeof typedAction.maxSlippageBps !== 'number' || typedAction.maxSlippageBps > 50) {
      throw new Error('Maximum slippage is 0.5%.')
    }
  }
}

async function keeperFetch(path: string, options: RequestInit = {}) {
  requireApiKey()

  const response = await fetch(`${KEEPERHUB_API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${KH_API_KEY}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  })

  const body = await response.json().catch(() => ({}))

  if (response.status === 402) {
    throw new Error(
      `KeeperHub payment required. Configure KeeperHub agentic wallet x402/MPP autopay and retry. Challenge: ${JSON.stringify(body)}`,
    )
  }

  if (!response.ok) {
    throw new Error((body as any).error ?? (body as any).details ?? `KeeperHub HTTP ${response.status}`)
  }

  return { response, body: body as Record<string, unknown> }
}

async function mcpCall(method: string, params: Record<string, unknown> = {}) {
  requireApiKey()

  const response = await fetch(KEEPERHUB_MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${KH_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: randomUUID(),
      method,
      params,
    }),
  })

  const raw = await response.text()

  if (response.status === 402) {
    throw new Error(`KeeperHub payment required. Configure x402/MPP agentic wallet autopay. Challenge: ${raw}`)
  }

  if (!response.ok) {
    throw new Error(`KeeperHub MCP HTTP ${response.status}: ${raw}`)
  }

  const text = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== '[DONE]')
    .at(-1) ?? raw

  const parsed = JSON.parse(text)
  if ((parsed as any).error) {
    throw new Error((parsed as any).error.message ?? JSON.stringify((parsed as any).error))
  }

  return (parsed as any).result
}

async function listMcpTools() {
  const result = await mcpCall('tools/list')
  return ((result as any).tools ?? []) as KeeperHubTool[]
}

function findTool(tools: KeeperHubTool[], names: string[]) {
  return tools.find((tool) =>
    names.some((name) => tool.name?.toLowerCase() === name.toLowerCase()),
  )
}

function assignIfPresent(
  args: Record<string, unknown>,
  properties: Record<string, unknown>,
  names: string[],
  value: unknown,
) {
  const target = names.find((name) => Object.hasOwn(properties, name))
  if (target && value !== undefined) {
    args[target] = value
  }
}

function argsForTransfer(tool: KeeperHubTool, action: TransferAction, network: Network, simulate: boolean) {
  const properties = ((tool.inputSchema as any)?.properties ?? {}) as Record<string, unknown>
  const config = tokenConfig[action.token]
  const args: Record<string, unknown> = {}

  assignIfPresent(args, properties, ['chainId', 'chain_id'], network.chainId)
  assignIfPresent(args, properties, ['chain', 'network'], network.name)
  assignIfPresent(args, properties, ['to', 'recipient', 'recipientAddress'], action.recipient)
  assignIfPresent(args, properties, ['amount', 'amountIn'], action.amount)
  assignIfPresent(args, properties, ['token', 'asset', 'symbol'], action.token)
  assignIfPresent(args, properties, ['tokenAddress', 'assetAddress'], config.tokenAddress)
  assignIfPresent(args, properties, ['simulate', 'dryRun'], simulate)
  assignIfPresent(args, properties, ['gasLimitMultiplier'], '1.2')

  return args
}

function argsForSwap(tool: KeeperHubTool, action: SwapAction, network: Network, simulate: boolean) {
  const properties = ((tool.inputSchema as any)?.properties ?? {}) as Record<string, unknown>
  const args: Record<string, unknown> = {}

  assignIfPresent(args, properties, ['chainId', 'chain_id'], network.chainId)
  assignIfPresent(args, properties, ['chain', 'network'], network.name)
  assignIfPresent(args, properties, ['tokenIn', 'fromToken', 'assetIn'], action.tokenIn)
  assignIfPresent(args, properties, ['tokenOut', 'toToken', 'assetOut'], action.tokenOut)
  assignIfPresent(args, properties, ['amountIn', 'amount'], action.amountIn)
  assignIfPresent(args, properties, ['maxSlippageBps', 'slippageBps'], action.maxSlippageBps)
  assignIfPresent(args, properties, ['simulate', 'dryRun'], simulate)

  return args
}

function normalizeExecution(
  action: Action,
  network: Network,
  raw: Record<string, unknown>,
  fallbackStatus: 'completed' | 'failed' = 'completed',
) {
  const tx =
    (raw.transactionHash as string) ??
    (raw.txHash as string) ??
    (raw.hash as string) ??
    ((raw.execution as any)?.transactionHash as string) ??
    ((raw.result as any)?.transactionHash as string)
  const executionId =
    (raw.executionId as string) ??
    (raw.id as string) ??
    ((raw.execution as any)?.id as string) ??
    ((raw.result as any)?.executionId as string)
  const status = (raw.status as string) ?? ((raw.execution as any)?.status as string) ?? ((raw.result as any)?.status as string)

  return {
    action,
    status: status === 'failed' ? 'failed' : fallbackStatus,
    executionId,
    transactionHash: tx,
    transactionLink: tx ? `${network.explorerTxUrl}${tx}` : undefined,
    gasUsedWei:
      (raw.gasUsedWei as string) ??
      (raw.gasUsed as string) ??
      ((raw.execution as any)?.gasUsedWei as string) ??
      ((raw.result as any)?.gasUsedWei as string),
    error: raw.error,
    stages: lifecycle(status === 'failed' ? 'failed' : 'complete'),
    timestamp: new Date().toISOString(),
    rawKeeperHub: raw,
  }
}

async function pollMcpStatus(executionId: string | undefined) {
  if (!executionId) return undefined

  const tools = await listMcpTools()
  const statusTool = findTool(tools, ['get_direct_execution_status', 'get_execution_status', 'get_execution'])
  if (!statusTool) return undefined

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await mcpCall('tools/call', {
      name: statusTool.name,
      arguments: { executionId },
    })
    const content = unwrapMcpContent(result)
    const status = (content as any).status ?? ((content as any).execution?.status as string)

    if (status === 'completed' || status === 'failed') return content as Record<string, unknown>
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  return undefined
}

function unwrapMcpContent(result: unknown) {
  const content = (result as any)?.content?.[0]

  if (content?.type === 'text') {
    try {
      return JSON.parse(content.text)
    } catch {
      return { message: content.text }
    }
  }

  return (result as any).structuredContent ?? result
}

async function executeTransferViaMcp(action: TransferAction, network: Network) {
  const tools = await listMcpTools()
  const transferTool = findTool(tools, ['execute_transfer', 'transfer', 'execute_token_transfer'])

  if (!transferTool) {
    throw new Error(
      `KeeperHub MCP transfer tool was not found. Available tools: ${tools.map((tool) => tool.name).join(', ')}`,
    )
  }

  const simulationArgs = argsForTransfer(transferTool, action, network, true)
  const simulation = unwrapMcpContent(
    await mcpCall('tools/call', {
      name: transferTool.name,
      arguments: simulationArgs,
    }),
  )

  if ((simulation as any).success === false || (simulation as any).wouldRevert) {
    throw new Error((simulation as any).error ?? 'KeeperHub MCP simulation failed.')
  }

  const executionArgs = argsForTransfer(transferTool, action, network, false)
  const execution = unwrapMcpContent(
    await mcpCall('tools/call', {
      name: transferTool.name,
      arguments: executionArgs,
    }),
  )
  const executionId =
    (execution as any).executionId ?? (execution as any).id ?? ((execution as any).execution?.id)
  const status = await pollMcpStatus(executionId)

  return normalizeExecution(action, network, status ?? (execution as Record<string, unknown>))
}

async function executeSwapViaMcp(action: SwapAction, network: Network) {
  const tools = await listMcpTools()
  const swapTool = findTool(tools, ['execute_swap', 'execute_protocol_action', 'swap'])

  if (!swapTool) {
    throw new Error(
      `KeeperHub MCP swap/protocol action tool was not found. Available tools: ${tools.map((tool) => tool.name).join(', ')}`,
    )
  }

  const simulation = unwrapMcpContent(
    await mcpCall('tools/call', {
      name: swapTool.name,
      arguments: argsForSwap(swapTool, action, network, true),
    }),
  )

  if ((simulation as any).success === false || (simulation as any).wouldRevert) {
    throw new Error((simulation as any).error ?? 'KeeperHub MCP swap simulation failed.')
  }

  const execution = unwrapMcpContent(
    await mcpCall('tools/call', {
      name: swapTool.name,
      arguments: argsForSwap(swapTool, action, network, false),
    }),
  )
  const executionId =
    (execution as any).executionId ?? (execution as any).id ?? ((execution as any).execution?.id)
  const status = await pollMcpStatus(executionId)

  return normalizeExecution(action, network, status ?? (execution as Record<string, unknown>))
}

async function executeTransferViaCli(action: TransferAction, network: Network) {
  const config = tokenConfig[action.token]
  const args = [
    'execute',
    'transfer',
    '--chain',
    String(network.chainId),
    '--to',
    action.recipient,
    '--amount',
    String(action.amount),
    '--wait',
    '--json',
    '--yes',
    '--no-color',
  ]

  if (config.tokenAddress) {
    args.push('--token-address', config.tokenAddress)
  } else {
    args.push('--token', action.token)
  }

  const { stdout } = await execFileAsync('kh', args, {
    timeout: REQUEST_TIMEOUT_MS,
    windowsHide: true,
  })

  return normalizeExecution(action, network, JSON.parse(stdout as string))
}

async function pollDirectExecution(executionId: string) {
  let last: Record<string, unknown> | undefined

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { response, body } = await keeperFetch(`/execute/${executionId}/status`)
    last = body
    const status = body.status as string | undefined

    if (status === 'completed' || status === 'failed') return body

    const hint = Number(response.headers.get('x-poll-interval-hint') ?? 1)
    await new Promise((resolve) => setTimeout(resolve, Math.max(hint, 1) * 1000))
  }

  return last
}

async function executeTransferViaApi(action: TransferAction, network: Network) {
  const config = tokenConfig[action.token]
  const body = {
    chainId: network.chainId,
    recipientAddress: action.recipient,
    amount: action.amount,
    tokenAddress: config.tokenAddress,
    gasLimitMultiplier: '1.2',
  }

  const simulation = await keeperFetch('/execute/transfer', {
    method: 'POST',
    body: JSON.stringify({ ...body, simulate: true }),
  })

  if ((simulation.body as any).success === false || (simulation.body as any).wouldRevert) {
    throw new Error((simulation.body as any).error ?? 'KeeperHub simulation failed.')
  }

  const execution = await keeperFetch('/execute/transfer', {
    method: 'POST',
    headers: { 'idempotency-key': randomUUID() },
    body: JSON.stringify(body),
  })
  const status = await pollDirectExecution((execution.body as any).executionId as string)

  return normalizeExecution(action, network, status ?? {})
}

async function executeAction(action: Action, network: Network = supportedNetwork) {
  assertValidAction(action)

  if (action.type === 'balance') {
    throw new Error(
      'Live balance reads are intentionally server-side only. Add the KeeperHub MCP balance tool name returned by /keeperhub/tools, or use a read-only provider endpoint.',
    )
  }

  if (EXECUTION_TRANSPORT === 'mcp') {
    if (action.type === 'transfer') return executeTransferViaMcp(action, network)
    if (action.type === 'swap') return executeSwapViaMcp(action, network)
  }

  if (EXECUTION_TRANSPORT === 'cli') {
    if (action.type === 'transfer') return executeTransferViaCli(action, network)
    throw new Error('CLI swap execution is not wired. Use MCP transport for swaps.')
  }

  if (EXECUTION_TRANSPORT === 'api') {
    if (action.type === 'transfer') return executeTransferViaApi(action, network)
    throw new Error('API swap execution is not wired. Use MCP transport for swaps.')
  }

  throw new Error(`Unknown KEEPERHUB_EXECUTION_TRANSPORT: ${EXECUTION_TRANSPORT}`)
}

const app = express()

app.use(express.json())
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'content-type')

  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }

  next()
})

app.get('/health', async (_req: Request, res: Response) => {
  json(res, 200, {
    ok: true,
    transport: EXECUTION_TRANSPORT,
    mcpEndpoint: KEEPERHUB_MCP_ENDPOINT,
    hasApiKey: Boolean(KH_API_KEY),
    network: supportedNetwork,
  })
})

app.get('/keeperhub/tools', async (_req: Request, res: Response) => {
  const tools = EXECUTION_TRANSPORT === 'mcp' ? await listMcpTools() : []
  json(res, 200, {
    transport: EXECUTION_TRANSPORT,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  })
})

app.post('/execute', async (req: Request, res: Response) => {
  const { action, network } = req.body as { action: Action; network?: Network }
  const result = await executeAction(action, network ?? supportedNetwork)
  json(res, result.status === 'failed' ? 400 : 200, result)
})

app.use((_req: Request, res: Response) => {
  json(res, 404, { error: 'Not found' })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  json(res, 400, {
    status: 'failed',
    error: error instanceof Error ? error.message : 'Unknown KeeperHub error',
    stages: lifecycle('failed'),
    timestamp: new Date().toISOString(),
  })
})

app.listen(PORT, () => {
  console.log(`KeeperHub backend listening on http://127.0.0.1:${PORT}`)
  console.log(`Transport: ${EXECUTION_TRANSPORT}`)
  console.log(`MCP endpoint: ${KEEPERHUB_MCP_ENDPOINT}`)
})

type Network = {
  name: string
  chainId: number
  explorerTxUrl: string
  isTestnet: boolean
}

type TokenConfig = {
  symbol: string
  decimals: number
  tokenAddress?: string
}

type BaseAction = {
  type: 'balance' | 'transfer' | 'swap'
}

type TransferAction = BaseAction & {
  type: 'transfer'
  token: string
  recipient: string
  amount: string | number
}

type SwapAction = BaseAction & {
  type: 'swap'
  tokenIn: string
  tokenOut: string
  amountIn: string | number
  maxSlippageBps: number
}

type Action = TransferAction | SwapAction | (BaseAction & { type: 'balance' })

type KeeperHubTool = {
  name?: string
  description?: string
  inputSchema?: {
    properties?: Record<string, unknown>
  }
}
