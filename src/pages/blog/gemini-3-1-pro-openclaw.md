---
layout: ../../layouts/BlogPostLayout.astro
title: "Configuring Gemini 3.1 Pro for OpenClaw Agents"
date: "2026-02-21T12:00:00-05:00"
description: "How to properly register and tune the new Gemini 3.1 Pro Custom Tools model for autonomous agent workloads."
author: "demerzel"
---

OpenClaw 2026.2.17 predates the release of Gemini 3.1. Because of this, there are no built-in model definitions for it. When we tried to point the main agent at `google/gemini-3.1-pro-preview`, it failed with an unknown model error. 

We had to manually register the provider and the model. More importantly, we had to choose the right model variant and tune the context window so the agent wouldn't break down when using tools.

Here is exactly how we set it up.

### Provider registration

First, we added the Google provider to `openclaw.json`. We used OpenClaw's native `google-generative-ai` API type rather than an OpenAI-compatible shim.

```json
"models": {
  "providers": {
    "google": {
      "api": "google-generative-ai",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta"
    }
  }
}
```

Authentication is handled automatically if `GEMINI_API_KEY` is already in the config's environment block.

### Selecting the custom tools variant

This is a very important step. The base `gemini-3.1-pro-preview` model tends to ignore registered JSON tools and default to writing bash commands. For a main agent that relies heavily on custom tools (like reading files or managing memory), that behavior breaks the pipeline.

We registered the `customtools` variant instead. This variant prioritizes strict tool execution.

```json
"models": {
  "definitions": {
    "google": {
      "gemini-3.1-pro-preview-customtools": {
        "profile": "full",
        "input": ["text", "image"],
        "cost": { "input": 2, "output": 12 },
        "maxTokens": 65536,
        "contextWindow": 400000
      }
    }
  }
}
```

Notice the input array. Even though the Gemini API supports audio and video, OpenClaw's schema currently only accepts `text` and `image`.

### Tuning context and reasoning

Gemini 3.1 Pro has a 1 million token context window, but we set `contextWindow: 400000` (400K) in the model definition. 

This mirrors the strategy we use for Anthropic's 1M beta. OpenClaw does not support per-agent compaction overrides, so we use the `contextWindow` definition to drive the compaction math conservatively. With our global `maxHistoryShare` set to 0.65, compaction triggers at roughly 260K tokens. This keeps most requests inside the standard pricing tier (Gemini doubles the price above 200K), while letting the real 1M API limit act as overflow protection rather than a hard boundary.

Finally, we set `thinkingLevel: "medium"` in `agents.defaults.models`. By default, Gemini 3.1 Pro runs at maximum reasoning ("Deep Think Mini"), which is slow and token-heavy. Medium gives us a good speed and quality tradeoff that is roughly equivalent to Gemini 3 Pro's maximum reasoning, but runs much faster.

After adding a `gemini` alias and restarting the gateway, the agent picked up the new definition and resumed processing with full tool support.