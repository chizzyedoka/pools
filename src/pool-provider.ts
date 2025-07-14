import {
  buildWhirlpoolClient,
  PDAUtil,
  PriceMath,
  TickUtil,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  WhirlpoolIx,
  toTx,
  ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
  increaseLiquidityQuoteByInputToken,
  TokenExtensionUtil,
  WhirlpoolContext,
} from "@orca-so/whirlpools-sdk";
import { Percentage } from "@orca-so/common-sdk";
import {
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import Decimal from "decimal.js";

export interface PoolProviderParams {
  inputTokenAmount: Decimal; // Amount of the input token to provide
  lowerPrice: Decimal; // Lower bound of the price range
  upperPrice: Decimal; // Upper bound of the price range
  poolAddress: PublicKey;
  slippagePercentage?: Decimal; // Optional slippage tolerance (default 1%)
}

export interface PoolProviderResult {
  transactionHash: string;
  positionMint: string;
  positionAddress: string;
  poolAddress: string;
  liquidityAmount: string;
  tokenAAmount: string;
  tokenBAmount: string;
}

export async function providePoolLiquidity(
  ctx: WhirlpoolContext,
  params: PoolProviderParams
) {
  // : Promise<PoolProviderResult>

  const {
    inputTokenAmount,
    lowerPrice,
    upperPrice,
    poolAddress,
    slippagePercentage = new Decimal(0.01), // Default 1% slippage
  } = params;

  try {
    // 1. Derive the Whirlpool Pool Address

    console.log("Pool address derived:", poolAddress.toBase58());

    // 2. Load the pool
    const client = buildWhirlpoolClient(ctx);
    const pool = await client.getPool(poolAddress);
    const poolData = pool.getData();
    const poolTokenAInfo = pool.getTokenAInfo();
    const poolTokenBInfo = pool.getTokenBInfo();

    console.log("Pool loaded successfully!");
    console.log("Token A:", poolTokenAInfo.mint.toBase58());
    console.log("Token B:", poolTokenBInfo.mint.toBase58());

    // 3. Get token decimals
    const tokenADecimal = poolTokenAInfo.decimals;
    const tokenBDecimal = poolTokenBInfo.decimals;

    // 4. Calculate tick range from price range
    const lowerTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(lowerPrice, tokenADecimal, tokenBDecimal),
      poolData.tickSpacing
    );
    const upperTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(upperPrice, tokenADecimal, tokenBDecimal),
      poolData.tickSpacing
    );

    console.log("Lower tick:", lowerTick);
    console.log("Upper tick:", upperTick);
    let inxs: TransactionInstruction[] = [];
    // 5. Initialize tick arrays if needed
    const tickInstructions = await initializeTickArraysIfNeeded(
      ctx,
      poolAddress,
      lowerTick,
      upperTick,
      poolData.tickSpacing
    );

    inxs.push(...tickInstructions);

    // 6. Create token extension context
    const tokenExtensionCtx =
      await TokenExtensionUtil.buildTokenExtensionContext(
        ctx.fetcher,
        poolData
      );

    // 7. Create liquidity quote
    const slippageTolerance = Percentage.fromDecimal(slippagePercentage);
    const quote = increaseLiquidityQuoteByInputToken(
      poolTokenAInfo.mint,
      inputTokenAmount,
      lowerTick,
      upperTick,
      slippageTolerance,
      pool,
      tokenExtensionCtx
    );

    console.log("Liquidity quote:", quote);
    console.log("Token A max:", quote.tokenMaxA.toString());
    console.log("Token B max:", quote.tokenMaxB.toString());
    console.log("Estimated liquidity:", quote.liquidityAmount.toString());

    // 8. Open position with liquidity
    console.log("Opening position...");
    const { positionMint, tx } = await pool.openPosition(
      lowerTick,
      upperTick,
      quote
    );

    console.log("Position mint address:", positionMint.toBase58());
    console.log("Executing position opening transaction...");

    // 9. Execute the transaction
    // const trxBuilder = tx.addInstructions(tickInstructions);
    const latestBlockhash = await ctx.connection.getLatestBlockhash();
    const trx = tx.buildSync({
      maxSupportedTransactionVersion: 0,
      latestBlockhash: latestBlockhash,
      blockhashCommitment: "confirmed",
      computeBudgetOption: { type: "none" },
    });

    const transaction = trx.transaction;
    let positionInstructions: TransactionInstruction[] = [];
    if (transaction instanceof Transaction) {
      //get the instructions from the transaction
      positionInstructions = transaction.instructions;
    } else {
      positionInstructions = TransactionMessage.decompile(
        (transaction as VersionedTransaction).message
      ).instructions;
    }

    // Combine tick initialization instructions with position instructions
    inxs.push(...positionInstructions);

    // 10. Get the position account address
    const positionPda = PDAUtil.getPosition(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      positionMint
    );
    console.log(inxs);

    return { inxs };
  } catch (error) {
    console.error("Error providing pool liquidity:", error);
    throw error;
  }
}

async function initializeTickArraysIfNeeded(
  ctx: WhirlpoolContext,
  poolPublicKey: PublicKey,
  lowerTick: number,
  upperTick: number,
  tickSpacing: number
) {
  const fetcher = ctx.fetcher;

  const tickInstructions: TransactionInstruction[] = [];
  const signers: Signer[] = [];

  // Get tick array start indices
  const lowerTickArrayStartTick = TickUtil.getStartTickIndex(
    lowerTick,
    tickSpacing
  );
  const upperTickArrayStartTick = TickUtil.getStartTickIndex(
    upperTick,
    tickSpacing
  );

  // Get tick array PDAs
  const lowerTickArrayPda = PDAUtil.getTickArray(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    poolPublicKey,
    lowerTickArrayStartTick
  );

  const upperTickArrayPda = PDAUtil.getTickArray(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    poolPublicKey,
    upperTickArrayStartTick
  );

  // Check and initialize lower tick array if needed
  try {
    const accountInfo = await ctx.connection.getAccountInfo(
      lowerTickArrayPda.publicKey
    );
    if (!accountInfo || !accountInfo.owner.equals(ORCA_WHIRLPOOL_PROGRAM_ID)) {
      throw new Error("Tick array not properly initialized");
    }
    console.log("Lower tick array exists and is properly initialized");
  } catch (error) {
    console.log("Initializing lower tick array...");
    const OrcaInx = WhirlpoolIx.initTickArrayIx(ctx.program, {
      startTick: lowerTickArrayStartTick,
      tickArrayPda: lowerTickArrayPda,
      whirlpool: poolPublicKey,
      funder: ctx.wallet.publicKey,
    });
    tickInstructions.push(
      ...OrcaInx.instructions,
      ...OrcaInx.cleanupInstructions
    );
    signers.push(...OrcaInx.signers);
  }

  // Check and initialize upper tick array if needed (only if different from lower)
  if (upperTickArrayStartTick !== lowerTickArrayStartTick) {
    try {
      const accountInfo = await ctx.connection.getAccountInfo(
        upperTickArrayPda.publicKey
      );
      if (
        !accountInfo ||
        !accountInfo.owner.equals(ORCA_WHIRLPOOL_PROGRAM_ID)
      ) {
        throw new Error("Tick array not properly initialized");
      }
      console.log("Upper tick array exists and is properly initialized");
    } catch (error) {
      console.log("Initializing upper tick array...");
      const orcaUpperInx = WhirlpoolIx.initTickArrayIx(ctx.program, {
        startTick: upperTickArrayStartTick,
        tickArrayPda: upperTickArrayPda,
        whirlpool: poolPublicKey,
        funder: ctx.wallet.publicKey,
      });
      tickInstructions.push(
        ...orcaUpperInx.instructions,
        ...orcaUpperInx.cleanupInstructions
      );
      signers.push(...orcaUpperInx.signers);

      //   const upperTxId = await initUpperTickArrayTx.buildAndExecute();
      //   console.log("Upper tick array initialized:", upperTxId);
    }
  }

  return tickInstructions;
}

// Helper function to get current pool price
export async function getCurrentPoolPrice(
  ctx: WhirlpoolContext,
  tokenAMint: PublicKey,
  tokenBMint: PublicKey,
  tickSpacing: number
): Promise<Decimal> {
  const poolAddress = PDAUtil.getWhirlpool(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
    tokenAMint,
    tokenBMint,
    tickSpacing
  );

  const client = buildWhirlpoolClient(ctx);
  const pool = await client.getPool(poolAddress.publicKey);
  const poolData = pool.getData();
  const poolTokenAInfo = pool.getTokenAInfo();
  const poolTokenBInfo = pool.getTokenBInfo();

  const currentPrice = PriceMath.sqrtPriceX64ToPrice(
    poolData.sqrtPrice,
    poolTokenAInfo.decimals,
    poolTokenBInfo.decimals
  );

  return currentPrice;
}
