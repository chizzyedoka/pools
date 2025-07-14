import { Connection, PublicKey } from "@solana/web3.js";
import {
  buildWhirlpoolClient,
  PDAUtil,
  PriceMath,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
  WhirlpoolContext,
} from "@orca-so/whirlpools-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import Decimal from "decimal.js";

// Your token configuration
const ETH_MINT = NATIVE_MINT;
const USDT_MINT = new PublicKey("CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm");

export interface PoolInfo {
  poolAddress: string;
  tokenA: {
    mint: string;
    symbol: string;
    decimals: number;
  };
  tokenB: {
    mint: string;
    symbol: string;
    decimals: number;
  };
  currentPrice: string;
  sqrtPrice: string;
  tickSpacing: number;
  tvl?: string;
  volume24h?: string;
  fees24h?: string;
}

export async function getEclipsePoolInfo(
  connection: Connection,
  wallet: any,
  tokenAMint: PublicKey = ETH_MINT,
  tokenBMint: PublicKey = USDT_MINT,
  tickSpacing: number = 32
): Promise<PoolInfo | null> {
  try {
    // Setup Whirlpool Context
    const ctx = WhirlpoolContext.from(
      connection,
      wallet,
      ORCA_WHIRLPOOL_PROGRAM_ID
    );

    // Derive the Whirlpool Pool Address
    const poolAddress = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
      tokenAMint,
      tokenBMint,
      tickSpacing
    );

    console.log("Fetching pool data from Eclipse...");
    console.log("Pool address:", poolAddress.publicKey.toBase58());

    // Load the pool
    const client = buildWhirlpoolClient(ctx);
    const pool = await client.getPool(poolAddress.publicKey);
    const poolData = pool.getData();
    const poolTokenAInfo = pool.getTokenAInfo();
    const poolTokenBInfo = pool.getTokenBInfo();

    // Calculate current price
    const currentPrice = PriceMath.sqrtPriceX64ToPrice(
      poolData.sqrtPrice,
      poolTokenAInfo.decimals,
      poolTokenBInfo.decimals
    );

    // Get token symbols (simplified)
    const getTokenSymbol = (mint: string): string => {
      if (mint === NATIVE_MINT.toBase58()) return "ETH";
      if (mint === USDT_MINT.toBase58()) return "USDT";
      return mint.slice(0, 8) + "..."; // Truncated mint for unknown tokens
    };

    const poolInfo: PoolInfo = {
      poolAddress: poolAddress.publicKey.toBase58(),
      tokenA: {
        mint: poolTokenAInfo.mint.toBase58(),
        symbol: getTokenSymbol(poolTokenAInfo.mint.toBase58()),
        decimals: poolTokenAInfo.decimals,
      },
      tokenB: {
        mint: poolTokenBInfo.mint.toBase58(),
        symbol: getTokenSymbol(poolTokenBInfo.mint.toBase58()),
        decimals: poolTokenBInfo.decimals,
      },
      currentPrice: currentPrice.toString(),
      sqrtPrice: poolData.sqrtPrice.toString(),
      tickSpacing: poolData.tickSpacing,
    };

    return poolInfo;
  } catch (error) {
    console.error("Error fetching Eclipse pool info:", error);
    return null;
  }
}

export async function displayEclipsePoolInfo(): Promise<void> {
  const connection = new Connection(
    "https://mainnetbeta-rpc.eclipse.xyz",
    "confirmed"
  );

  // Create a dummy wallet for read-only operations
  const dummyWallet = {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };

  console.log("🌙 Eclipse Orca Pool Information");
  console.log("=================================\n");

  // Try different tick spacings for your token pair
  const tickSpacings = [1, 8, 32, 64, 128];

  for (const tickSpacing of tickSpacings) {
    console.log(`Checking tick spacing: ${tickSpacing}`);

    const poolInfo = await getEclipsePoolInfo(
      connection,
      dummyWallet,
      ETH_MINT,
      USDT_MINT,
      tickSpacing
    );

    if (poolInfo) {
      console.log(`✅ Found pool with tick spacing ${tickSpacing}:`);
      console.log(`   Pool Address: ${poolInfo.poolAddress}`);
      console.log(
        `   Token A: ${poolInfo.tokenA.symbol} (${poolInfo.tokenA.mint})`
      );
      console.log(
        `   Token B: ${poolInfo.tokenB.symbol} (${poolInfo.tokenB.mint})`
      );
      console.log(
        `   Current Price: ${parseFloat(poolInfo.currentPrice).toFixed(6)}`
      );
      console.log(`   Tick Spacing: ${poolInfo.tickSpacing}`);
      console.log("");
    } else {
      console.log(`❌ No pool found with tick spacing ${tickSpacing}\n`);
    }
  }

  console.log(
    "💡 Note: APR calculation requires historical data which may not be available"
  );
  console.log(
    "through direct pool queries. Consider using fee accumulator data or"
  );
  console.log(
    "tracking pool state changes over time to calculate actual yields."
  );
}

// Function to calculate estimated APR based on recent fee data (simplified)
export function estimateAPRFromFees(fees24h: number, tvl: number): number {
  if (tvl === 0) return 0;

  // Annualize the 24h fees
  const annualizedFees = fees24h * 365;

  // Calculate APR as a percentage
  const apr = (annualizedFees / tvl) * 100;

  return apr;
}

// Run the display function if this file is executed directly
if (require.main === module) {
  displayEclipsePoolInfo().catch(console.error);
}
