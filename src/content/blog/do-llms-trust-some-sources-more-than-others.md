---
title: "Do LLMs trust some sources more than others?"
date: "2025-12-04"
slug: "do-llms-trust-some-sources-more-than-others"
tags: ["AI", "SEO"]
excerpt: "The short answer is yes. While system prompts generally do not contain a list of specific trusted publishers with associated scores (e.g., \"Weight the New York Times at 1.0 and a Blogspot site at 0.2\"),…"
hero_image: "/images/posts/do-llms-trust-some-sources-more-than-others/LLMtrust-scaled.png"
draft: false
original_url: "https://tomdehnel.com/do-llms-trust-some-sources-more-than-others/"
---

The short answer is **yes.** While system prompts generally do not contain a list of specific trusted publishers with associated scores (e.g., _"Weight the New York Times at 1.0 and a Blogspot site at 0.2"_), they do "learn" to trust popular, mainstream sources over others.

Instead of a simple instruction in the prompt, the "weighting" of information is a complex, three-layered process involving the **Search Engine**, the **System Prompt**, and the **Model's "Instinct" (Training Data).**

Here is how algorithms like Gemini and ChatGPT actually handle source credibility.

### 1\. Layer One: The Search Engine (The Gatekeeper)

When you ask a current-events question, the AI doesn't scan the entire internet itself. It relies on a search engine to do the heavy lifting first.

-   **ChatGPT uses Bing:** It relies on Bing's ranking algorithms to decide which 10–20 pages are relevant enough to even "read." If a small blog doesn't rank well on Bing, ChatGPT will likely never see it.
-   **Gemini uses Google:** Similarly, Gemini uses Google Search. Google’s algorithms prioritize "E-E-A-T" (Experience, Expertise, Authoritativeness, and Trustworthiness).
-   **The Weighting Mechanism:** The "weighting" here is **SEO**. Top-tier publishers usually have better domain authority, so they appear at the top of the search results. The AI simply trusts that the search engine has already done a good job of filtering out the junk.

### 2\. Layer Two: The System Prompt (The Manager)

While the system prompt doesn't list specific websites, it _does_ give high-level behavioral instructions on how to handle information. Based on leaks and official technical reports, these instructions often look like this:

-   **"Neutral Point of View":** Prompts often instruct the model to provide neutral summaries and avoid taking sides on controversial topics unless there is a clear consensus.
-   **"Consensus":** If a piece of information is found on multiple high-authority sites (corroboration), the prompt often instructs the model to treat it as fact. If it only appears on one niche site, the model is often instructed to treat it as a claim or ignore it.
-   **"Citation":** The prompt explicitly forces the model to cite its sources. This creates a feedback loop: the model prefers sources that are easy to cite and contain clear, structured information (which favors professional journalism over rambling blogs).

### 3\. Layer Three: The Model's "Instinct" (Training Data)

This is the most important and least visible layer. The "weighting" is baked into the model's brain during its initial training.

-   **Implicit Bias:** During training, the model read billions of documents. It learned that text resembling the style of the _New York Times_ or _Nature_ journal usually correlates with high-quality, non-contradictory tokens. Text that resembles a ranty forum post often correlates with low-quality or toxic tokens.
-   **Heuristics:** The model develops an "internal heuristic" (a mental shortcut). Even without a system prompt telling it to, it naturally "trusts" formal, well-edited prose over informal, typo-ridden text because that pattern yielded better rewards during its training phase.

### Summary Table: How They Weigh Information

<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><td><strong></strong></td><td><strong>Top-Tier Publisher (e.g., BBC, NYT)</strong></td><td><strong>Small/Niche Blog</strong></td></tr></thead><tbody><tr><td><strong>Search Layer</strong></td><td><strong>High Priority:</strong> Likely to be in the top 3 search results passed to the AI.</td><td><strong>Low Priority:</strong> Likely filtered out by Bing/Google unless the user searches for it specifically.</td></tr><tr><td><strong>Prompt Layer</strong></td><td><strong>Consensus:</strong> treated as "fact" if corroborated by other major outlets.</td><td><strong>Attribution:</strong> Treated as "opinion" or a "claim" ("According to a blog...").</td></tr><tr><td><strong>Model Layer</strong></td><td><strong>High Trust:</strong> The writing style matches the "high-quality" patterns in its training data.</td><td><strong>Low Trust:</strong> Informal tone or lack of structure triggers "low reliability" heuristics.</td></tr></tbody></table></figure>

### How this affects you

If you are trying to get an AI to trust a specific source (like your own website):

1.  **SEO is AI Optimization:** The AI can't weigh your info if it doesn't find it. You must rank in Google/Bing first.
2.  **Corroboration is Key:** AI models look for _consensus_. If your blog is the _only_ place claiming something, the AI will likely view it as a hallucination or an unverified claim and discard it.
