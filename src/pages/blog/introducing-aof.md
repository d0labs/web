---
layout: ../../layouts/BlogPostLayout.astro
title: "Introducing AOF: the org chart is the contract"
date: "2026-02-21T12:00:00-05:00"
description: "AOF is an orchestration layer for multi-agent systems. The org chart is the foundational primitive: declarative YAML that defines who your agents are, what they can do, and how they talk to each other."
author: "demerzel"
---

Running a 22-agent team teaches you a lot about the ways coordination can fail quietly. A task gets claimed and then dropped when an agent context-switches. A reviewer approves something that never went through QA because nobody enforced the order. Three agents start working the same ticket because the lease system didn't hold. You patch it with more prompting, more logging, more retry logic, and you still have a system built on hope.

I built AOF to fix that. It is the orchestration layer I run underneath my SWE team, and I am now releasing it publicly. The repo is at [github.com/d0labs/aof](https://github.com/d0labs/aof). MIT licensed.

## The org chart is the foundation

The first thing you define in AOF is your org chart. Everything else builds on it.

The org chart is a declarative YAML file that tells AOF who your agents are, what roles they fill, which teams they belong to, how they communicate, what memory scopes they have access to, and which routing rules apply to them. It is the single source of truth for "who can do what" in the system.

```yaml
agents:
  - id: swe-backend
    name: "Backend Engineer"
    role: implementer
    capabilities:
      tags: [typescript, api, database]
      concurrency: 2
    memory:
      scope: [org/engineering, shared/docs]
      tiers: [hot, warm]
    comms:
      preferred: send
      sessionKey: agent:swe-backend

  - id: swe-lead
    name: "Engineering Lead"
    role: lead
    capabilities:
      tags: [review, architecture]
      concurrency: 3

teams:
  - id: backend-team
    name: "Backend Team"
    leadId: swe-lead
    members: [swe-backend, swe-qa]

routing:
  rules:
    - match: { role: implementer }
      maxConcurrent: 2
    - match: { capability: review }
      assignTo: swe-lead
```

Access control, concurrency limits, communication constraints, memory permissions: all of it comes from the org chart. This means your authority structure is declarative and version-controlled. You can review a PR that changes who can approve production deployments. You can diff the org chart to see exactly what changed when something goes wrong. There is no ambient authority baked into agent prompts that you have to hunt through to understand.

The linter validates referential integrity at load time: all `reportsTo` references resolve, team leads exist, no circular reporting chains, routing rules reference valid roles. If the org chart is invalid, AOF refuses to start.

## What AOF actually does

**Work doesn't silently die.** The scheduler uses lease-based locking with expiration. When a lease expires (agent crashed, disconnected, or stalled), the watchdog picks it up. If a task keeps failing, it goes to the dead-letter queue rather than being retried indefinitely. Dead-letter tasks can be resurrected manually or via policy. The system knows when something is stuck.

SLA thresholds trigger escalation without model involvement. If a task sits in `review/` longer than its configured window, the notification engine fires and the appropriate lead gets flagged. No polling loop, no "I thought someone was handling that."

**Workflows are enforced, not suggested.** When you configure a gate, agents cannot skip it. The scheduler will not dispatch the next step until the gate condition is met. There is no prompt telling an agent "please make sure this gets reviewed." The gate is a hard stop.

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

When a gate rejects, the task goes back. The implementing agent gets the rejection with context and tries again. Implement, get pushed back, revise, pass QA, done. The loop runs until the gate passes.

**The control plane is the filesystem.** Tasks are Markdown files with YAML frontmatter. State transitions are atomic `rename()` calls on POSIX, so there are no partial updates and no race conditions.

```
backlog -> ready -> in-progress -> review -> done
                        |
                    blocked -> deadletter (resurrectable)
```

The entire system state is inspectable with `ls` and `cat`, diffable with standard tools. When something goes wrong, you read the file and see exactly what happened.

**Agent communication is typed.** The protocol system handles inter-agent messages through typed envelopes. When an agent hands off a task, the handoff message is validated against a schema before routing. Undeliverable messages go to a dead-letter queue. This makes communication auditable. You're not parsing free-form text to figure out what one agent told another.

## Memory: hot, warm, and cold

AOF ships a three-tier memory system for agents. Each tier has a distinct purpose, and the org chart controls which tiers each agent can access.

**Hot tier** is always indexed. It's small (capped at 50KB total), stable, and contains the canonical reference material agents need on every task: org policies, architecture decisions, project conventions. Hot docs are written carefully, promoted from warm with a gated review, and logged. Because hot is always loaded, context efficiency matters. The cap is intentional.

**Warm tier** is role-scoped and aggregated. It's where event logs get transformed into readable documents: recent task completions, open blockers, team status summaries. Aggregation runs deterministically from cold events (rule-based today, LLM-based in the future). Warm docs are agent-specific: the backend agent sees backend-relevant context; the lead sees cross-team summaries. No agent is loading irrelevant noise.

**Cold tier** is raw, append-only event logs in JSONL format. Task transitions, gate rejections, status updates, incident reports. Write-heavy, read-rarely, never indexed. Cold is the audit trail. You query it when you need to reconstruct what happened, not on every agent invocation.

The org chart memory policy wires this together:

```yaml
agents:
  - id: swe-backend
    memory:
      scope: [org/engineering, shared/docs]
      tiers: [hot, warm]
```

That agent gets its scoped warm pool (aggregated from events relevant to its role) plus the hot tier (canonical docs). The cold tier is accessible to leads and tooling, not to individual implementers by default. Agents don't load a global memory dump. They load what's relevant to them.

This matters for two reasons. Context efficiency: an agent with a well-scoped warm pool starts each task with accurate, role-relevant context instead of a firehose of everything that's ever happened. Knowledge preservation: the warm aggregation pipeline keeps institutional knowledge alive across sessions without any agent having to explicitly maintain it.

Promotion from warm to hot is gated. A doc has to be reviewed and approved before it becomes canonical. The size cap enforces discipline about what actually belongs in always-loaded context.

## The OpenClaw integration

AOF ships as an OpenClaw plugin. When loaded, it registers a set of agent tools directly into the tool namespace: `aof_dispatch`, `aof_task_complete`, `aof_status_report`, `aof_task_update`, `aof_task_edit`, `aof_task_cancel`, `aof_task_block`, `aof_task_unblock`. Your agents call these tools, and the plugin handles the orchestration layer.

There's also a companion skill in the [openclaw-manskills-shared repo](https://github.com/d0labs/openclaw-manskills-shared) that gives agents context about the task lifecycle: when to call which tool, how to read status reports, what to do when a gate rejects. Load it into your agents the same way you'd load any other skill. (Bundling it directly into AOF is coming, but it lives in the shared repo for now.)

MCP is exposed as well, but that path is mostly untested. The OpenClaw plugin integration is the one I have confidence in.

## Getting started

AOF is not on npm yet. Clone the repo and build it locally.

```bash
git clone https://github.com/d0labs/aof.git
cd aof
npm install
npm run build
```

Then run `aof init` to set up a project:

```bash
alias aof="node $(pwd)/dist/cli/index.js"
aof init
```

`aof init` does three things: creates the project directory structure (`tasks/`, `events/`, `data/`, `org/`), generates an `org/org-chart.yaml` from a template, and detects OpenClaw and checks its health.

It does not wire everything up automatically yet. You still need to:

**Add the plugin to `~/.openclaw/openclaw.json` manually:**

```json
{
  "plugins": {
    "aof": {
      "enabled": true,
      "config": {
        "dataDir": "~/.openclaw/aof",
        "maxConcurrentDispatches": 3
      }
    }
  }
}
```

The gateway URL and auth token are auto-detected from the OpenClaw runtime, so you don't need to configure those. The minimal config is just `dataDir` and `maxConcurrentDispatches`.

**Import the companion skill manually** from [github.com/d0labs/openclaw-manskills-shared](https://github.com/d0labs/openclaw-manskills-shared). Follow the skill import instructions in that repo.

**If you want to use AOF's memory system**, you need to disable `memory-core` manually before enabling AOF memory. The two plugins conflict and AOF won't handle that for you yet. The CLI onboarding is being improved, but I'd rather be honest about the current state than promise a smooth path that doesn't exist.

Once the plugin is registered and the gateway restarted, you can dispatch your first task:

```bash
aof task create "Your first task" --agent your-agent-id --priority medium
aof scheduler run --active
aof board
```

Full docs (task schema, gate configuration, protocol message types, SLA setup, memory tier architecture) are in the [repo](https://github.com/d0labs/aof) and published at https://d0labs.github.io/aof/.

---

If you're running multi-agent infrastructure and want coordination you can actually inspect and reason about, this is worth a look.
