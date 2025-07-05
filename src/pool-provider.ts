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
import { PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";

export interface PoolProviderParams {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  inputTokenAmount: Decimal; // Amount of the input token to provide
  inputTokenMint: PublicKey; // Which token the amount refers to (tokenA or tokenB)
  lowerPrice: Decimal; // Lower bound of the price range
  upperPrice: Decimal; // Upper bound of the price range
  tickSpacing: number; // Tick spacing for the pool
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
): Promise<PoolProviderResult> {
  const {
    tokenAMint,
    tokenBMint,
    inputTokenAmount,
    inputTokenMint,
    lowerPrice,
    upperPrice,
    tickSpacing,
    slippagePercentage = new Decimal(0.01), // Default 1% slippage
  } = params;

  try {
    // 1. Derive the Whirlpool Pool Address
    const poolAddress = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
      tokenAMint,
      tokenBMint,
      tickSpacing
    );

    console.log("Pool address derived:", poolAddress.publicKey.toBase58());

    // 2. Load the pool
    const client = buildWhirlpoolClient(ctx);
    const pool = await client.getPool(poolAddress.publicKey);
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

    // 5. Initialize tick arrays if needed
    await initializeTickArraysIfNeeded(
      ctx,
      poolAddress.publicKey,
      lowerTick,
      upperTick,
      poolData.tickSpacing
    );

    // 6. Create token extension context
    const tokenExtensionCtx =
      await TokenExtensionUtil.buildTokenExtensionContext(
        ctx.fetcher,
        poolData
      );

    // 7. Create liquidity quote
    const slippageTolerance = Percentage.fromDecimal(slippagePercentage);
    const quote = increaseLiquidityQuoteByInputToken(
      inputTokenMint,
      inputTokenAmount,
      lowerTick,
      upperTick,
      slippageTolerance,
      pool,
      tokenExtensionCtx
    );

    console.log("Liquidity quote:");
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
    const txId = await tx.buildAndExecute();
    console.log("Position opened! Transaction ID:", txId);

    // 10. Get the position account address
    const positionPda = PDAUtil.getPosition(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      positionMint
    );

    return {
      transactionHash: txId,
      positionMint: positionMint.toBase58(),
      positionAddress: positionPda.publicKey.toBase58(),
      poolAddress: poolAddress.publicKey.toBase58(),
      liquidityAmount: quote.liquidityAmount.toString(),
      tokenAAmount: quote.tokenMaxA.toString(),
      tokenBAmount: quote.tokenMaxB.toString(),
    };
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
): Promise<void> {
  const fetcher = ctx.fetcher;

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
    await fetcher.getTickArray(lowerTickArrayPda.publicKey);
    console.log("Lower tick array exists");
  } catch (error) {
    console.log("Initializing lower tick array...");
    const initLowerTickArrayTx = toTx(
      ctx,
      WhirlpoolIx.initTickArrayIx(ctx.program, {
        startTick: lowerTickArrayStartTick,
        tickArrayPda: lowerTickArrayPda,
        whirlpool: poolPublicKey,
        funder: ctx.wallet.publicKey,
      })
    );

    const lowerTxId = await initLowerTickArrayTx.buildAndExecute();
    console.log("Lower tick array initialized:", lowerTxId);
  }

  // Check and initialize upper tick array if needed (only if different from lower)
  if (upperTickArrayStartTick !== lowerTickArrayStartTick) {
    try {
      await fetcher.getTickArray(upperTickArrayPda.publicKey);
      console.log("Upper tick array exists");
    } catch (error) {
      console.log("Initializing upper tick array...");
      const initUpperTickArrayTx = toTx(
        ctx,
        WhirlpoolIx.initTickArrayIx(ctx.program, {
          startTick: upperTickArrayStartTick,
          tickArrayPda: upperTickArrayPda,
          whirlpool: poolPublicKey,
          funder: ctx.wallet.publicKey,
        })
      );

      const upperTxId = await initUpperTickArrayTx.buildAndExecute();
      console.log("Upper tick array initialized:", upperTxId);
    }
  }
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
