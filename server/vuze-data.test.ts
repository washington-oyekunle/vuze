import { describe, expect, it } from "vitest";
import { campaigns, moderationItems, monthlyLeaderboard, sampleClips, weeklyLeaderboard } from "../client/src/lib/vuze-data";

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

  it("keeps weekly and monthly creator rankings distinct, unique, and ordered by sample earnings", () => {
    expect(weeklyLeaderboard[0]?.handle).not.toBe(monthlyLeaderboard[0]?.handle);
    for (const rows of [weeklyLeaderboard, monthlyLeaderboard]) {
      const handles = rows.map((creator) => creator.handle);
      expect(new Set(handles).size).toBe(handles.length);
      for (let index = 0; index < rows.length; index += 1) {
        expect(rows[index]?.earned).toBeGreaterThanOrEqual(0);
        expect(rows[index]?.views).toBeGreaterThanOrEqual(0);
        expect(rows[index]?.clips).toBeGreaterThanOrEqual(0);
        if (index < rows.length - 1) expect(rows[index]?.earned).toBeGreaterThanOrEqual(rows[index + 1]?.earned ?? 0);
      }
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
