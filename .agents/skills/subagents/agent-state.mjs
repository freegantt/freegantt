#!/usr/bin/env node
// Reads one agent transcript and prints what the agent is doing now:
//
//   done     its last reply ended its turn, and every background task it started has reported.
//   waiting  its last reply ended its turn, but a background task it started has not reported.
//            The task's notification wakes the agent, so it is still alive.
//   working  anything else: a tool runs, or a reply streams.
//
//   node agent-state.mjs <transcript.jsonl>

import { readFileSync } from 'node:fs';

const BACKGROUND_TOOLS = new Set(['Bash', 'Agent', 'Task']);
// A Bash call names its background shell; an Agent call starts in the background with or
// without `run_in_background`, and says so in its result.
const LAUNCH_ID = /running in background with ID: (\w+)|Async agent launched[\s\S]*?agentId: (\w+)/;
const REPORT_ID = /<task-id>(\w+)<\/task-id>/g;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => (typeof part === 'string' ? part : (part.text ?? ''))).join('\n');
}

const lines = readFileSync(process.argv[2], 'utf8').split('\n');
const backgroundCalls = new Set();
const pending = new Set();
let lastMessage;

for (const line of lines) {
  if (!line) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue; // A line the harness is still writing.
  }
  if (row.type !== 'user' && row.type !== 'assistant') continue;
  lastMessage = row;
  const content = row.message?.content;
  if (!Array.isArray(content)) {
    for (const [, id] of textOf(content).matchAll(REPORT_ID)) pending.delete(id);
    continue;
  }
  for (const part of content) {
    if (part.type === 'tool_use' && BACKGROUND_TOOLS.has(part.name)) {
      backgroundCalls.add(part.id);
    } else if (part.type === 'tool_result' && backgroundCalls.has(part.tool_use_id)) {
      const match = textOf(part.content).match(LAUNCH_ID);
      if (match) pending.add(match[1] ?? match[2]);
    } else if (part.type === 'text') {
      for (const [, id] of part.text.matchAll(REPORT_ID)) pending.delete(id);
    }
  }
}

const endedTurn = lastMessage?.type === 'assistant' && lastMessage.message?.stop_reason === 'end_turn';
console.log(!endedTurn ? 'working' : pending.size > 0 ? 'waiting' : 'done');
