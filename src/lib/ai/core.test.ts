import { describe, expect, it } from "vitest";
import { findBannedPhrases } from "./banned";
import { mineInsights } from "./mine";
import { stripVtt } from "./transcribe";
import { SAMPLE_TRANSCRIPT } from "@/lib/sample";

describe("banned phrase gate", () => {
  it("catches AI-tell phrases case-insensitively", () => {
    expect(
      findBannedPhrases("This is a Game-Changer that will revolutionize work"),
    ).toEqual(expect.arrayContaining(["game-changer", "revolutionize"]));
  });

  it("passes clean copy", () => {
    expect(
      findBannedPhrases("We shipped the handoff contract rewrite yesterday."),
    ).toHaveLength(0);
  });
});

describe("insight mining (fixture mode)", () => {
  it("every quote is a verbatim substring of the transcript — the provenance gate", async () => {
    const insights = await mineInsights(SAMPLE_TRANSCRIPT);
    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights) {
      expect(SAMPLE_TRANSCRIPT.includes(i.quote)).toBe(true);
    }
  });

  it("yields zero insights for pure logistics — never invents claims", async () => {
    const insights = await mineInsights(
      "Standup at ten. Deploy window Thursday. Book the flight. Lunch at eleven thirty. Garage closed Friday.",
    );
    expect(insights).toHaveLength(0);
  });

  it("caps at 6 insights", async () => {
    const opinionated = Array.from(
      { length: 15 },
      (_, i) =>
        `I think the number ${i} approach to caching is wrong because everyone copies it blindly without measuring anything first.`,
    ).join(" ");
    const insights = await mineInsights(opinionated);
    expect(insights.length).toBeLessThanOrEqual(6);
  });
});

describe("stripVtt", () => {
  it("removes WebVTT headers, cue numbers, timestamps, and tags", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Mark>I think everyone is building agents backwards.

2
00:00:04.500 --> 00:00:08.000
The handoff is what actually breaks.`;
    const out = stripVtt(vtt);
    expect(out).toContain("building agents backwards");
    expect(out).toContain("The handoff is what actually breaks.");
    expect(out).not.toContain("-->");
    expect(out).not.toContain("WEBVTT");
    expect(out).not.toContain("<v Mark>");
  });
});
