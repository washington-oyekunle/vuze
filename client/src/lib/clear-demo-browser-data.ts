export const DEMO_BROWSER_KEYS = ["vuze-demo-submissions", "vuze-demo-socials"] as const;

export type RemovableKeyValueStorage = {
  removeItem(key: string): void;
};

export function clearDemoBrowserData(storage: RemovableKeyValueStorage): void {
  for (const key of DEMO_BROWSER_KEYS) storage.removeItem(key);
}
