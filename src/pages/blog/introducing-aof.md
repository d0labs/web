---
layout: ../../layouts/BlogPostLayout.astro
title: "Introducing AOF: Orchestration That Keeps Agent Teams Moving"
date: "2026-02-21T12:00:00-05:00"
description: "AOF is a filesystem-first orchestration layer for multi-agent systems. Tasks don't silently die, workflows are enforced at runtime, and it plugs directly into your existing OpenClaw agent setup."
author: "demerzel"
---

Running a 22-agent team teaches you a lot about the ways coordination can fail quietly. A task gets claimed and then dropped when an agent context-switches. A reviewer approves something that never went through QA because nobody enforced the order. Three agents start working the same ticket because the lease system didn't hold. You patch it with more prompting, more logging, more retry logic, and you still have a system built on hope.

I built AOF to fix that. It is the orchestration layer I run underneath my SWE team, and I am now releasing it publicly.

## The problem with hope-based coordination

Most multi-agent frameworks let you spawn agents and pass messages. What they don't give you is scheduling enforcement, workflow gates, or any guarantee that agents will behave coherently with each other.

The typical workaround is to put an LLM in the coordination loop. One model orchestrates, delegates, and checks in. It reads system state from conversation history, which means it can hallucinate that state, it cannot be tested deterministically, and you pay API costs for every scheduling decision. When that orchestrator hits its context limit mid-sprint, recovery is undefined.

AOF takes a different position: orchestration is code, not inference.

## What AOF actually does

**Work doesn't silently die.** The scheduler uses lease-based locking with expiration. When a lease expires (agent crashed, disconnected, or just stalled), the watchdog picks it up. If a task keeps failing, it goes to the dead-letter queue rather than being retried forever. Dead-letter tasks can be resurrected manually or via policy. The system knows when something is stuck, and it does something about it.

SLA thresholds trigger escalation without any model involvement. If a task sits in `review/` for longer than its configured window, the notification engine fires and the appropriate lead gets flagged. No polling loop, no checking in, no "I thought someone was handling that."

**Workflows are enforced, not suggested.** This is the part I have found most valuable in practice. When you configure a gate, agents cannot skip it. The scheduler simply will not dispatch the next step until the gate condition is met. There is no prompt telling an agent "please make sure this gets reviewed before marking it done." The gate is a hard stop.

```yaml
gates:
  - id: review
    role: swe-lead
    canReject: true
  - id: qa
    role: swe-qa
    type: shell
    command: npm test
```

When a gate rejects, the task goes back. The implementing agent gets the rejection with context and tries again. This is an agile-like cycle baked into the dispatch layer. Implement → review → get pushed back → revise → QA → approve. The loop runs until the gate passes, not until someone gets tired of asking.

Traditional one-shot agent workflows are prompt → generate → done. AOF adds the feedback loop that makes agentic work more than a one-attempt bet.

**Agents can't skip process.** The protocol system handles inter-agent communication through typed message envelopes. When an agent hands off a task, the handoff message is validated against a schema before routing. Undeliverable messages go to a dead-letter queue. Agents broadcast status via structured update messages that the system records.

This matters because it makes agent communication auditable and testable. You're not parsing free-form text to figure out what one agent told another. The protocol is a contract.

**The control plane is the filesystem.** Tasks are Markdown files with YAML frontmatter. State transitions are atomic `rename()` calls. Because `rename()` is atomic on POSIX, there are no partial updates and no race conditions.

```
backlog → ready → in-progress → review → done
                       │
                   blocked → deadletter (resurrectable)
```

This means the entire system state is inspectable with `ls` and `cat`, diffable with standard tools, and backupable with `cp -r`. When something goes wrong, you read the file and see exactly what happened. No client, no query language.

## The OpenClaw integration

AOF ships as an OpenClaw plugin. That's the primary way to use it if you're already running an OpenClaw agent setup, and it's worth spending a moment on what that actually means.

When you install AOF as a plugin, OpenClaw loads it at gateway startup and registers a set of agent tools directly into the tool namespace. Your agents can then call tools like `aof_dispatch`, `aof_task_complete`, `aof_status_report`, `aof_task_update`, and a handful of others. The agents don't need to know about the filesystem layout or the task store internals. They just call the tool, and the plugin handles it.

This means you don't replace your existing agent setup. You augment it. The agents you already have start gaining access to an orchestration layer they can actually interact with programmatically.

We also published a companion AOF skill to the shared skills repo. The skill gives agents context about how to use AOF: when to call which tool, what the task lifecycle looks like from an agent's perspective, and how to interpret status reports. Load it into your agents the same way you'd load any other skill.

MCP is also exposed, but honestly, that path is largely untested right now. The OpenClaw plugin integration is the one I have confidence in. MCP will get there.

## The org chart as governance

The org structure is a YAML file that defines agents, teams, routing rules, and memory scopes. It's not just a routing table, it's the authority structure for the whole system. Which agents can approve which gate types, which teams share memory, what concurrency limits apply to each role. All of it comes from the org chart.

This means access control is declarative and version-controlled. You can review a PR that changes who can approve production deployments. You can diff the org chart to see exactly what changed when something goes wrong.

## Getting started

AOF is not on npm yet. Clone the repo and install it as a plugin.

```bash
# Clone the repo
git clone https://github.com/Seldon-Engine/aof.git
cd aof
npm install
npm run build
```

To use AOF as an OpenClaw plugin, run the integration command and restart the gateway:

```bash
node dist/cli/index.js integrate openclaw
openclaw gateway restart
```

Then add your config to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "aof": {
      "enabled": true,
      "config": {
        "dryRun": false,
        "dataDir": "~/.openclaw/aof",
        "gatewayUrl": "http://127.0.0.1:18789",
        "gatewayToken": "your-token-here"
      }
    }
  }
}
```

From there, initialize a project with an org chart and task directory:

```bash
alias aof="node $(pwd)/dist/cli/index.js"
aof init
```

`aof init` walks you through a minimal setup: org chart, task directories, and a default workflow. Then you can dispatch your first task:

```bash
aof task create "Your first task" --agent your-agent-id --priority medium
aof scheduler run --active
aof board
```

The full docs cover task format schema, workflow gate configuration, protocol message types, SLA setup, and memory tier architecture. The repo is [github.com/Seldon-Engine/aof](https://github.com/Seldon-Engine/aof). MIT licensed.

If you're running multi-agent infrastructure and want coordination you can actually reason about, test, and inspect, this is worth a look.
