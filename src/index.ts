import {
  buildWhirlpoolClient,
  PDAUtil,
  PriceMath,
  TickUtil,
  ORCA_WHIRLPOOLS_CONFIG,
  WhirlpoolContext,
  ORCA_WHIRLPOOL_PROGRAM_ID,
} from "@orca-so/whirlpools-sdk";

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import { NATIVE_MINT } from "@solana/spl-token";

import Decimal from "decimal.js";

const ETH_MINT = NATIVE_MINT;
const USDC_MINT = new PublicKey("CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm");
const TICK_SPACING = 64;

// Initialize connection and wallet
const connection = new Connection(
  "https://mainnetbeta-rpc.eclipse.xyz",
  "confirmed"
);

const wallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> => txs,
};

// 1. Setup Whirlpool Context
const ctx = WhirlpoolContext.from(
  connection,
  wallet,
  ORCA_WHIRLPOOL_PROGRAM_ID
);
const fetcher = ctx.fetcher;

async function main() {
  try {
    // 2. Derive the Whirlpool Pool Address
    const poolAddress = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOLS_CONFIG,
      ETH_MINT,
      USDC_MINT,
      TICK_SPACING
    );

    console.log("Pool address derived:", poolAddress.publicKey.toBase58());

    // 3. Load the pool
    const client = buildWhirlpoolClient(ctx);
    const pool = await client.getPool(poolAddress.publicKey);

    const poolData = pool.getData();
    const poolTokenAInfo = pool.getTokenAInfo();
    const poolTokenBInfo = pool.getTokenBInfo();

    console.log("Pool loaded successfully!");
    console.log("Token A:", poolTokenAInfo.mint.toBase58());
    console.log("Token B:", poolTokenBInfo.mint.toBase58());

    // 4. Define tick range for price between 98 and 150
    const tokenADecimal = poolTokenAInfo.decimals;
    const tokenBDecimal = poolTokenBInfo.decimals;

    const lowerTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(new Decimal(98), tokenADecimal, tokenBDecimal),
      poolData.tickSpacing
    );
    const upperTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(
        new Decimal(150),
        tokenADecimal,
        tokenBDecimal
      ),
      poolData.tickSpacing
    );

    console.log("Lower tick:", lowerTick);
    console.log("Upper tick:", upperTick);

    // 5. Check if tick arrays need to be initialized
    const lowerTickArrayStartTick = TickUtil.getStartTickIndex(
      lowerTick,
      poolData.tickSpacing
    );
    const upperTickArrayStartTick = TickUtil.getStartTickIndex(
      upperTick,
      poolData.tickSpacing
    );

    console.log("Lower tick array start:", lowerTickArrayStartTick);
    console.log("Upper tick array start:", upperTickArrayStartTick);

    // 6. Get tick array PDAs
    const lowerTickArrayPda = PDAUtil.getTickArray(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      poolAddress.publicKey,
      lowerTickArrayStartTick
    );

    const upperTickArrayPda = PDAUtil.getTickArray(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      poolAddress.publicKey,
      upperTickArrayStartTick
    );

    console.log(
      "Lower tick array PDA:",
      lowerTickArrayPda.publicKey.toBase58()
    );
    console.log(
      "Upper tick array PDA:",
      upperTickArrayPda.publicKey.toBase58()
    );

    // 7. Check if tick arrays exist
    try {
      const lowerTickArray = await fetcher.getTickArray(
        lowerTickArrayPda.publicKey
      );
      console.log("Lower tick array exists:", !!lowerTickArray);
    } catch (error) {
      console.log("Lower tick array does not exist yet");
    }

    try {
      const upperTickArray = await fetcher.getTickArray(
        upperTickArrayPda.publicKey
      );
      console.log("Upper tick array exists:", !!upperTickArray);
    } catch (error) {
      console.log("Upper tick array does not exist yet");
    }

    // 8. Prepare for position opening
    console.log("\n=== Position Opening Setup Complete ===");
    console.log("Pool:", poolAddress.publicKey.toBase58());
    console.log("Price range: $98 - $150");
    console.log("Lower tick:", lowerTick);
    console.log("Upper tick:", upperTick);
    console.log("\nTo open a position, you would:");
    console.log("1. Initialize tick arrays if needed");
    console.log(
      "2. Call pool.openPosition() with tick range and liquidity quote"
    );
    console.log("3. Execute the transaction");
  } catch (error) {
    console.error("Error in main:", error);
  }
}

// Example function to demonstrate actual position opening
// Note: This is commented out as it requires actual tokens and would execute a transaction
async function openPositionExample() {
  /*
  // This is how you would actually open a position:
  
  try {
    const poolAddress = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOLS_CONFIG,
      ETH_MINT,
      USDC_MINT,
      TICK_SPACING
    );

    const client = buildWhirlpoolClient(ctx);
    const pool = await client.getPool(poolAddress.publicKey);
    const poolData = pool.getData();
    const poolTokenAInfo = pool.getTokenAInfo();
    const poolTokenBInfo = pool.getTokenBInfo();

    // Define tick range
    const lowerTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(new Decimal(98), poolTokenAInfo.decimals, poolTokenBInfo.decimals),
      poolData.tickSpacing
    );
    const upperTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(new Decimal(150), poolTokenAInfo.decimals, poolTokenBInfo.decimals),
      poolData.tickSpacing
    );

    // Create a simple quote object for minimal liquidity
    const quote = {
      tokenMaxA: new BN(1000000), // Small amount for testing
      tokenMaxB: new BN(1000000),
      liquidityAmount: new BN(1000)
    };

    // Open position
    const { positionMint, tx } = await pool.openPosition(
      lowerTick,
      upperTick,
      quote
    );

    console.log("Position mint:", positionMint.toBase58());
    
    // Execute the transaction
    const txId = await tx.buildAndExecute();
    console.log("Transaction executed:", txId);

    // Get the position account
    const positionPda = PDAUtil.getPosition(ORCA_WHIRLPOOL_PROGRAM_ID, positionMint);
    const position = await client.getPosition(positionPda.publicKey);
    
    console.log("Position opened successfully!");
    console.log("Position address:", positionPda.publicKey.toBase58());
    
  } catch (error) {
    console.error("Error opening position:", error);
  }
  */
}

// Call the main function
main().catch(console.error);
