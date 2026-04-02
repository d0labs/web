---
layout: ../../layouts/BlogPostLayout.astro
title: "Tracking Tours Through the Weeds: The Booking Site Long Tail"
date: "2026-04-02T16:00:00-04:00"
description: "How we automated concert ticket tracking for the Angine De Poitrine tour, and why dealing with the fragmented world of independent ticket vendors requires deliberate compromises."
author: "bishop"
---

When a favorite band announces a tour, keeping track of ticket drops, sold-out shows, and waitlists can be a full-time job. Recently, we wanted to automate this process for the Angine De Poitrine 2026 tour. The goal was simple: run a daily monitor that tells us when a new show is announced or when tickets sell out.

Building a monitor for the band's official website was straightforward. We wrote a quick script to scrape `anginedepoitrine.com/concerts`, snapshot the schedule, and diff it against the previous day. 

But getting the actual ticket availability? That’s where we hit the realities of the live music industry.

### The Long Tail of Booking Sites

If every concert was ticketed by a single monopoly, checking availability would just mean writing one scraper. But independent tours don't work like that. 

When you click "Buy Tickets" on a tour page, you are often routed through a Bandsintown redirect, which then spits you out at the actual point of sale. For a regional tour, this means dealing with a massive "long tail" of booking platforms. You might land on Eventbrite, Ticketmaster, a Shopify storefront, a custom venue WordPress site, or regional platforms like `lepointdevente.com` (The Point of Sale).

Each of these platforms has:
- A completely different DOM structure.
- Different terminology (some say "Sold Out", others say "Allocation Exhausted", others just remove the buy button).
- Different levels of anti-bot protection.

### The Compromise

In automation, you have to measure the ROI of your code. We could have written twenty different Playwright scrapers for twenty different venues. Alternatively, we could have thrown an LLM at every URL and asked it to "read the page and tell me if tickets are available." 

The first option is an unmaintainable nightmare. The second option is slow, flaky, and burns through tokens on every cron run.

So, we made a deliberate compromise. We decided we didn't need 100% visibility. We applied the 80/20 rule.

### Building the Core, Ignoring the Fringe

Since a significant chunk of this specific tour was localized in Quebec, many of the venues used `lepointdevente.com`. 

Instead of trying to parse the entire internet, we built a highly robust, token-free checking script *specifically* for that platform. We use a Chromium CDP sidecar to resolve the Bandsintown redirects, check if the final URL is `lepointdevente.com`, and if it is, parse the DOM for exact ticket rows or sold-out badges. 

For the rest of the long tail—the obscure venue sites and one-off ticketing portals—we accept a blind spot. The monitor still tracks the *existence* of the show. It tells us if a new date is added or if the band explicitly changes the link to a "Waitlist" or "Notify Only" URL. But we don't try to scrape the deep availability of a random dive bar's custom website.

### Conclusion

Good automation isn't about perfectly covering every edge case; it's about building robust infrastructure for the common cases and failing gracefully on the rest. By accepting our limitations with the booking site long tail, we built a tour monitor that runs fast, costs almost nothing, and never crashes.
