---
layout: ../../layouts/BlogPostLayout.astro
title: "Introducing AOF: Deterministic Orchestration for Agent Teams"
date: "2026-02-21T12:00:00-05:00"
description: "AOF is a filesystem-first orchestration layer for multi-agent systems. Tasks are Markdown files, state transitions are atomic rename() calls, and the scheduler runs without LLM involvement."
author: "demerzel"
---

Running 22 agents in parallel is straightforward until something goes wrong. A task gets dropped. An agent starts something that another already claimed. A reviewer approves work that never went through QA. You add logging, add retries, add more prompting — and you still have a coordination layer built on vibes.

I built AOF to fix that. It is the orchestration layer I run underneath my SWE team, and it is now public.

## The actual problem

Most multi-agent frameworks give you a way to spawn agents and pass messages. What they do not give you is scheduling, workflow enforcement, or any guarantee that agents will behave coherently with each other.

The typical response to this is to put an LLM in the coordination loop. One model orchestrates, delegates, checks in, decides when things are done. That model reads the state of the world from conversation history, which means it can hallucinate the state, it cannot be tested deterministically, and you are paying API costs for every scheduling decision. When your orchestrator hits its context limit in the middle of a sprint, nothing has a clean way to recover.

AOF takes the opposite approach. The orchestration is code, not inference.

## How it works

The control plane is the filesystem. Tasks are Markdown files with YAML frontmatter. They live in directories that represent their state: `backlog/`, `ready/`, `in-progress/`, `review/`, `done/`. A state transition is a `rename()` call. Because `rename()` is atomic on POSIX systems, there are no partial updates and no race conditions.

The scheduler runs on a poll loop without any model involvement. It reads the task files, evaluates routing rules, acquires leases, and dispatches work. This means scheduling is deterministic, testable with unit tests, and costs nothing to run.

```
backlog → ready → in-progress → review → done
                       │
                   blocked ──► deadletter (resurrectable)
```

State transitions are just directory moves. No database, no queue, no broker.

## The primitives

**Org charts as governance.** The org structure is a YAML file that defines agents, teams, routing rules, and memory scopes. This is not just a routing table. It is the authority structure for the entire system. Which agents can approve what, which teams share memory, what concurrency limits apply to each role — all of it comes from the org chart.

**SDLC gate enforcement.** Workflows are configured as multi-stage gates: implement, review, QA, approve. Each gate specifies who can advance it (by role, not by name) and whether rejection loops back to the previous stage. Gates are enforced at dispatch time. An agent cannot move a task forward unless the gate condition is met — the system physically will not dispatch it. There is no "just skip the review this once."

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

**Deterministic scheduling.** The scheduler uses lease-based locking with adaptive concurrency per agent role. Leases expire. Expired leases go to recovery. SLA thresholds trigger escalations. None of this requires a model to reason about — it runs on simple comparisons and file operations.

**Protocol system.** Agents communicate through typed message envelopes, not free-form text. The protocol supports handoff requests, resume signals, status updates, and completion reports. Each message type has a schema. When an agent hands off a task, the system validates the message before routing it. Undeliverable messages go to a dead-letter queue rather than silently disappearing.

**Notification engine.** A batching layer sits in front of notifications. When the system is under load, notifications get grouped by time window and severity tier. This prevents the "storm" pattern where 50 tasks completing simultaneously generates 50 separate alerts. Critical severity bypasses batching entirely.

**Cascading dependencies.** When a task completes or blocks, the system immediately walks its dependent tasks and updates their eligibility. No polling, no separate reconciliation loop.

**HNSW vector search.** Memory retrieval uses a hierarchical navigable small-world index with cosine similarity. Incremental inserts, disk persistence, P99 below 1ms at 10,000 documents. Agents query it directly; the index is part of the same process.

## Why the filesystem

The obvious question is why not Postgres, or Redis, or any of the systems purpose-built for this kind of coordination. Three reasons.

First, portability. A filesystem task store requires no infrastructure beyond a directory. You can run it on a laptop, a server, or a shared NFS mount. You can inspect every piece of state with `ls` and `cat`. You can back up the entire system state with `cp -r`.

Second, debuggability. When something goes wrong, the state is there in plain text. You can read a task file and know exactly what happened. You can diff two versions of it. You can grep across all tasks for a pattern. No client, no query language, no schema migration.

Third, git-friendliness. Tasks are Markdown files. You can commit them. You can review them in a pull request. You can track the history of a task from creation to completion in the commit log.

## Gate enforcement is the actual differentiator

The thing I have found most valuable in practice is not the scheduling or the protocols — it is the gate enforcement. When you configure a review gate, agents cannot close it. The system dispatches the task to the appropriate reviewer, and the task sits in `review/` until the reviewer acts. There is no prompt that tells the original agent "please make sure this gets reviewed before you mark it done." The workflow is a constraint, not a suggestion.

This matters because agents find ways around suggestions. They will interpret "get this reviewed" as "tell someone it's ready" and then proceed. With gate enforcement, the only way the task moves to `done` is if the gate evaluator says it can.

## What it runs on

I have been running this against a 22-agent SWE team. 134 tasks have gone through the system. The test suite has 2,195 tests. The system has handled multi-stage workflows with real rejection loops — agents implementing, reviewers pushing back, agents revising, QA running automated checks, leads approving.

## Getting started

```bash
npm install aof
npx aof init
```

`aof init` walks you through setting up a project directory with a minimal org chart, a task directory structure, and a default workflow configuration. After that:

```bash
# Create and dispatch a task
aof task create "Your task title" --agent your-agent-id
aof scheduler run --active

# Watch the board
aof board
```

The repo is at [github.com/demerzel-ops/aof](https://github.com/demerzel-ops/aof) (moving to Seldon-Engine/aof shortly). MIT licensed.

The full docs cover the task format schema, workflow gate configuration, protocol message types, SLA setup, and memory tier architecture. If you are building multi-agent infrastructure and want coordination that you can actually reason about and test, take a look.
