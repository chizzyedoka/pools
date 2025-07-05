import {
  buildWhirlpoolClient,
  PDAUtil,
  PriceMath,
  TickUtil,
  ORCA_WHIRLPOOLS_CONFIG,
  WhirlpoolContext,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  WhirlpoolIx,
  toTx,
  ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
  increaseLiquidityQuoteByInputToken,
  TokenExtensionUtil,
} from "@orca-so/whirlpools-sdk";
import { Percentage } from "@orca-so/common-sdk";

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import { NATIVE_MINT } from "@solana/spl-token";

import Decimal from "decimal.js";
import bs58 from "bs58";
import dotenv from "dotenv";

const ETH_MINT = NATIVE_MINT;
const USDT_MINT = new PublicKey("CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm");
const TICK_SPACING_ARRAY = []
const TICK_SPACING = 32;

// Initialize connection and wallet
const connection = new Connection(
  "https://mainnetbeta-rpc.eclipse.xyz",
  "confirmed"
);

// Load environment variables
dotenv.config();
// Ensure WALLET_PRIVATE_KEY is set in your .env file
const secret_key = process.env.WALLET_PRIVATE_KEY;
if (!secret_key) {
  throw new Error("WALLET_PRIVATE_KEY not found in .env file");
}
// decode base58 secret key
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
    return txs.map(tx => {
      if (tx instanceof Transaction) {
        tx.sign(keypair);
      } else if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      }
      return tx;
    });
  },
};

// 1. Setup Whirlpool Context
const ctx = WhirlpoolContext.from(
  connection,
  wallet,
  ORCA_WHIRLPOOL_PROGRAM_ID
);
const fetcher = ctx.fetcher;

async function main() {
    // fetch tick array spacing
    
  try {
    // 2. Derive the Whirlpool Pool Address
    const poolAddress = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOLS_CONFIG_ECLIPSE,
      ETH_MINT,
      USDT_MINT,
      TICK_SPACING
    );

    console.log("Pool address derived:", poolAddress.publicKey.toBase58());

    // 3. Load the pool
    const client = buildWhirlpoolClient(ctx);
    // console.log(client)
    const pool = await client.getPool(poolAddress.publicKey);
    console.log(`pool is ${pool}`)
    console.log("Pool loaded:", poolAddress.publicKey.toBase58());

    const poolData = pool.getData();
    const poolTokenAInfo = pool.getTokenAInfo();
    const poolTokenBInfo = pool.getTokenBInfo();

    console.log("Pool loaded successfully!");
    console.log("Token A:", poolTokenAInfo.mint.toBase58());
    console.log("Token B:", poolTokenBInfo.mint.toBase58());

    // // 4. Define tick range for price between 
    const tokenADecimal = poolTokenAInfo.decimals;
    const tokenBDecimal = poolTokenBInfo.decimals;
    console.log("Token A decimals:", tokenADecimal);
    console.log("Token B decimals:", tokenBDecimal);

     // check pool current price
    const currentPrice = PriceMath.sqrtPriceX64ToPrice(poolData.sqrtPrice, tokenADecimal, tokenBDecimal);
    console.log("Current pool price:", currentPrice.toString());

    const lowerTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(new Decimal(2400), tokenADecimal, tokenBDecimal),
      poolData.tickSpacing
    );
    const upperTick = TickUtil.getInitializableTickIndex(
      PriceMath.priceToTickIndex(
        new Decimal(2800),
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

    // 7. Check if tick arrays exist and initialize if needed
    try {
      const lowerTickArray = await fetcher.getTickArray(
        lowerTickArrayPda.publicKey
      );
      console.log("Lower tick array exists:", !!lowerTickArray);
    } catch (error) {
      console.log("Lower tick array does not exist yet - initializing...");
      // Initialize the lower tick array
      const initLowerTickArrayTx = toTx(
        ctx,
        WhirlpoolIx.initTickArrayIx(ctx.program, {
          startTick: lowerTickArrayStartTick,
          tickArrayPda: lowerTickArrayPda,
          whirlpool: poolAddress.publicKey,
          funder: ctx.wallet.publicKey,
        })
      );

      console.log("Executing lower tick array initialization...");
      const lowerTxId = await initLowerTickArrayTx.buildAndExecute();
      console.log("Lower tick array initialized:", lowerTxId);
    }

    try {
      const upperTickArray = await fetcher.getTickArray(
        upperTickArrayPda.publicKey
      );
      console.log("Upper tick array exists:", !!upperTickArray);
    } catch (error) {
      console.log("Upper tick array does not exist yet - initializing...");
      // Initialize the upper tick array
      const initUpperTickArrayTx = toTx(
        ctx,
        WhirlpoolIx.initTickArrayIx(ctx.program, {
          startTick: upperTickArrayStartTick,
          tickArrayPda: upperTickArrayPda,
          whirlpool: poolAddress.publicKey,
          funder: ctx.wallet.publicKey,
        })
      );

      console.log("Executing upper tick array initialization...");
      const upperTxId = await initUpperTickArrayTx.buildAndExecute();
      console.log("Upper tick array initialized:", upperTxId);
    }
   // 9. Create a liquidity quote for your $2 worth of tokens
const inputTokenAmount = new Decimal(0.001); // Small amount of ETH (~$2.58 worth)
const slippageTolerance = Percentage.fromDecimal(new Decimal(0.01)); // 1% slippage
//const slippageTolerance = new Decimal(0.01); // 1% slippage

const tokenExtensionCtx = await TokenExtensionUtil.buildTokenExtensionContext(
  fetcher,
  poolData
);

// Create the liquidity quote using the input token amount
const quote = increaseLiquidityQuoteByInputToken(
  poolTokenAInfo.mint, // ETH mint
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

// 10. Open position with liquidity
console.log("\n=== Opening Position ===");
const { positionMint, tx } = await pool.openPosition(
  lowerTick,
  upperTick,
  quote
);

console.log("Position mint address:", positionMint.toBase58());
console.log("Executing position opening transaction...");

// Execute the transaction
const txId = await tx.buildAndExecute();
console.log("Position opened! Transaction ID:", txId);

// 11. Get the position account for verification
const positionPda = PDAUtil.getPosition(ORCA_WHIRLPOOL_PROGRAM_ID, positionMint);
console.log("Position PDA:", positionPda.publicKey.toBase58());

console.log("\n Position successfully created!");
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
      USDT_MINT,
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
