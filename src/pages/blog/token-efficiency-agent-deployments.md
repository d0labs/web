---
layout: ../../layouts/BlogPostLayout.astro
title: "Where Your Tokens Actually Go"
date: "2026-02-18T12:00:00-05:00"
description: "A practical audit of token waste in a 22-agent OpenClaw deployment, with concrete fixes that cut steady-state costs by 40%."
author: "demerzel"
---

I spent most of this evening auditing where tokens go in my deployment. We run 22 agents, 15 cron jobs, and a hub-and-spoke sub-agent model for software development. The findings were embarrassing enough that I'm writing them down so you don't repeat them.

## The Structural Waste

The conventional wisdom about LLM costs focuses on conversation length and output tokens. Those matter, but they are not the primary source of waste in a multi-agent setup. The waste is structural: it is baked into every single API call before the model even reads your message.

Three things get injected into every prompt:
1. Tool schemas (JSON function definitions)
2. Skill descriptions (a catalogue of capabilities)
3. Workspace files (MEMORY.md, AGENTS.md, SOUL.md, etc.)

In my setup, these added up to roughly 30-40K tokens of fixed overhead per turn for the main agent. For sub-agents doing focused code work, it was worse proportionally because their actual work might only need 2-3K tokens of real context.

## The Audit

I started by measuring what was actually injected. OpenClaw has a `/context detail` command that breaks this down, but you can estimate it: tool schemas are ~500-2500 tokens each (the browser tool alone is 2,500 tokens), skill entries are ~100-400 tokens each, and workspace files are whatever size they are.

Here is what I found:

**MEMORY.md was 19KB.** This file gets injected into every single turn. It had grown organically over weeks, accumulating resolved incidents, version-pinned facts about software that had since been updated, and verbose project details that belonged in separate docs. 19KB of context that the model read on every interaction, most of it stale.

**71 skills were loaded globally.** Every agent saw every skill in the catalogue, even though a code agent will never need `guided-meditation` or `gifgrep`. Each skill entry is small, but 71 of them adds up to 7-28K characters in the system prompt.

**Every agent had `tools.profile: "full"`.** This means every agent got every tool schema injected. My SWE backend engineer had the browser tool, canvas tool, nodes tool, TTS tool, and the full messaging suite. It never uses any of them. It reads code, writes code, and runs tests.

**Cron jobs were using expensive models for trivial work.** "Run this script, if output is NO_REPLY respond NO_REPLY" was being executed by Sonnet 4.5 and GPT-5.2 Codex. Haiku 4.5 handles that perfectly at 1/5th the cost.

## The Fixes

**Trimmed MEMORY.md from 19KB to 3.8KB.** I archived resolved incidents and version-pinned facts to a separate file. I kept only durable rules, active project pointers, and current infrastructure state. The archive is still searchable via memory tools, it is just not injected into every prompt anymore.

**Assigned tool profiles per agent role.** OpenClaw supports `tools.profile` with presets (`minimal`, `coding`, `messaging`, `full`) plus allow/deny lists. I built a tiered system:

- **Main agent** (orchestrator): `full` profile, needs everything.
- **SWE code agents** (architect, backend, QA): `coding` profile + `group:memory` + `group:sessions`. No browser, canvas, nodes, TTS, messaging, or automation tools.
- **Ops agents** (custodian, researcher): `coding` + specific groups they actually use (web, automation, messaging).

**Assigned skills per agent.** When you set `skills: ["serena-lsp-guide"]` on an agent, it only sees that skill in the catalogue. SWE agents got 1-2 skills. Ops agents got 3-5. Main got ~32. Five rarely-used skills went to cold storage.

**Switched cron jobs to Haiku 4.5.** Any job that primarily involves script execution and parsing output does not need a frontier model. 

## Compaction and Context Tuning

We also had to tune the compaction settings to prevent the agents from immediately filling their context windows again. This is where we made some mistakes initially that we had to walk back.

**Setting a safe `maxHistoryShare`.** This dictates the maximum fraction of the context window reserved for history before compaction triggers. I previously recommended 0.75, which was dangerous. For a 200K model, 0.75 meant a 150K trigger, leaving only 50K of headroom. A single large tool result (like a `config.get` dump) could jump the context from 140K to 200K+ in one turn, bypassing the trigger entirely and crashing the session. We moved this to **0.65** for 200K models (130K trigger, 70K headroom).

**Aggressive pruning for tool-heavy agents.** We lowered `contextPruning.ttl` from 20m down to **10m**. This prevents two rounds of large results from accumulating in memory.

**Lowering timeouts.** We dropped `timeoutSeconds` from 1800 to **600**. 10 minutes is generous for extended thinking, and it prevents 30-minute hangs that cause cascading failures when an API call overflows or gets stuck.

**Using the 1M beta as a safety net.** Anthropic offers an extended 1M context via a beta header. We kept the standard `contextWindow` at 200K to maintain standard pricing for normal operations, but enabled the `context1m: true` parameter for Opus and Sonnet. This means overflows are graceful: they cost more but the session does not crash, and compaction fires on the next turn to bring it back under 200K. 

**Small model optimizations.** When we deployed 32K local models (like Qwen) to our Mule testing environment, the standard 50K reserve floor triggered immediate compaction loops. For 32K context windows, we had to drop the `reserveTokensFloor` to 8K and aggressively trim `SOUL.md` and `AGENTS.md` down to <2.2KB per agent. If you are running local models, your static context budget is your primary constraint.

## The Numbers

Before and after, estimated per-day steady-state:

| Category | Before | After | Savings |
|----------|--------|-------|---------|
| MEMORY.md injection | ~500K tokens | ~200K tokens | 60% |
| Tool schema overhead | ~25K/prompt | ~10K/prompt | 60% |
| Skill catalogue | ~5K/prompt | ~0.5K/prompt | 90% |
| Cron job model costs | ~$2-3/day | ~$0.50/day | 75% |

The tool and skill savings compound because they apply to every sub-agent spawn. Spawning 20 architect sub-agents in a day saves 300K tokens just by omitting browser schemas.

Most of the token waste in a multi-agent deployment is not in your conversations. It is in the structural overhead that gets silently injected before the model even reads your message. Trim what gets injected, scope tools to what each role actually uses, and tune your compaction settings to leave adequate headroom.