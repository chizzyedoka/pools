import { Connection, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { SwapSDK } from "@deserialize/swap-sdk";

const sdk = new SwapSDK();

// Create an async function to handle the token list fetching
async function fetchTokenList() {
  const tokens = await sdk.tokenList();
  return tokens;
}

// Call the fetchTokenList function 
console.log("Fetching token list...");
fetchTokenList()
  .then((tokens) => {
    console.log(`Fetched ${tokens.length} tokens from SwapSDK`);
    // loop through tokens and log their details
    tokens.forEach((token) => {
      console.log(`Token: ${token.symbol} (${token.name}) - ${token.address}`);
    });
  })
  .catch((error) => {
    console.error("Failed to fetch token list:", error);
  });

// Call the function when needed
// const tokens = fetchTokenList();

// export interface TokenInfo {
//   mint: string;
//   symbol: string;
//   name: string;
//   decimals: number;
//   logoURI?: string;
// }

// export class TokenService {
//   private connection: Connection;
//   private tokenListCache: Map<string, TokenInfo> = new Map();
//   private isInitialized = false;

//   constructor(connection: Connection) {
//     this.connection = connection;
//   }

//   /**
//    * Initialize the token service by loading the token list
//    */
//   async initialize(): Promise<void> {
//     if (this.isInitialized) return;

//     console.log("Loading token list...");

//     try {
//       // Try to load token list from SwapSDK
//       await this.loadTokenListFromSdk();
//     } catch (error) {
//       console.warn("Failed to load token list from SDK:", error);
//       // Fallback to default tokens
//       this.addFallbackTokens();
//     }

//     // Add native ETH (SOL on Eclipse is ETH)
//     this.tokenListCache.set(NATIVE_MINT.toBase58(), {
//       mint: NATIVE_MINT.toBase58(),
//       symbol: "ETH",
//       name: "Ethereum",
//       decimals: 9,
//       logoURI:
//         "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
//     });

//     this.isInitialized = true;
//   }

//   /**
//    * Try to load token list from SwapSDK
//    */
//   private async loadTokenListFromSdk(): Promise<void> {
//     try {
//       // Import SwapSDK dynamically to handle different API versions
//       const { SwapSDK } = await import("@deserialize/swap-sdk");

//       // Try different initialization patterns
//       let swapSdk: any;

//       try {
//         // Pattern 1: Initialize with RPC URL
//         swapSdk = new SwapSDK("https://mainnetbeta-rpc.eclipse.xyz");
//       } catch {
//         try {
//           // Pattern 2: Initialize with connection's endpoint URL
//           swapSdk = new SwapSDK(this.connection.rpcEndpoint);
//         } catch {
//           // Pattern 3: Static access
//           swapSdk = SwapSDK;
//         }
//       }

//       // Try different methods to get token list
//       let tokenList: any[] = [];

//       if (swapSdk.tokenList && Array.isArray(swapSdk.tokenList)) {
//         tokenList = swapSdk.tokenList;
//       } else if (typeof swapSdk.tokenList === "function") {
//         tokenList = await swapSdk.tokenList();
//       } else if (
//         swapSdk.getTokenList &&
//         typeof swapSdk.getTokenList === "function"
//       ) {
//         tokenList = await swapSdk.getTokenList();
//       } else if (swapSdk.tokens && Array.isArray(swapSdk.tokens)) {
//         tokenList = swapSdk.tokens;
//       }

//       if (tokenList.length > 0) {
//         console.log(`Loaded ${tokenList.length} tokens from SwapSDK`);

//         // Cache all tokens for quick lookup
//         tokenList.forEach((token: any) => {
//           const tokenInfo: TokenInfo = {
//             mint: token.address || token.mint || token.id,
//             symbol: token.symbol || "UNKNOWN",
//             name: token.name || "Unknown Token",
//             decimals: token.decimals || 9,
//             logoURI: token.logoURI || token.logo,
//           };

//           this.tokenListCache.set(tokenInfo.mint, tokenInfo);
//         });
//       } else {
//         throw new Error("No tokens found in SDK response");
//       }
//     } catch (error) {
//       console.warn("Failed to load from SwapSDK, trying fallback approach");
//       throw error;
//     }
//   }

//   /**
//    * Add some fallback tokens if the token list fails to load
//    */
//   private addFallbackTokens(): void {
//     console.log("Using fallback token registry...");

//     const fallbackTokens = [
//       {
//         mint: "CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm",
//         symbol: "USDT",
//         name: "Tether USD",
//         decimals: 6,
//       },
//       {
//         mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
//         symbol: "USDC",
//         name: "USD Coin",
//         decimals: 6,
//       },
//     ];

//     fallbackTokens.forEach((token) => {
//       this.tokenListCache.set(token.mint, token);
//     });
//   }

//   /**
//    * Get token information by mint address
//    */
//   async getTokenInfo(mint: string): Promise<TokenInfo> {
//     if (!this.isInitialized) {
//       await this.initialize();
//     }

//     // First check our cache
//     const cachedToken = this.tokenListCache.get(mint);
//     if (cachedToken) {
//       return cachedToken;
//     }

//     // If not found, try to fetch on-chain metadata
//     console.log(
//       `Fetching metadata for unknown token: ${mint.slice(0, 8)}...`
//     );

//     try {
//       const tokenInfo = await this.fetchOnChainTokenMetadata(mint);

//       // Cache the result
//       this.tokenListCache.set(mint, tokenInfo);

//       return tokenInfo;
//     } catch (error) {
//       console.log(
//         `Could not fetch metadata for ${mint.slice(0, 8)}, using placeholder`
//       );

//       // Create placeholder token info
//       const placeholderToken: TokenInfo = {
//         mint,
//         symbol: `TOKEN_${mint.slice(0, 4)}`,
//         name: `Unknown Token ${mint.slice(0, 8)}`,
//         decimals: 9, // Default assumption
//       };

//       // Cache the placeholder
//       this.tokenListCache.set(mint, placeholderToken);

//       return placeholderToken;
//     }
//   }

//   /**
//    * Fetch token metadata from on-chain data
//    */
//   private async fetchOnChainTokenMetadata(mint: string): Promise<TokenInfo> {
//     try {
//       const mintPubkey = new PublicKey(mint);

//       // Try to get mint info
//       const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);

//       if (mintInfo.value?.data && "parsed" in mintInfo.value.data) {
//         const parsedData = mintInfo.value.data.parsed;

//         if (parsedData.type === "mint") {
//           const decimals = parsedData.info.decimals;

//           return {
//             mint,
//             symbol: `TOKEN_${mint.slice(0, 4)}`,
//             name: `Token ${mint.slice(0, 8)}`,
//             decimals,
//           };
//         }
//       }

//       throw new Error("Could not parse mint info");
//     } catch (error) {
//       throw new Error(`Failed to fetch on-chain metadata: ${error}`);
//     }
//   }

//   /**
//    * Get all cached tokens
//    */
//   getAllTokens(): TokenInfo[] {
//     return Array.from(this.tokenListCache.values());
//   }

//   /**
//    * Search tokens by symbol or name
//    */
//   searchTokens(query: string): TokenInfo[] {
//     const lowerQuery = query.toLowerCase();
//     return Array.from(this.tokenListCache.values()).filter(
//       (token) =>
//         token.symbol.toLowerCase().includes(lowerQuery) ||
//         token.name.toLowerCase().includes(lowerQuery)
//     );
//   }

//   /**
//    * Get the number of tokens in cache
//    */
//   getTokenCount(): number {
//     return this.tokenListCache.size;
//   }
// }
