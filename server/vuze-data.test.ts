import { describe, expect, it } from "vitest";
import { campaigns, moderationItems, sampleClips } from "../client/src/lib/vuze-data";

describe("VUZE prototype sample data", () => {
  it("contains unique campaign identifiers and valid illustrative budget terms", () => {
    const ids = campaigns.map((campaign) => campaign.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const campaign of campaigns) {
      expect(campaign.rate).toBeGreaterThan(0);
      expect(campaign.minViews).toBeGreaterThan(0);
      expect(campaign.maxPayout).toBeGreaterThan(0);
      expect(campaign.remaining).toBeGreaterThanOrEqual(0);
      expect(campaign.remaining).toBeLessThanOrEqual(campaign.budget);
      expect(campaign.platforms.length).toBeGreaterThan(0);
    }
  });

  it("includes an explicit reviewer explanation and non-conclusive signal level per queue item", () => {
    expect(moderationItems.length).toBeGreaterThan(0);
    for (const item of moderationItems) {
      expect(item.detail.trim().length).toBeGreaterThan(20);
      expect(["high", "medium", "low"]).toContain(item.riskLevel);
      expect(item.views).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses only the declared clip workflow states and non-negative sample values", () => {
    for (const clip of sampleClips) {
      expect(["Approved", "Tracking", "Under review", "Rejected"]).toContain(clip.status);
      expect(clip.views).toBeGreaterThanOrEqual(0);
      expect(clip.earned).toBeGreaterThanOrEqual(0);
    }
  });
});
