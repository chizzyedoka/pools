// import { Connection, PublicKey } from "@solana/web3.js";
// import { getMint } from "@solana/spl-token";
// import { Metaplex } from "@metaplex-foundation/js";
// import dotenv from "dotenv";

// // Load environment variables
// dotenv.config();

// // Initialize connection
// const connection = new Connection(
//   "https://mainnetbeta-rpc.eclipse.xyz",
//   "confirmed"
// );

// type PoolStats = {
//   volume: string;
//   fees: string;
//   rewards: string | null;
//   yieldOverTvl: string;
// };

// type OrcaPool = {
//   address: string;
//   yieldOverTvl: string;
//   stats: {
//     "24h": PoolStats;
//     "7d": PoolStats;
//     "30d": PoolStats;
//   };
//   [key: string]: any;
// };

// type EnhancedPoolInfo = {
//   address: string;
//   tokenAMint: string;
//   tokenBMint: string;
//   tokenASymbol: string;
//   tokenBSymbol: string;
//   tokenAName: string;
//   tokenBName: string;
//   tokenADecimals: number;
//   tokenBDecimals: number;
//   tickSpacing: number;
//   currentPrice: string;
//   liquidity: string;
//   feeRate: string;
//   tvl: string;
//   apr: number;
//   apy: number;
//   volume24h: string;
//   fees24h: string;
//   volume7d: string;
//   fees7d: string;
//   volume30d: string;
//   fees30d: string;
//   yieldOverTvl: string;
// };

// interface TokenInfo {
//   mint: PublicKey;
//   symbol: string;
//   name: string;
//   decimals: number;
// }

// async function getTokenInfo(
//   mint: PublicKey,
//   tokenProgramId?: PublicKey
// ): Promise<TokenInfo> {
//   const metaplex = Metaplex.make(connection);
//   let tokenName = "Unknown";
//   let tokenSymbol = "UNK";

//   try {
//     const metadataAccount = metaplex.nfts().pdas().metadata({ mint });
//     const metadataAccountInfo = await connection.getAccountInfo(
//       metadataAccount
//     );

//     if (metadataAccountInfo) {
//       const token = await metaplex.nfts().findByMint({ mintAddress: mint });
//       tokenName = token.name || "Unknown";
//       tokenSymbol = token.symbol || "UNK";
//     }

//     const tokenMintDetails = await getMint(
//       connection,
//       mint,
//       "confirmed",
//       tokenProgramId
//     );

//     return {
//       mint: tokenMintDetails.address,
//       symbol: tokenSymbol,
//       name: tokenName,
//       decimals: tokenMintDetails.decimals,
//     };
//   } catch (error) {
//     console.warn(`Failed to get token info for ${mint.toBase58()}: ${error}`);
//     return {
//       mint,
//       symbol: tokenSymbol,
//       name: tokenName,
//       decimals: 9, // Default assumption
//     };
//   }
// }

// async function fetchPoolsWithAprApy(): Promise<
//   (OrcaPool & { apr: number; apy: number })[]
// > {
//   console.log("Fetching pools from Orca API...");

//   try {
//     const response = await fetch("https://api.orca.so/v2/eclipse/pools");

//     if (!response.ok) {
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     const data = await response.json();

//     if (!Array.isArray(data)) {
//       throw new Error("Unexpected API response format");
//     }

//     console.log(`Found ${data.length} pools from Orca API`);

//     return data.map((pool: OrcaPool) => {
//       const dailyYieldStr =
//         pool.stats?.["24h"]?.yieldOverTvl ?? pool.yieldOverTvl;
//       const dailyYield = parseFloat(dailyYieldStr || "0");

//       const apr = dailyYield * 365;
//       const apy = Math.pow(1 + dailyYield, 365) - 1;

//       return {
//         ...pool,
//         apr: parseFloat((apr * 100).toFixed(4)), // As percentage
//         apy: parseFloat((apy * 100).toFixed(4)), // As percentage
//       };
//     });
//   } catch (error) {
//     console.error("Error fetching pools from Orca API:", error);
//     throw error;
//   }
// }

// async function getEnhancedPoolInfo(): Promise<EnhancedPoolInfo[]> {
//   console.log("Discovering all Orca pools with enhanced data from API...");

//   try {
//     const poolsWithAprApy = await fetchPoolsWithAprApy();
//     const enhancedPools: EnhancedPoolInfo[] = [];

//     for (let i = 0; i < poolsWithAprApy.length; i++) {
//       const pool = poolsWithAprApy[i];

//       try {
//         console.log(
//           `Processing pool ${i + 1}/${poolsWithAprApy.length}: ${pool.address}`
//         );

//         // Extract token mints from the pool data
//         const tokenAMint = new PublicKey(pool.tokenA?.mint || pool.mintA);
//         const tokenBMint = new PublicKey(pool.tokenB?.mint || pool.mintB);

//         // Get token metadata
//         const tokenA = await getTokenInfo(tokenAMint);
//         const tokenB = await getTokenInfo(tokenBMint);

//         console.log(`Token A: ${tokenA.symbol} (${tokenA.name})`);
//         console.log(`Token B: ${tokenB.symbol} (${tokenB.name})`);

//         const enhancedPool: EnhancedPoolInfo = {
//           address: pool.address,
//           tokenAMint: tokenAMint.toBase58(),
//           tokenBMint: tokenBMint.toBase58(),
//           tokenASymbol: tokenA.symbol,
//           tokenBSymbol: tokenB.symbol,
//           tokenAName: tokenA.name,
//           tokenBName: tokenB.name,
//           tokenADecimals: tokenA.decimals,
//           tokenBDecimals: tokenB.decimals,
//           tickSpacing: pool.tickSpacing || 0,
//           currentPrice: pool.price?.toString() || "0",
//           liquidity: pool.liquidity?.toString() || "0",
//           feeRate: pool.feeRate
//             ? `${(pool.feeRate / 10000).toFixed(2)}%`
//             : "0%",
//           tvl: pool.tvl?.toString() || "0",
//           apr: pool.apr,
//           apy: pool.apy,
//           volume24h: pool.stats?.["24h"]?.volume || "0",
//           fees24h: pool.stats?.["24h"]?.fees || "0",
//           volume7d: pool.stats?.["7d"]?.volume || "0",
//           fees7d: pool.stats?.["7d"]?.fees || "0",
//           volume30d: pool.stats?.["30d"]?.volume || "0",
//           fees30d: pool.stats?.["30d"]?.fees || "0",
//           yieldOverTvl: pool.yieldOverTvl || "0",
//         };

//         enhancedPools.push(enhancedPool);

//         console.log(
//           `${tokenA.symbol}/${tokenB.symbol} - APR: ${pool.apr.toFixed(
//             2
//           )}% - APY: ${pool.apy.toFixed(2)}% - TVL: ${enhancedPool.tvl}`
//         );
//       } catch (error) {
//         console.warn(`Failed to process pool ${pool.address}: ${error}`);
//         continue;
//       }
//     }

//     return enhancedPools;
//   } catch (error) {
//     console.error("Error getting enhanced pool info:", error);
//     throw error;
//   }
// }

// async function displayEnhancedPoolsSorted(pools: EnhancedPoolInfo[]) {
//   console.log("\n" + "=".repeat(120));
//   console.log("ORCA WHIRLPOOL POOLS ON ECLIPSE (Enhanced with API Data)");
//   console.log("=".repeat(120));

//   if (pools.length === 0) {
//     console.log("No pools found.");
//     return;
//   }

//   // Sort by APR (highest first)
//   const sortedPools = pools.sort((a, b) => b.apr - a.apr);

//   // Display header
//   console.log(
//     "RANK".padEnd(6) +
//       "PAIR".padEnd(20) +
//       "APR".padEnd(10) +
//       "APY".padEnd(10) +
//       "TVL".padEnd(15) +
//       "VOL_24H".padEnd(15) +
//       "FEE".padEnd(8) +
//       "ADDRESS"
//   );
//   console.log("-".repeat(120));

//   // Display each pool
//   sortedPools.forEach((pool, index) => {
//     const rank = (index + 1).toString().padEnd(6);
//     const pair = `${pool.tokenASymbol}/${pool.tokenBSymbol}`.padEnd(20);
//     const apr = `${pool.apr.toFixed(2)}%`.padEnd(10);
//     const apy = `${pool.apy.toFixed(2)}%`.padEnd(10);
//     const tvl = formatNumber(pool.tvl).padEnd(15);
//     const volume24h = formatNumber(pool.volume24h).padEnd(15);
//     const fee = pool.feeRate.padEnd(8);
//     const address = pool.address;

//     console.log(`${rank}${pair}${apr}${apy}${tvl}${volume24h}${fee}${address}`);
//   });

//   console.log("\nSUMMARY:");
//   console.log(`Total pools found: ${pools.length}`);
//   console.log(
//     `Unique token pairs: ${
//       new Set(pools.map((p) => `${p.tokenASymbol}/${p.tokenBSymbol}`)).size
//     }`
//   );

//   // APR distribution
//   const aprRanges = {
//     "0-1%": 0,
//     "1-5%": 0,
//     "5-10%": 0,
//     "10-25%": 0,
//     "25%+": 0,
//   };

//   pools.forEach((pool) => {
//     if (pool.apr < 1) aprRanges["0-1%"]++;
//     else if (pool.apr < 5) aprRanges["1-5%"]++;
//     else if (pool.apr < 10) aprRanges["5-10%"]++;
//     else if (pool.apr < 25) aprRanges["10-25%"]++;
//     else aprRanges["25%+"]++;
//   });

//   console.log("\nAPR Distribution:");
//   Object.entries(aprRanges).forEach(([range, count]) => {
//     console.log(`  ${range}: ${count} pools`);
//   });

//   // Calculate total TVL
//   const totalTvl = pools.reduce(
//     (sum, pool) => sum + parseFloat(pool.tvl || "0"),
//     0
//   );
//   console.log(
//     `\nTotal TVL across all pools: ${formatNumber(totalTvl.toString())}`
//   );

//   // Calculate total 24h volume
//   const totalVolume24h = pools.reduce(
//     (sum, pool) => sum + parseFloat(pool.volume24h || "0"),
//     0
//   );
//   console.log(`Total 24h Volume: ${formatNumber(totalVolume24h.toString())}`);
// }

// function formatNumber(value: string): string {
//   const num = parseFloat(value);
//   if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
//   if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
//   if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
//   return `$${num.toFixed(2)}`;
// }

// async function main() {
//   try {
//     console.log("Starting Enhanced Orca Pool Discovery on Eclipse Network");
//    fetchPoolsWithAprApy()

//     // Save to JSON file for further analysis
//     // const fs = require("fs");
//     // const outputFile = "eclipse-orca-pools-enhanced.json";
//     // fs.writeFileSync(outputFile, JSON.stringify(pools, null, 2));
//     // console.log(`Enhanced pool data saved to ${outputFile}`);

//     // Also save just the APR/APY data
//     // const aprApyData = pools.map((pool) => ({
//     //   address: pool.address,
//     //   pair: `${pool.tokenASymbol}/${pool.tokenBSymbol}`,
//     //   apr: pool.apr,
//     //   apy: pool.apy,
//     //   tvl: pool.tvl,
//     //   volume24h: pool.volume24h,
//     // }));
//     // const aprApyFile = "eclipse-orca-pools-apr-apy.json";
//     // fs.writeFileSync(aprApyFile, JSON.stringify(aprApyData, null, 2));
//     // console.log(`APR/APY data saved to ${aprApyFile}`);
//   } catch (error) {
//     console.error("Error in enhanced pool discovery:", error);
//   }
// }

// // Export for use in other scripts
// export {
//   fetchPoolsWithAprApy,
//   getEnhancedPoolInfo,
//   type EnhancedPoolInfo,
//   type OrcaPool,
//   type PoolStats,
// };

// // Run if this file is executed directly
// if (require.main === module) {
//   main().catch(console.error);
// }

type PoolStats = {
  volume: string;
  fees: string;
  rewards: string | null;
  yieldOverTvl: string;
};

type TokenInfo = {
  address: string;
  programId: string;
  imageUrl: string;
  name: string;
  symbol: string;
  decimals: number;
  tags: string[];
};

type OrcaPool = {
  address: string;
  whirlpoolsConfig: string;
  whirlpoolBump: number[];
  tickSpacing: number;
  tickSpacingSeed: number[];
  feeRate: number;
  protocolFeeRate: number;
  liquidity: string;
  sqrtPrice: string;
  tickCurrentIndex: number;
  protocolFeeOwedA: string;
  protocolFeeOwedB: string;
  tokenMintA: string;
  tokenVaultA: string;
  feeGrowthGlobalA: string;
  tokenMintB: string;
  tokenVaultB: string;
  feeGrowthGlobalB: string;
  rewardLastUpdatedTimestamp: string;
  updatedAt: string;
  updatedSlot: number;
  writeVersion: number;
  hasWarning: boolean;
  poolType: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  price: string;
  tvlUsdc: string;
  yieldOverTvl: string;
  tokenBalanceA: string;
  tokenBalanceB: string;
  stats: {
    "24h": PoolStats;
    "7d": PoolStats;
    "30d": PoolStats;
  };
  rewards: any[];
  lockedLiquidityPercent: any[];
  feeTierIndex: number;
  adaptiveFeeEnabled: boolean;
  adaptiveFee: any;
  tradeEnableTimestamp: string;
};

async function fetchPoolsWithAprApy(): Promise<
  (OrcaPool & { apr: number; apy: number })[]
> {
  console.log("Fetching pools from Orca API...");

  try {
    const response = await fetch("https://api.orca.so/v2/eclipse/pools");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();

    // The API wraps the pools in a 'data' property
    const pools = responseData.data;

    if (!Array.isArray(pools)) {
      throw new Error("Unexpected API response format - data is not an array");
    }

    console.log(`Found ${pools.length} pools from Orca API`);

    return pools.map((pool: any) => {
      const dailyYieldStr =
      pool.stats?.["24h"]?.yieldOverTvl ?? pool.yieldOverTvl;
      const dailyYield = parseFloat(dailyYieldStr || "0");

      const apr = dailyYield * 365;
      const apy = Math.pow(1 + dailyYield, 365) - 1;

      return {
        ...pool,
        apr: parseFloat((apr * 100).toFixed(4)), // As percentage
        apy: parseFloat((apy * 100).toFixed(4)), // As percentage
      };
    });
  } catch (error) {
    console.error("Error fetching pools from Orca API:", error);
    throw error;
  }
}

// Export for use in other scripts
export { fetchPoolsWithAprApy, type OrcaPool, type PoolStats, type TokenInfo };

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

function displayPoolsSorted(
  pools: (OrcaPool & { apr: number; apy: number })[]
) {
  console.log("\n" + "=".repeat(120));
  console.log("ORCA WHIRLPOOL POOLS ON ECLIPSE (API Data)");
  console.log("=".repeat(120));

  if (pools.length === 0) {
    console.log("No pools found.");
    return;
  }

  // Sort by APR (highest first)
  const sortedPools = pools.sort((a, b) => b.apr - a.apr);

  // Display header
  console.log(
    "RANK".padEnd(6) +
      "PAIR".padEnd(20) +
      "APR".padEnd(10) +
      "APY".padEnd(10) +
      "TVL".padEnd(15) +
      "VOL_24H".padEnd(15) +
      "FEE".padEnd(8) +
      "ADDRESS"
  );
  console.log("-".repeat(120));

  // Display each pool
  sortedPools.forEach((pool, index) => {
    const rank = (index + 1).toString().padEnd(6);
    const pair = `${pool.tokenA.symbol}/${pool.tokenB.symbol}`.padEnd(20);
    const apr = `${pool.apr.toFixed(2)}%`.padEnd(10);
    const apy = `${pool.apy.toFixed(2)}%`.padEnd(10);
    const tvl = formatNumber(pool.tvlUsdc).padEnd(15);
    const volume24h = formatNumber(pool.stats["24h"].volume).padEnd(15);
    const fee = `${(pool.feeRate / 10000).toFixed(2)}%`.padEnd(8);
    const address = pool.address;

    console.log(`${rank}${pair}${apr}${apy}${tvl}${volume24h}${fee}${address}`);
  });

  console.log("\nSUMMARY:");
  console.log(`Total pools found: ${pools.length}`);
  console.log(
    `Unique token pairs: ${
      new Set(pools.map((p) => `${p.tokenA.symbol}/${p.tokenB.symbol}`)).size
    }`
  );

  // Calculate total TVL
  const totalTvl = pools.reduce(
    (sum, pool) => sum + parseFloat(pool.tvlUsdc || "0"),
    0
  );
  console.log(
    `Total TVL across all pools: ${formatNumber(totalTvl.toString())}`
  );

  // Calculate total 24h volume
  const totalVolume24h = pools.reduce(
    (sum, pool) => sum + parseFloat(pool.stats["24h"].volume || "0"),
    0
  );
  console.log(`Total 24h Volume: ${formatNumber(totalVolume24h.toString())}`);

  // APR distribution
  const aprRanges = {
    "0-1%": 0,
    "1-5%": 0,
    "5-10%": 0,
    "10-25%": 0,
    "25%+": 0,
  };

  pools.forEach((pool) => {
    if (pool.apr < 1) aprRanges["0-1%"]++;
    else if (pool.apr < 5) aprRanges["1-5%"]++;
    else if (pool.apr < 10) aprRanges["5-10%"]++;
    else if (pool.apr < 25) aprRanges["10-25%"]++;
    else aprRanges["25%+"]++;
  });

  console.log("\nAPR Distribution:");
  Object.entries(aprRanges).forEach(([range, count]) => {
    console.log(`  ${range}: ${count} pools`);
  });
}

function formatNumber(value: string): string {
  const num = parseFloat(value);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

async function main(): Promise<void> {
  try {
    console.log("Starting Enhanced Orca Pool Discovery on Eclipse Network");
    const pools = await fetchPoolsWithAprApy();

    displayPoolsSorted(pools);

    // Save to JSON file
    const fs = require("fs");
    const outputFile = "eclipse-orca-pools-api.json";
    fs.writeFileSync(outputFile, JSON.stringify(pools, null, 2));
    console.log(`\nPool data saved to ${outputFile}`);
  } catch (error) {
    console.error("Error in main:", error);
  }
}
