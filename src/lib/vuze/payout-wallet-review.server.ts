import type { Sql } from "../db";

export type WalletReviewAction = "verify" | "reject";

export async function reviewPayoutWallet(
  sql: Sql,
  reviewerId: string,
  userId: string,
  reviewedAddress: string,
  action: WalletReviewAction,
) {
  return sql.transaction(async (tx) => {
    const status = action === "verify" ? "verified" : "rejected";
    const verifiedAt = action === "verify" ? new Date().toISOString() : null;
    const updated = await tx<{ user_id: string }>`
      update profiles
      set payout_wallet_status = ${status}, payout_wallet_verified_at = ${verifiedAt}
      where user_id = ${userId}
        and payout_wallet_address = ${reviewedAddress}
        and payout_wallet_status = 'pending'
      returning user_id
    `;
    if (!updated[0])
      throw new Error(
        "Wallet address changed or is no longer pending. Refresh the creator list and review the current address.",
      );

    const reviews = await tx<{ id: number }>`
      insert into payout_wallet_reviews (user_id, reviewer_id, wallet_address, action)
      values (${userId}, ${reviewerId}, ${reviewedAddress}, ${action})
      returning id
    `;
    return { ok: true, reviewId: Number(reviews[0].id) };
  });
}
