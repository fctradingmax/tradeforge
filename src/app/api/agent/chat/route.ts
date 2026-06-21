import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { TOOL_DEFINITIONS, getRecentTrades, getTradeStats, getWatchlist, getRecentFilings, getFundamentals, runMonteCarlo } from '@/lib/agent/tools'
import { SYSTEM_PROMPT } from '@/lib/agent/system-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { message, conversation_id } = await request.json() as {
    message: string
    conversation_id?: string
  }

  if (!message?.trim()) return new Response('message required', { status: 400 })

  // ── Resolve or create conversation ───────────────────────────────────────────
  let convId = conversation_id

  if (!convId) {
    const { data: conv, error } = await supabase
      .from('agent_conversations')
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select('id')
      .single()
    if (error) return new Response(error.message, { status: 500 })
    convId = conv.id
  }

  // ── Load conversation history ─────────────────────────────────────────────────
  const { data: history } = await supabase
    .from('agent_messages')
    .select('role,content,tool_calls')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })

  // Persist user message
  await supabase.from('agent_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: message,
  })

  // Build message history for Claude
  const messages: Anthropic.MessageParam[] = [
    ...((history ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '',
    }))),
    { role: 'user', content: message },
  ]

  // ── Streaming response ────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send('meta', { conversation_id: convId })

      try {
        let continueLoop = true

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
            messages,
          })

          // Collect text and tool calls from this turn
          let assistantText = ''
          const toolUseBlocks: Anthropic.ToolUseBlock[] = []

          for (const block of response.content) {
            if (block.type === 'text') {
              assistantText += block.text
              send('text', { text: block.text })
            } else if (block.type === 'tool_use') {
              toolUseBlocks.push(block)
              send('tool_call', { id: block.id, name: block.name, input: block.input })
            }
          }

          // Persist assistant turn
          await supabase.from('agent_messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: assistantText || null,
            tool_calls: toolUseBlocks.length ? toolUseBlocks : null,
          })

          // Add assistant turn to message history
          messages.push({ role: 'assistant', content: response.content })

          if (response.stop_reason === 'tool_use') {
            // Execute tools and build tool_result blocks
            const toolResults: Anthropic.ToolResultBlockParam[] = []

            for (const tool of toolUseBlocks) {
              let result: unknown
              try {
                result = await dispatchTool(supabase, user.id, tool.name, tool.input as Record<string, unknown>)
              } catch (err) {
                result = { error: err instanceof Error ? err.message : String(err) }
              }

              const resultStr = JSON.stringify(result)
              send('tool_result', { id: tool.id, name: tool.name, result: resultStr })

              toolResults.push({
                type: 'tool_result',
                tool_use_id: tool.id,
                content: resultStr,
              })

              // Persist tool result
              await supabase.from('agent_messages').insert({
                conversation_id: convId,
                role: 'tool',
                content: resultStr,
                tool_calls: [{ id: tool.id, name: tool.name }],
              })
            }

            messages.push({ role: 'user', content: toolResults })
          } else {
            // stop_reason === 'end_turn' — we're done
            continueLoop = false
          }
        }

        send('done', { conversation_id: convId })
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

async function dispatchTool(
  db: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'get_recent_trades':
      return getRecentTrades(db, userId, input as Parameters<typeof getRecentTrades>[2])
    case 'get_trade_stats':
      return getTradeStats(db, userId, input as Parameters<typeof getTradeStats>[2])
    case 'get_watchlist':
      return getWatchlist(db, userId, input as Parameters<typeof getWatchlist>[2])
    case 'get_recent_filings':
      return getRecentFilings(db, userId, input as Parameters<typeof getRecentFilings>[2])
    case 'get_fundamentals':
      return getFundamentals(db, userId, input as Parameters<typeof getFundamentals>[2])
    case 'run_monte_carlo':
      return runMonteCarlo(db, userId, input as Parameters<typeof runMonteCarlo>[2])
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
