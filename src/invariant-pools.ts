import { Market, Network, Pair } from "@invariant-labs/sdk-eclipse";
import {
  getMaxTick,
  getPositionInitData,
} from "@invariant-labs/sdk-eclipse/lib/utils";
import { connection, keypair } from ".";
import {
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import Decimal from "decimal.js";
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  getLiquidity,
  priceToTick,
} from "@invariant-labs/sdk-eclipse/lib/math";

const userInput = {
  lowerPrice: new Decimal(2000),
  upperPrice: new Decimal(3500),
  poolAddress: new PublicKey("Gbh1hnnMUoJKawHUikzQukFgkTr4rHqU4gGqTM7bjT6k"),
  publickKey: keypair.publicKey,
  tokenXAmount: new Decimal(2.5), // ~$2.5 worth of USDT
  tokenYAmount: new Decimal(0.001), // $2.5 worth of ETH
};

// function priceToTick(price: Decimal, tickSpacing: number): number {
//   // This is a simplified calculation - Invariant has specific formulas
//   // The actual formula involves logarithms and the pool's configuration
//   const logPrice = Math.log(price.toNumber());
//   const tick = Math.floor(logPrice / Math.log(1.0001)); // 1.0001 is the tick spacing factor
//   // Round to nearest valid tick based on tick spacing
//   return Math.floor(tick / tickSpacing) * tickSpacing;
// }

export let market: Market | undefined = undefined;
export function initializeInvariantMarket(): Market {
  const marketInit = Market.build(
    Network.MAIN as any, // Use string instead of Network enum
    keypair as any, // Use keypair directly
    connection,
    new PublicKey("iNvTyprs4TX8m6UeUEkeqDFjAL9zRCRWcexK9Sd4WEU") // Invariant program ID on Eclipse
  );

  console.log("Invariant market initialized");
  market = marketInit;

  return marketInit;
}

const main = async () => {
  if (!market) {
    market = initializeInvariantMarket();
  }
  // //get the ticks

  // market.createPositionIx()
  // const response = await fetch(
  //   "https://stats.invariant.app/eclipse/intervals/eclipse-mainnet?interval=daily"
  // );
  // const data = await response.json();
  // console.log("Data fetched:", data.poolsData);

  const poolAddress = new PublicKey(
    "Gbh1hnnMUoJKawHUikzQukFgkTr4rHqU4gGqTM7bjT6k"
  ); // eth- usdt

  const pool = await market.getPoolByAddress(poolAddress);
  console.log(pool);
  // construct pair from pool
  const feeTier = {
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
  };
  const pair = new Pair(pool.tokenX, pool.tokenY, feeTier);

  // create associated token accounts for the tokens if they don't exist
  let userTokenXAddress;
  let userTokenYAddress;
  let mintX;
  let mintY;
  let tokenXProgramId = TOKEN_PROGRAM_ID;
  let tokenYProgramId = TOKEN_PROGRAM_ID;

  userTokenXAddress = getAssociatedTokenAddressSync(
    pair.tokenX,
    userInput.publickKey,
    true,
    TOKEN_PROGRAM_ID
  );
  mintX = await connection.getAccountInfo(userTokenXAddress);
  console.log(mintX);
  if (!mintX) {
    userTokenXAddress = getAssociatedTokenAddressSync(
      pair.tokenX,
      userInput.publickKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    tokenXProgramId = TOKEN_2022_PROGRAM_ID;
  }
  userTokenYAddress = getAssociatedTokenAddressSync(
    pair.tokenY,
    userInput.publickKey,
    true,
    TOKEN_PROGRAM_ID
  );
  mintY = await connection.getAccountInfo(userTokenYAddress);
  console.log(mintY);
  if (!mintY) {
    userTokenYAddress = getAssociatedTokenAddressSync(
      pair.tokenY, // Fixed: was using pair.tokenX
      userInput.publickKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    tokenYProgramId = TOKEN_2022_PROGRAM_ID;
  }

  const instructions: TransactionInstruction[] = [];
  const signers: any[] = [];

  const decimalsX = await getMint(
    connection,
    pair.tokenX,
    "confirmed",
    tokenXProgramId
  ).then((mint) => mint.decimals);

  const decimalsY = await getMint(
    connection,
    pair.tokenY,
    "confirmed",
    tokenYProgramId
  ).then((mint) => mint.decimals);

  console.log("Token decimals:", { decimalsX, decimalsY });
  console.log("User input amounts:", {
    tokenXAmount: userInput.tokenXAmount.toString(),
    tokenYAmount: userInput.tokenYAmount.toString(),
  });

  console.log("Token amounts in smallest units:", {
    tokenXAmountSmallest: userInput.tokenXAmount
      .mul(Math.pow(10, decimalsX))
      .toString(),
    tokenYAmountSmallest: userInput.tokenYAmount
      .mul(Math.pow(10, decimalsY))
      .toString(),
  });


  const rawLowerTick = priceToTick(
     (userInput.lowerPrice.toNumber() * Math.pow(10, decimalsY)) /
    Math.pow(10, decimalsX)
  );

  const lowerTick = Math.floor(rawLowerTick / pool.tickSpacing) * pool.tickSpacing;

  console.log("Lower tick:", lowerTick);

  const rawUpperTick = priceToTick(userInput.upperPrice.toNumber() * Math.pow(10, decimalsY) / Math.pow(10, decimalsX));
  const upperTick = Math.ceil(rawUpperTick / pool.tickSpacing) * pool.tickSpacing;;
  console.log("Upper tick:", upperTick);

  const ticks = await market.getAllIndexedTicks(pair);
  if (!ticks.get(lowerTick)) {
    instructions.push(
      await market.createTickIx({
        pair,
        index: lowerTick,
        payer: userInput.publickKey,
      })
    );
  }

  if (!ticks.get(upperTick)) {
    instructions.push(
      await market.createTickIx({
        pair,
        index: upperTick,
        payer: userInput.publickKey,
      })
    );
  }

  // create position list if it doesn't exist yet
  try {
    const pl = await market.getPositionList(userInput.publickKey);
  } catch (e) {
    instructions.push(
      await market.createPositionListIx(
        userInput.publickKey,
        userInput.publickKey
      )
    );
  }

  const {
    x,
    y,
    liquidity: liquidityDelta,
  } = getLiquidity(
    // Convert to smallest units (multiply by 10^decimals)
    new BN(userInput.tokenXAmount.mul(Math.pow(10, decimalsX)).toNumber()), 
    new BN(userInput.tokenYAmount.mul(Math.pow(10, decimalsY)).toNumber()),
    lowerTick,
    upperTick,
    pool.sqrtPrice,
    true,
    pool.tickSpacing
  );
  console.log("Liquidity delta calculated:", liquidityDelta.toString());

  // instruction to create a position
  instructions.push(
    await market?.createPositionIx({
      pair,
      owner: userInput.publickKey,
      userTokenX: userTokenXAddress,
      userTokenY: userTokenYAddress,
      lowerTick,
      upperTick,
      liquidityDelta: liquidityDelta,
      knownPrice: pool.sqrtPrice,
      slippage: new BN(100), // 1% slippage
    })
  );

  console.log("Position instruction created successfully!");
  const positionTransaction = new Transaction().add(...instructions);
  const positionSignature = await sendAndConfirmTransaction(
    connection,
    positionTransaction,
    [keypair]
  );
  console.log("Position created! Transaction signature:", positionSignature);
};

main().catch((error) => {
  console.error("Error in main function:", error);
});

// import { Market, Network, Pair } from "@invariant-labs/sdk-eclipse";
// import { connection, keypair } from ".";
// import { PublicKey } from "@solana/web3.js";
// import Decimal from "decimal.js";
// import { getAssociatedTokenAddress } from "@solana/spl-token";

// const userInput = {
//   inputTokenAmount: new Decimal(0.00008),
//   lowerPrice: new Decimal(2400), // Minimum price for your position
//   upperPrice: new Decimal(3000), // Maximum price for your position
//   poolAddress: new PublicKey("Gbh1hnnMUoJKawHUikzQukFgkTr4rHqU4gGqTM7bjT6k"),
//   publickKey: keypair.publicKey,
// };

// // Helper function to convert price to tick
// function priceToTick(price: Decimal, tickSpacing: number): number {
//   // This is a simplified calculation - Invariant has specific formulas
//   // The actual formula involves logarithms and the pool's configuration
//   const logPrice = Math.log(price.toNumber());
//   const tick = Math.floor(logPrice / Math.log(1.0001)); // 1.0001 is the tick spacing factor

//   // Round to nearest valid tick based on tick spacing
//   return Math.floor(tick / tickSpacing) * tickSpacing;
// }

// // Helper function to convert tick to price
// function tickToPrice(tick: number): Decimal {
//   return new Decimal(Math.pow(1.0001, tick));
// }

// export let market: Market | undefined = undefined;
// export function initializeInvariantMarket(): Market {
//   const marketInit = Market.build(
//     Network.MAIN as any, // Use string instead of Network enum
//     keypair as any, // Use keypair directly
//     connection,
//     new PublicKey("iNvTyprs4TX8m6UeUEkeqDFjAL9zRCRWcexK9Sd4WEU") // Invariant program ID on Eclipse
//   );

//   console.log("Invariant market initialized");
//   market = marketInit;

//   return marketInit;
// }
// const main = async () => {
//   if (!market) {
//     market = initializeInvariantMarket();
//   }
//   // //get the ticks

//   // market.createPositionIx()
//   // const response = await fetch(
//   //   "https://stats.invariant.app/eclipse/intervals/eclipse-mainnet?interval=daily"
//   // );
//   // const data = await response.json();
//   // console.log("Data fetched:", data.poolsData);

//   const poolAddress = new PublicKey(
//     "Gbh1hnnMUoJKawHUikzQukFgkTr4rHqU4gGqTM7bjT6k"
//   ); // eth- usdt

//   const pool = await market.getPoolByAddress(poolAddress);
//   console.log("Pool data:", {
//     tokenA: pool.tokenA.toString(),
//     tokenB: pool.tokenB.toString(),
//     tickSpacing: pool.tickSpacing,
//     currentTick: pool.currentTickIndex,
//     sqrtPrice: pool.sqrtPrice.toString()
//   });

//   // construct pair from pool
//   const pair = new Pair(pool.tokenA, pool.tokenB, pool.feeTier);

//   // Get current price from pool (sqrt price squared)
//   const currentPrice = new Decimal(pool.sqrtPrice.toString()).pow(2);
//   console.log("Current pool price:", currentPrice.toString());

//   // create associated token accounts for the tokens if they don't exist
//   const userTokenX = await getAssociatedTokenAddress(
//     pair.tokenX,
//     userInput.publickKey
//   );

//   const userTokenY = await getAssociatedTokenAddress(
//     pair.tokenY,
//     userInput.publickKey
//   );

//   // Calculate ticks based on user input prices
//   const lowerTick = priceToTick(userInput.lowerPrice, pool.tickSpacing);
//   const upperTick = priceToTick(userInput.upperPrice, pool.tickSpacing);

//   console.log("Price range setup:", {
//     lowerPrice: userInput.lowerPrice.toString(),
//     upperPrice: userInput.upperPrice.toString(),
//     currentPrice: currentPrice.toString(),
//     lowerTick,
//     upperTick,
//     tickSpacing: pool.tickSpacing,
//     currentTick: pool.currentTickIndex
//   });

//   // Verify our tick calculations
//   console.log("Tick verification:", {
//     lowerTickPrice: tickToPrice(lowerTick).toString(),
//     upperTickPrice: tickToPrice(upperTick).toString()
//   });

//   // Calculate meaningful liquidity amount
//   const liquidityDelta = userInput.inputTokenAmount.mul(1e9).toNumber(); // Convert to lamports

//   // instruction to create a position
//   const positionIx = market?.createPositionIx({
//     pair,
//     owner: userInput.publickKey,
//     userTokenX,
//     userTokenY,
//     lowerTick,
//     upperTick,
//     liquidityDelta,
//     knownPrice: currentPrice.toNumber(),
//     slippage: 0.01, // 1% slippage
//   });

//   console.log("Position instruction created successfully!");
// };

// main().catch((error) => {
//   console.error("Error in main function:", error);
// });
