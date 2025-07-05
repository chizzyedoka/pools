import {
  buildWhirlpoolClient,
  PDAUtil,
  PriceMath,
  ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
  WhirlpoolContext,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  getAllWhirlpoolAccountsForConfig,
} from "@orca-so/whirlpools-sdk";

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  GetProgramAccountsFilter,
} from "@solana/web3.js";

import { NATIVE_MINT } from "@solana/spl-token";
import Decimal from "decimal.js";
import bs58 from "bs58";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize connection
const connection = new Connection(
  "https://mainnetbeta-rpc.eclipse.xyz",
  "confirmed"
);

// Setup wallet (read-only for discovery)
const secret_key = process.env.WALLET_PRIVATE_KEY;
if (!secret_key) {
  throw new Error("WALLET_PRIVATE_KEY not found in .env file");
}
const secretKeyBase58 = bs58.decode(secret_key);
const keypair = Keypair.fromSecretKey(secretKeyBase58);

const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> => txs,
};

// Setup Whirlpool Context
const ctx = WhirlpoolContext.from(
  connection,
  wallet,
  ORCA_WHIRLPOOL_PROGRAM_ID
);

interface PoolInfo {
  address: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tickSpacing: number;
  currentPrice: string;
  liquidity: string;
  feeRate: string;
  tvl?: string;
}

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
}

// Import { SwapSdk} from ‘@dese…’

// const sdk = new SwapSDK();

// const tokens = await sdk.tokenList()
// Common token registry for Eclipse (you can expand this)
const KNOWN_TOKENS: Record<string, TokenInfo> = {
  [NATIVE_MINT.toBase58()]: {
    mint: NATIVE_MINT.toBase58(),
    symbol: "ETH",
    name: "Ethereum",
    decimals: 9,
  },
  CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm: {
    mint: "CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  },
  // Add more known tokens here as you discover them
};

// need to work on this, ask Zach for help
async function getTokenInfo(mint: string): Promise<TokenInfo> {
  // Check if we have this token in our registry
  if (KNOWN_TOKENS[mint]) {
    return KNOWN_TOKENS[mint];
  }

  // Try to fetch token metadata (this might not work for all tokens)
  try {
    // For unknown tokens, we'll use placeholder info
    return {
      mint,
      symbol: `TOKEN_${mint.slice(0, 4)}`,
      name: `Unknown Token ${mint.slice(0, 8)}`,
      decimals: 9, // Default assumption
    };
  } catch (error) {
    return {
      mint,
      symbol: `UNK_${mint.slice(0, 4)}`,
      name: "Unknown Token",
      decimals: 9,
    };
  }
}

async function getAllWhirlpools(): Promise<PoolInfo[]> {
  console.log("Discovering all Whirlpool pools on Eclipse...");

  try {
    // Use the proper SDK function to get all whirlpool accounts for the config
    console.log("Fetching all Whirlpool accounts using SDK function...");
    console.log("Config ID:", ORCA_WHIRLPOOLS_CONFIG_ECLIPSE.toBase58());

    const whirlpoolAccountsMap = await getAllWhirlpoolAccountsForConfig({
      connection,
      programId: ORCA_WHIRLPOOL_PROGRAM_ID,
      configId: ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
    });

    // Convert Map to array for easier processing
    const whirlpoolEntries = Array.from(whirlpoolAccountsMap.entries());

    console.log(`Found ${whirlpoolEntries.length} Whirlpool accounts`);

    const client = buildWhirlpoolClient(ctx);
    const pools: PoolInfo[] = [];

    for (let i = 0; i < whirlpoolEntries.length; i++) {
      const [addressString, whirlpoolData] = whirlpoolEntries[i];
      const poolAddress = new PublicKey(addressString);
      //console.log(`Whirlpool Data:`, whirlpoolData);

      try {
        console.log(
          `Processing pool ${i + 1}/${
            whirlpoolEntries.length
          }: ${poolAddress.toBase58()}`
        );

        // Try to load the pool
        const pool = await client.getPool(poolAddress);
        const poolData = pool.getData();
        //console.log(`Pool Data:`, poolData);
        const tokenAInfo = pool.getTokenAInfo();
        const tokenBInfo = pool.getTokenBInfo();
        console.log(`Token A:`, tokenAInfo);
        console.log(`Token B:`, tokenBInfo);

        // Get token metadata
        const tokenA = await getTokenInfo(tokenAInfo.mint.toBase58());
        const tokenB = await getTokenInfo(tokenBInfo.mint.toBase58());

        // Calculate current price
        const currentPrice = PriceMath.sqrtPriceX64ToPrice(
          poolData.sqrtPrice,
          tokenAInfo.decimals,
          tokenBInfo.decimals
        );

        // Calculate fee rate (fee rate is in hundredths of a basis point)
        const feeRate = (poolData.feeRate / 10000).toFixed(2) + "%";

        const poolInfo: PoolInfo = {
          address: poolAddress.toBase58(),
          tokenAMint: tokenAInfo.mint.toBase58(),
          tokenBMint: tokenBInfo.mint.toBase58(),
          tokenASymbol: tokenA.symbol,
          tokenBSymbol: tokenB.symbol,
          tickSpacing: poolData.tickSpacing,
          currentPrice: currentPrice.toFixed(6),
          liquidity: poolData.liquidity.toString(),
          feeRate,
        };

        pools.push(poolInfo);

        console.log(
          `${tokenA.symbol}/${tokenB.symbol} - Price: ${poolInfo.currentPrice} - Fee: ${feeRate}`
        );
      } catch (error) {
        console.log(
          `Failed to process account ${poolAddress.toBase58()}: ${error}`
        );
        continue;
      }
    }

    return pools;
  } catch (error) {
    console.error("Error fetching pools:", error);
    throw error;
  }
}

async function displayPoolsSorted(pools: PoolInfo[]) {
  console.log("\n" + "=".repeat(100));
  console.log("ORCA WHIRLPOOL POOLS ON ECLIPSE");
  console.log("=".repeat(100));

  if (pools.length === 0) {
    console.log("No pools found.");
    return;
  }

  // Sort by liquidity (highest first)
  const sortedPools = pools.sort(
    (a, b) => parseInt(b.liquidity) - parseInt(a.liquidity)
  );

  // Display header
  console.log(
    "RANK".padEnd(6) +
      "PAIR".padEnd(20) +
      "PRICE".padEnd(15) +
      "FEE".padEnd(8) +
      "TICK_SPACING".padEnd(15) +
      "LIQUIDITY".padEnd(20) +
      "ADDRESS"
  );
  console.log("-".repeat(100));

  // Display each pool
  sortedPools.forEach((pool, index) => {
    const rank = (index + 1).toString().padEnd(6);
    const pair = `${pool.tokenASymbol}/${pool.tokenBSymbol}`.padEnd(20);
    const price = pool.currentPrice.padEnd(15);
    const fee = pool.feeRate.padEnd(8);
    const tickSpacing = pool.tickSpacing.toString().padEnd(15);
    const liquidity = pool.liquidity.padEnd(20);
    const address = pool.address;

    console.log(
      `${rank}${pair}${price}${fee}${tickSpacing}${liquidity}${address}`
    );
  });

  console.log("\n SUMMARY:");
  console.log(`Total pools found: ${pools.length}`);
  console.log(
    `Unique token pairs: ${
      new Set(pools.map((p) => `${p.tokenASymbol}/${p.tokenBSymbol}`)).size
    }`
  );

  // Group by fee rates
  const feeGroups = pools.reduce((acc, pool) => {
    acc[pool.feeRate] = (acc[pool.feeRate] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("\n Fee Rate Distribution:");
  Object.entries(feeGroups).forEach(([fee, count]) => {
    console.log(`  ${fee}: ${count} pools`);
  });
}

async function main() {
  try {
    console.log("Starting Orca Pool Discovery on Eclipse Network");
    console.log(`RPC: https://mainnetbeta-rpc.eclipse.xyz`);
    console.log(`Program ID: ${ORCA_WHIRLPOOL_PROGRAM_ID.toBase58()}\n`);

    const startTime = Date.now();
    const pools = await getAllWhirlpools();
    const endTime = Date.now();

    await displayPoolsSorted(pools);

    console.log(
      `\nDiscovery completed in ${((endTime - startTime) / 1000).toFixed(
        2
      )} seconds`
    );

    // Save to JSON file for further analysis
    const fs = require("fs");
    const outputFile = "eclipse-orca-pools.json";
    fs.writeFileSync(outputFile, JSON.stringify(pools, null, 2));
    console.log(`Pool data saved to ${outputFile}`);
  } catch (error) {
    console.error("Error in pool discovery:", error);
  }
}

// Export for use in other scripts
export { getAllWhirlpools, PoolInfo, TokenInfo };

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
