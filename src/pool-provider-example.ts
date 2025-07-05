import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  WhirlpoolContext,
  ORCA_WHIRLPOOL_PROGRAM_ID,
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";
import bs58 from "bs58";
import dotenv from "dotenv";
import {
  providePoolLiquidity,
  getCurrentPoolPrice,
  PoolProviderParams,
} from "./pool-provider";

// Load environment variables
dotenv.config();

// Token addresses (using the same as in your original code)
const ETH_MINT = NATIVE_MINT;
const USDT_MINT = new PublicKey("CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm");
const TICK_SPACING = 32;

// Initialize connection and wallet
const connection = new Connection(
  "https://mainnetbeta-rpc.eclipse.xyz",
  "confirmed"
);

// Setup wallet
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
  ): Promise<T> => {
    if (tx instanceof Transaction) {
      tx.sign(keypair);
    } else if (tx instanceof VersionedTransaction) {
      tx.sign([keypair]);
    }
    return tx;
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> => {
    return txs.map((tx) => {
      if (tx instanceof Transaction) {
        tx.sign(keypair);
      } else if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      }
      return tx;
    });
  },
};

// Setup Whirlpool Context
const ctx = WhirlpoolContext.from(
  connection,
  wallet,
  ORCA_WHIRLPOOL_PROGRAM_ID
);

async function exampleProvidePoolLiquidity() {
  try {
    console.log("=== Getting Current Pool Price ===");

    // First, get the current pool price to help set reasonable price ranges
    const currentPrice = await getCurrentPoolPrice(
      ctx,
      ETH_MINT,
      USDT_MINT,
      TICK_SPACING
    );
    console.log("Current pool price:", currentPrice.toString());

    console.log("\n=== Providing Pool Liquidity ===");

    // Define the liquidity provision parameters
    const params: PoolProviderParams = {
      tokenAMint: ETH_MINT, // ETH
      tokenBMint: USDT_MINT, // USDT
      inputTokenAmount: new Decimal(0.001), // 0.001 ETH (~$2.58 worth)
      inputTokenMint: ETH_MINT, // We're providing the amount in terms of ETH
      lowerPrice: new Decimal(2400), // Lower price bound
      upperPrice: new Decimal(2800), // Upper price bound
      tickSpacing: TICK_SPACING, // Tick spacing for the pool
      slippagePercentage: new Decimal(0.01), // 1% slippage tolerance
    };

    // Call the pool provider function
    const result = await providePoolLiquidity(ctx, params);

    console.log("\n=== Liquidity Position Created Successfully! ===");
    console.log("Transaction Hash:", result.transactionHash);
    console.log("Position Mint:", result.positionMint);
    console.log("Position Address:", result.positionAddress);
    console.log("Pool Address:", result.poolAddress);
    console.log("Liquidity Amount:", result.liquidityAmount);
    console.log("Token A Amount:", result.tokenAAmount);
    console.log("Token B Amount:", result.tokenBAmount);

    return result;
  } catch (error) {
    console.error("Error in example:", error);
    throw error;
  }
}

// Example function to provide liquidity for any token pair
export async function provideCustomPoolLiquidity(
  tokenAMintAddress: string,
  tokenBMintAddress: string,
  inputAmount: number,
  inputTokenAddress: string,
  lowerPrice: number,
  upperPrice: number,
  tickSpacing: number = 64
): Promise<string> {
  try {
    const tokenAMint = new PublicKey(tokenAMintAddress);
    const tokenBMint = new PublicKey(tokenBMintAddress);
    const inputTokenMint = new PublicKey(inputTokenAddress);

    const params: PoolProviderParams = {
      tokenAMint,
      tokenBMint,
      inputTokenAmount: new Decimal(inputAmount),
      inputTokenMint,
      lowerPrice: new Decimal(lowerPrice),
      upperPrice: new Decimal(upperPrice),
      tickSpacing,
      slippagePercentage: new Decimal(0.01), // 1% slippage
    };

    const result = await providePoolLiquidity(ctx, params);

    console.log(`Pool liquidity provided successfully!`);
    console.log(`Transaction: ${result.transactionHash}`);
    console.log(`Position: ${result.positionMint}`);

    return result.transactionHash;
  } catch (error) {
    console.error("Error providing custom pool liquidity:", error);
    throw error;
  }
}

// Run the example
if (require.main === module) {
  exampleProvidePoolLiquidity().catch(console.error);
}
