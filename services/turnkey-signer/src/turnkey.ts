import { Turnkey } from "@turnkey/sdk-server";
import type { SignerConfig } from "./config.js";
import { SignerError } from "./solana.js";

export class TurnkeyTransactionSigner {
  private readonly client: Turnkey;

  constructor(config: Pick<SignerConfig, "apiBaseUrl" | "organizationId" | "apiPublicKey" | "apiPrivateKey">) {
    this.client = new Turnkey({
      apiBaseUrl: config.apiBaseUrl,
      defaultOrganizationId: config.organizationId,
      apiPublicKey: config.apiPublicKey,
      apiPrivateKey: config.apiPrivateKey,
    });
  }

  async signSolanaTransaction(
    treasuryWallet: string,
    unsignedTransaction: string,
  ): Promise<string> {
    const response = await this.client.apiClient().signTransaction({
      signWith: treasuryWallet,
      unsignedTransaction,
      type: "TRANSACTION_TYPE_SOLANA",
    });
    const signed = response.activity?.result?.signTransactionResult?.signedTransaction;
    if (!signed) throw new SignerError("TURNKEY_SIGNING_INCOMPLETE", false);
    return signed;
  }
}
