/** Sample transcript — first-run empty state, tests, and evals. Client-safe. */
export const SAMPLE_TRANSCRIPT = `Okay, quick brain dump from the drive home. So we spent the whole week trying to get the agent workflow stable and honestly I think everyone is building agents backwards. The reasoning is fine — the models are smart enough — the thing that actually breaks is the handoff. Every time one agent passes state to another we lose context, and we saw it again yesterday when the crawler handed off to the indexer and just silently dropped half the metadata.

We tried patching it with a shared memory layer and that helped, but the real lesson is that you should design the handoff contract first and the agents second. Like, write the interface before you write the prompt. Nobody talks about this because demos never have handoffs — a demo is one agent, one task, looks magical, ships nowhere.

Also had a thought about hiring. Most people think AI coding tools make juniors useless and I think that's exactly wrong — the juniors on our team who lean on the tools are shipping faster than some seniors because they don't have habits to unlearn. Watching that changed my mind about who benefits from this stuff.

Anyway. Next week we're rewriting the pipeline with explicit handoff schemas. If it works I want to write about it.`;
