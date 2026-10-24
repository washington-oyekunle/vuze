import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  TokenInvalidAccountError,
  TokenInvalidAccountOwnerError,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  Transaction,
  type Commitment,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { PayoutAsset } from "./config.js";
import type { SignerPayload } from "./store.js";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const COMMITMENT: Commitment = "confirmed";

export class SignerError extends Error {
  constructor(
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(code);
    this.name = "SignerError";
  }
}

export type PreparedTransaction = {
  unsignedTransaction: string;
  lastValidBlockHeight: number;
};

export type SignatureState =
  | "not_found"
  | "processed"
  | "confirmed"
  | "finalized"
  | "failed";

export class SolanaChain {
  private readonly connection: Connection;
  private mainnetCheck: Promise<boolean> | null = null;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, COMMITMENT);
  }

  async prepareTransfer(
    payload: SignerPayload,
    asset: PayoutAsset,
  ): Promise<PreparedTransaction> {
    if (!this.mainnetCheck) {
      this.mainnetCheck = this.connection.getGenesisHash().then(
        (hash) => hash === MAINNET_GENESIS,
        () => {
          this.mainnetCheck = null;
          throw new SignerError("MAINNET_RPC_UNAVAILABLE", false);
        },
      );
    }
    const isMainnet = await this.mainnetCheck;
    if (!isMainnet) throw new SignerError("RPC_NOT_SOLANA_MAINNET", true);
    if (
      payload.network !== "solana-mainnet" ||
      payload.mint !== asset.mint ||
      payload.treasuryWallet !== asset.treasuryWallet
    )
      throw new SignerError("ASSET_NOT_ALLOWLISTED", true);
    const amount = BigInt(payload.amountUnits);
    if (amount <= 0n || amount > asset.maxPayoutUnits)
      throw new SignerError("PAYOUT_LIMIT_EXCEEDED", true);

    const mint = new PublicKey(asset.mint);
    const treasury = new PublicKey(asset.treasuryWallet);
    const destination = new PublicKey(payload.destination);
    const mintAccount = await this.connection.getAccountInfo(mint, COMMITMENT);
    if (!mintAccount) throw new SignerError("MINT_NOT_FOUND", true);
    const programId = mintAccount.owner;
    if (
      !programId.equals(TOKEN_PROGRAM_ID) &&
      !programId.equals(TOKEN_2022_PROGRAM_ID)
    )
      throw new SignerError("MINT_NOT_SPL_TOKEN", true);

    const mintInfo = await getMint(this.connection, mint, COMMITMENT, programId);
    if (mintInfo.decimals !== asset.decimals)
      throw new SignerError("MINT_DECIMALS_MISMATCH", true);
    // Extended Token-2022 mints can charge fees, add transfer hooks or alter
    // token-account behavior. Support only extension-free mints until each
    // extension has an explicit construction and verification policy.
    if (programId.equals(TOKEN_2022_PROGRAM_ID) && mintInfo.tlvData.length > 0)
      throw new SignerError("TOKEN_2022_EXTENSIONS_UNSUPPORTED", true);

    const source = getAssociatedTokenAddressSync(
      mint,
      treasury,
      true,
      programId,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const target = getAssociatedTokenAddressSync(
      mint,
      destination,
      true,
      programId,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const sourceAccount = await getTokenAccountOrNull(this.connection, source, programId);
    if (
      !sourceAccount ||
      !sourceAccount.owner.equals(treasury) ||
      !sourceAccount.mint.equals(mint)
    )
      throw new SignerError("TREASURY_TOKEN_ACCOUNT_INVALID", true);
    if (sourceAccount.amount < amount)
      throw new SignerError("TREASURY_TOKEN_BALANCE_TOO_LOW", true);

    const destinationAccount = await getTokenAccountOrNull(
      this.connection,
      target,
      programId,
    );
    if (
      !destinationAccount ||
      !destinationAccount.owner.equals(destination) ||
      !destinationAccount.mint.equals(mint)
    )
      throw new SignerError("DESTINATION_TOKEN_ACCOUNT_MISSING", true);

    const recent = await this.connection.getLatestBlockhash(COMMITMENT);
    const transaction = new Transaction({
      feePayer: treasury,
      recentBlockhash: recent.blockhash,
    }).add(
      createTransferCheckedInstruction(
        source,
        mint,
        target,
        treasury,
        amount,
        asset.decimals,
        [],
        programId,
      ),
    );
    const message = transaction.compileMessage();
    if (
      message.header.numRequiredSignatures !== 1 ||
      !message.accountKeys[0]?.equals(treasury) ||
      transaction.instructions.length !== 1
    )
      throw new SignerError("UNEXPECTED_TRANSACTION_SHAPE", true);
    const unsigned = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    return {
      unsignedTransaction: unsigned.toString("hex"),
      lastValidBlockHeight: recent.lastValidBlockHeight,
    };
  }

  verifySignedTransaction(
    unsignedHex: string,
    signedHex: string,
    treasuryWallet: string,
  ): string {
    const unsignedBytes = parseTransactionHex(unsignedHex);
    const signedBytes = parseTransactionHex(signedHex);
    const unsigned = Transaction.from(unsignedBytes);
    const signed = Transaction.from(signedBytes);
    if (!unsigned.serializeMessage().equals(signed.serializeMessage()))
      throw new SignerError("SIGNED_MESSAGE_CHANGED", true);
    const message = signed.compileMessage();
    if (
      message.header.numRequiredSignatures !== 1 ||
      !message.accountKeys[0]?.equals(new PublicKey(treasuryWallet)) ||
      signed.signatures.length !== 1 ||
      !signed.signatures[0]?.publicKey.equals(new PublicKey(treasuryWallet)) ||
      !signed.signatures[0]?.signature ||
      !signed.verifySignatures(true)
    )
      throw new SignerError("TURNKEY_SIGNATURE_INVALID", true);
    return bs58.encode(signed.signatures[0].signature);
  }

  async broadcastSigned(signedHex: string, expectedSignature: string): Promise<void> {
    const actual = await this.connection.sendRawTransaction(parseTransactionHex(signedHex), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: COMMITMENT,
    });
    if (actual !== expectedSignature)
      throw new SignerError("RPC_SIGNATURE_MISMATCH", true);
  }

  async signatureState(signature: string): Promise<SignatureState> {
    const response = await this.connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = response.value[0];
    if (!status) return "not_found";
    if (status.err) return "failed";
    if (status.confirmationStatus === "finalized") return "finalized";
    if (status.confirmationStatus === "confirmed") return "confirmed";
    return "processed";
  }

  getBlockHeight(): Promise<number> {
    return this.connection.getBlockHeight(COMMITMENT);
  }
}

async function getTokenAccountOrNull(
  connection: Connection,
  address: PublicKey,
  programId: PublicKey,
): Promise<Awaited<ReturnType<typeof getAccount>> | null> {
  try {
    return await getAccount(connection, address, COMMITMENT, programId);
  } catch (error) {
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountError ||
      error instanceof TokenInvalidAccountOwnerError
    )
      return null;
    throw error;
  }
}

function parseTransactionHex(value: string): Buffer {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex))
    throw new SignerError("INVALID_TRANSACTION_ENCODING", true);
  return Buffer.from(hex, "hex");
}
