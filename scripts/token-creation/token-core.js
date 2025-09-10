const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require("@solana/spl-token");
const fs = require("fs");
const { createConnection } = require("./network-config");
const { loadWallet, ensureSufficientBalance } = require("./wallet-manager");
const { TOKEN_CONFIG, createTokenInfo } = require("./token-config");
const { createTokenMetadata } = require("./metadata");

/**
 * Create DOODi token with basic mint and metadata
 * @param {string} network - Network to deploy to (devnet/mainnet)
 * @param {string|null} walletPath - Custom wallet path
 * @returns {Object} Token creation results
 */
async function createToken(network = "devnet", walletPath = null) {
  try {
    const { getNetworkConfig } = require("./network-config");
    const networkConfig = getNetworkConfig(network);

    console.log(`🚀 Creating ${TOKEN_CONFIG.name} on ${networkConfig.name}...\n`);
    console.log(`🌐 Network: ${networkConfig.name} (${network})`);
    console.log(`🔗 RPC URL: ${networkConfig.url}\n`);


    // Connect to specified network
    const connection = createConnection(network);

    // Load wallet
    const walletKeypair = loadWallet(networkConfig, walletPath);

    console.log(`👛 Using wallet: ${walletKeypair.publicKey.toString()}`);

    // Ensure wallet has sufficient balance
    await ensureSufficientBalance(connection, walletKeypair, networkConfig);

    console.log(`\n🪙 Creating ${TOKEN_CONFIG.name} Mint...`);

    // Create token mint
    const mint = await createMint(
      connection,
      walletKeypair, // payer
      walletKeypair.publicKey, // mint authority
      null, // freeze authority
      TOKEN_CONFIG.decimals
    );

    console.log(`✅ Token Mint Created: ${mint.toString()}`);

    // Get or create associated token account for the creator
    console.log("\n🏦 Creating associated token account...");
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      walletKeypair,
      mint,
      walletKeypair.publicKey
    );

    console.log(`✅ Token Account Created: ${tokenAccount.address.toString()}`);

    console.log("\n💡 Skipping initial token minting - tokens will be minted during airdrop operations");

    // Create token metadata
    console.log("\n📝 Creating token metadata...");
    const metadataResult = await createTokenMetadata(
      connection,
      mint,
      walletKeypair,
      walletKeypair.publicKey
    );
    console.log(
      `✅ Token metadata created. Transaction: ${metadataResult.signature}`
    );
    console.log(
      `   Metadata Account: ${metadataResult.metadataAccount.toString()}`
    );

    // Save token info
    console.log("\n💾 Saving token info...");
    const tokenInfo = createTokenInfo(
      mint,
      walletKeypair,
      tokenAccount,
      null, // no initial mint transaction
      metadataResult,
      network,
      networkConfig,
      true // has mint authority
    );

    fs.writeFileSync(
      "./doodi-token-info.json",
      JSON.stringify(tokenInfo, null, 2)
    );
    console.log("✅ Token info saved");


    // Verify token info
    console.log("\n📊 Verifying token creation...");
    const mintInfo = await connection.getParsedAccountInfo(mint);
    const mintData = mintInfo.value.data.parsed.info;

    console.log(`✅ ${TOKEN_CONFIG.name} Successfully Created:`);
    console.log(`   Mint Address: ${mint.toString()}`);
    console.log(`   Decimals: ${mintData.decimals}`);
    console.log(
      `   Current Supply: ${mintData.supply} (${
        Number(mintData.supply) / Math.pow(10, 6)
      } tokens)`
    );
    console.log(
      `   Maximum Supply: ${TOKEN_CONFIG.supply.toLocaleString()} ${TOKEN_CONFIG.symbol}`
    );
    console.log(
      `   Mint Authority: ${mintData.mintAuthority} (Active)`
    );
    console.log(`   Freeze Authority: ${mintData.freezeAuthority || "None"}`);

    // Check token account balance
    const tokenBalance = await connection.getTokenAccountBalance(
      tokenAccount.address
    );
    console.log(`\n💰 Creator Token Balance:`);
    console.log(`   Account: ${tokenAccount.address.toString()}`);
    console.log(`   Amount: ${tokenBalance.value.uiAmount || 0} tokens (ready for airdrop operations)`);

    console.log("\n🔗 View on Solana Explorer:");
    const clusterParam =
      networkConfig.cluster === "mainnet-beta"
        ? ""
        : `?cluster=${networkConfig.cluster}`;
    console.log(
      `   Mint: ${
        networkConfig.explorerUrl
      }/address/${mint.toString()}${clusterParam}`
    );
    console.log(
      `   Creator Account: ${
        networkConfig.explorerUrl
      }/address/${tokenAccount.address.toString()}${clusterParam}`
    );
    console.log(
      `   Metadata Transaction: ${networkConfig.explorerUrl}/tx/${metadataResult.signature}${clusterParam}`
    );

    console.log(`\n🎉 ${TOKEN_CONFIG.name} creation completed successfully!`);
    console.log("\n📋 Summary:");
    console.log(
      `   • Token Name: ${TOKEN_CONFIG.name} (${TOKEN_CONFIG.symbol})`
    );
    console.log(
      `   • Maximum Supply: ${TOKEN_CONFIG.supply.toLocaleString()} ${
        TOKEN_CONFIG.symbol
      }`
    );
    console.log(`   • Current Supply: 0 ${TOKEN_CONFIG.symbol} (ready for airdrop)`);
    console.log(`   • Decimals: ${TOKEN_CONFIG.decimals}`);
    console.log(`   • Mint Address: ${mint.toString()}`);
    console.log(`   • Network: ${networkConfig.name}`);
    console.log(`   • Token created without initial minting`);
    console.log(`   • Mint Authority: Active (required for airdrop operations)`);
    console.log(`\n📋 Next Steps:`);
    console.log(`   • Use airdrop.js to mint tokens directly to recipients`);
    console.log(`   • Use revoke-mint-authority.js to finalize token supply when done`);

    return {
      mint: mint.toString(),
      tokenAccount: tokenAccount.address.toString(),
      metadataTransaction: metadataResult.signature,
    };
  } catch (error) {
    console.error("❌ Token creation failed:", error);
    process.exit(1);
  }
}

module.exports = {
  createToken,
};