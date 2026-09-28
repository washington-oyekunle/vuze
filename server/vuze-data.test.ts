import { describe, expect, it } from "vitest";
import { clearDemoBrowserData, DEMO_BROWSER_KEYS } from "../client/src/lib/clear-demo-browser-data";
import { campaigns, clips, monthlyLeaderboard, moderationItems, resources, weeklyLeaderboard } from "../client/src/lib/vuze-data";

describe("VUZE launch data state", () => {
  it("contains no hard-coded campaign, creator, clip, moderation, or resource records", () => {
    expect(campaigns).toEqual([]);
    expect(clips).toEqual([]);
    expect(monthlyLeaderboard).toEqual([]);
    expect(moderationItems).toEqual([]);
    expect(resources).toEqual([]);
    expect(weeklyLeaderboard).toEqual([]);
  });

  it("clears both browser-local demo keys while leaving unrelated storage untouched", () => {
    const values = new Map<string, string>([
      ["vuze-demo-submissions", "old submission"],
      ["vuze-demo-socials", "old toggle"],
      ["other-app-setting", "keep this"],
    ]);
    clearDemoBrowserData({ removeItem: (key) => { values.delete(key); } });
    expect(DEMO_BROWSER_KEYS).toEqual(["vuze-demo-submissions", "vuze-demo-socials"]);
    expect(values.has("vuze-demo-submissions")).toBe(false);
    expect(values.has("vuze-demo-socials")).toBe(false);
    expect(values.get("other-app-setting")).toBe("keep this");
  });
});
