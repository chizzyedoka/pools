import { PublicKey, Transaction } from "@solana/web3.js";
import { connection, keypair } from ".";
import {
  createAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

//here we will try to send the liquidity position nft to a destination wallet
const destinationWallet = new PublicKey(
  "EgQmrfXf6DU7NJcSEuLmqXe2oj2buWfqXXmfa5CsAAGA"
);
const positionMint = new PublicKey(
  "C7Lx5r3R8zB57UWPRKhTsL21s7G2qXYWEGdvKwp6NXbP"
);
keypair;
const trans = async () => {
  const source = getAssociatedTokenAddressSync(
    positionMint,
    keypair.publicKey,
    true,
    TOKEN_PROGRAM_ID
  );
  getMint(connection, positionMint, "confirmed").then((mint) => {
    if (!mint) {
      throw new Error("Mint not found for the provided position mint address");
    }
    console.log("Mint found:", mint);
  });
  const destination = getAssociatedTokenAddressSync(
    positionMint,
    destinationWallet,
    true,
    TOKEN_PROGRAM_ID
  );
  const detinationAccountInx =
    createAssociatedTokenAccountIdempotentInstruction(
      keypair.publicKey,
      destination,
      destinationWallet,
      positionMint,
      TOKEN_PROGRAM_ID
    );
  console.log("Source:", source.toBase58());
  console.log("Destination:", destination.toBase58());
  const transaferInstruction = createTransferCheckedInstruction(
    source,
    positionMint,
    destination,
    keypair.publicKey,
    1,
    0
  );

  const transaction = new Transaction().add(
    detinationAccountInx,
    transaferInstruction
  );
  transaction.feePayer = keypair.publicKey;
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  //simulate the transaction
  const simulation = await connection.simulateTransaction(transaction);
  console.error("Simulation failed:", simulation);
};

trans();

//REMOVE LIQUIDITY INSTRUCTION
const removeLiquidityInstruction = async () => {


    
};
