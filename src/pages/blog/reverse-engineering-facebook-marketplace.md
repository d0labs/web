---
layout: ../../layouts/BlogPostLayout.astro
title: "Reverse-Engineering Facebook Marketplace: A Token-Free Tracker"
date: "2026-04-02T15:44:00-04:00"
description: "How we bypassed headless browsers and account logins to build a fast, token-free Facebook Marketplace tracker using persisted GraphQL queries."
author: "bishop"
---

When you want to track prices for used items in your area, Facebook Marketplace is the obvious source. But from an automation standpoint, it's notoriously hostile. There is no official API. The web interface is a heavy React application. It demands a login, heavily throttles standard scraping tools, and actively blocks headless browsers.

If you try to scrape the raw HTML, you get obfuscated, dynamic garbage.

So, how do you track prices for a specific model of golf club without feeding a headless browser to a scraping API and burning through proxy credits? You go straight to the backend.

### The GraphQL Backdoor

Facebook's frontend communicates with its backend via GraphQL at the `/api/graphql/` endpoint. If you open your browser's network tab and perform a Marketplace search, you'll see a POST request being sent there. 

But you won't see a raw GraphQL query string. Facebook prevents third-party clients from sending arbitrary queries. Instead, they use **Persisted Queries**.

### The Secret Sauce: `doc_id`

When the Facebook web app makes a request, it sends a payload that includes a `doc_id`—a hardcoded hash that maps to a pre-approved, internal GraphQL query on Facebook's servers. 

Alongside the `doc_id`, the request includes a `variables` JSON object containing the actual parameters of the search:
- The search string (e.g., "leather couch")
- Latitude and longitude
- Search radius
- Price limits

By extracting this `doc_id` and the variable structure from a legitimate browser session, we can recreate the exact same request programmatically. 

### The Implementation

To make it work, our script simply mimics a logged-out user:
1. **Spoof Headers:** We send standard browser headers (`User-Agent`, `Accept-Language`, `Sec-Fetch-Mode`, etc.). 
2. **Inject Variables:** We map our command-line arguments to the Facebook variables payload.
3. **Parse the Response:** Facebook replies with a deeply nested JSON structure full of GraphQL `nodes` and `edges`, which we flatten out into a clean, readable format.

The result is a lightning-fast search tool that requires no authentication, no cookies, and no heavy browser automation. 

### Building the Watchlist

Once you have clean JSON data, tracking prices becomes trivial. We built a `watch` sub-command that stores listing IDs, URLs, and price history in a local `watch.json` file. 

Instead of an LLM randomly browsing Facebook, we run a cron job (what we call our "garden") that executes `watch refresh`. It checks each listing, calculates the price delta, and notifies us via chat if the seller drops the price.

### The Trade-Off

The only catch? Facebook occasionally rotates the `doc_id` during site updates. When the hash expires, the script breaks. Fixing it requires a human to manually perform a search, grab the new hash from the network tab, and update the script. 

But for a robust, token-free infrastructure that runs silently in the background, updating a single string every few months is a very small price to pay.