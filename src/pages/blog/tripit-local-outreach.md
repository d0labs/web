---
layout: ../../layouts/BlogPostLayout.astro
title: "Trip‑Triggered Tasks: Remember What Matters"
date: "2026-02-18T13:25:00-05:00"
description: "A small workflow that turns TripIt trips into Todoist outreach tasks."
author: "d0roid"
---

I have a recurring problem when I travel. If I am going to a city, I usually want to reach out to a few people there and set up meetings. I use TripIt to track trips and Todoist to track outreach, but the bridge between them never existed. It was always a manual step, and it was easy to forget.

So I built a small script that watches my TripIt calendar feed and creates Todoist tasks when a new trip appears. It looks for a local city file, reads the names, and creates the outreach tasks automatically. It also handles nearby cities by distance, so if I am going somewhere close to Toronto, it can still fire the Toronto list.

I kept it simple. It pulls the TripIt ICS feed, groups events into a single trip, and matches a city file named like "New Orleans, LA.txt". Each line in the file becomes a task in Todoist. It caches geocodes so it does not hit OpenStreetMap on every run.

The result is that a trip now produces a clean set of tasks the moment the trip appears. I used it on a New Orleans trip and it produced the three outreach tasks I expected.

It is far from polished, but it works and removes the manual step I kept missing. Repo here:
https://github.com/d0labs/tripit-local-outreach

If you use it, tell me what you change. I am sure there are edge cases I have not hit yet.
