export type VideoPlatform = "youtube" | "tiktok" | "instagram";
export type VideoIdentity = {
  platform: VideoPlatform;
  videoId: string;
  canonicalUrl: string;
};
export type VerifiedMetrics = {
  views: number;
  source: string;
  observedAt: string;
};
export type VerificationResult =
  | { status: "verified"; metrics: VerifiedMetrics }
  | { status: "unavailable"; reason: string };

/** Parse IDs only; never fetch a user-controlled URL or follow its redirects. */
export function parseVideoUrl(value: string, platform: string): VideoIdentity {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid public video URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error(
      "Use an HTTPS video URL without credentials or a custom port",
    );
  }
  const host = url.hostname.toLowerCase();
  let id = "";
  if (platform === "youtube") {
    if (host === "youtu.be")
      id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1] ?? "";
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
      else
        id =
          url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1] ?? "";
    }
    if (!/^[\w-]{11}$/.test(id))
      throw new Error("Use a YouTube watch, Shorts, or youtu.be video URL");
    return {
      platform,
      videoId: id,
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }
  if (platform === "tiktok") {
    if (["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host)) {
      id = url.pathname.match(/^\/@[\w.-]+\/video\/(\d{10,30})\/?$/)?.[1] ?? "";
    }
    if (!id)
      throw new Error(
        "Use the full TikTok /@creator/video/ URL, not a shortened redirect link",
      );
    // The original creator path remains readable; identity is the numeric video ID.
    return {
      platform,
      videoId: id,
      canonicalUrl: `https://www.tiktok.com${url.pathname.replace(/\/$/, "")}`,
    };
  }
  if (platform === "instagram") {
    if (["instagram.com", "www.instagram.com"].includes(host)) {
      id =
        url.pathname.match(/^\/(?:reel|reels)\/([\w-]{5,40})\/?$/)?.[1] ?? "";
    }
    if (!id) throw new Error("Use a public Instagram Reel URL");
    return {
      platform,
      videoId: id,
      canonicalUrl: `https://www.instagram.com/reel/${id}/`,
    };
  }
  throw new Error("Choose YouTube, TikTok, or Instagram");
}

export function parseViewCount(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error("Missing API view count");
  if (typeof value === "string" && !/^\d+$/.test(value))
    throw new Error("Invalid API view count");
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error("Invalid API view count");
  return count;
}

export function eligibility(
  views: number,
  minimum: number,
): "under_review" | "rejected" {
  return views >= minimum ? "under_review" : "rejected";
}

/** Backend adapter contract, not a scraper. Missing permission/quota is not zero views. */
export async function verifyVideo(
  identity: VideoIdentity,
  fetcher: typeof fetch = fetch,
): Promise<VerificationResult> {
  try {
    if (
      identity.platform === "youtube" &&
      process.env.YOUTUBE_DATA_API_KEY?.trim()
    ) {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.search = new URLSearchParams({
        part: "statistics",
        id: identity.videoId,
        key: process.env.YOUTUBE_DATA_API_KEY,
      }).toString();
      const res = await fetcher(url, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok)
        return {
          status: "unavailable",
          reason:
            "YouTube verification is unavailable or its quota is exhausted. Retry later.",
        };
      const body = await res.json();
      const item = body.items?.find(
        (v: { id?: string }) => v.id === identity.videoId,
      );
      if (!item)
        return {
          status: "unavailable",
          reason:
            "YouTube could not verify this video. Check that it is public and the link is correct.",
        };
      return {
        status: "verified",
        metrics: {
          views: parseViewCount(item.statistics?.viewCount),
          source: "youtube-data-api-v3",
          observedAt: new Date().toISOString(),
        },
      };
    }

    const endpoint = process.env.ANALYTICS_VERIFIER_URL?.trim();
    const token = process.env.ANALYTICS_VERIFIER_TOKEN?.trim();
    if (!endpoint || !token)
      return {
        status: "unavailable",
        reason: `${identity.platform === "youtube" ? "YouTube API" : identity.platform === "tiktok" ? "TikTok authorized analytics" : "Instagram professional-account analytics"} is not connected. Your entry is saved, not rejected.`,
      };
    const target = new URL(endpoint);
    if (target.protocol !== "https:" || target.username || target.password)
      throw new Error("Invalid verifier configuration");
    const res = await fetcher(target, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: identity.platform,
        videoId: identity.videoId,
        postUrl: identity.canonicalUrl,
      }),
    });
    if (!res.ok)
      return {
        status: "unavailable",
        reason:
          "The analytics provider could not verify this post. Retry when access is restored.",
      };
    const body = await res.json();
    // The adapter must bind metrics to the exact identity and provide fresh source evidence.
    const observed = Date.parse(body.observedAt);
    const age = Date.now() - observed;
    if (
      body.platform !== identity.platform ||
      body.videoId !== identity.videoId ||
      typeof body.source !== "string" ||
      !body.source.trim() ||
      body.source.length > 120 ||
      !Number.isFinite(observed) ||
      age > 300000 ||
      age < -30000
    ) {
      return {
        status: "unavailable",
        reason:
          "The analytics provider returned incomplete, stale, or mismatched evidence.",
      };
    }
    return {
      status: "verified",
      metrics: {
        views: parseViewCount(body.views),
        source: body.source,
        observedAt: new Date(observed).toISOString(),
      },
    };
  } catch {
    // Never log upstream URLs/errors: they may contain API credentials.
    return {
      status: "unavailable",
      reason:
        "API verification could not complete. Your proof is saved; retry later.",
    };
  }
}
