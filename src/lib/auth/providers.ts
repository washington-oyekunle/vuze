export type AuthProvider = {
  providerId: "google" | "twitter";
  label: string;
};

export const AUTH_PROVIDERS: readonly AuthProvider[] = [
  { providerId: "google", label: "Google" },
  { providerId: "twitter", label: "X" },
];
