const { PublicKey } = require("@solana/web3.js");
const { setAuthority, AuthorityType } = require("@solana/spl-token");
const fs = require("fs");
const { createConnection } = require("./token-creation/network-config");
const { loadWallet } = require("./token-creation/wallet-manager");

/**
 * Revoke mint authority for a token, making the supply permanently fixed
 */
async function revokeMintAuthority() {
  try {
    // Load token info
    if (!fs.existsSync("./doodi-token-info.json")) {
      console.error("❌ Token info file not found. Please create a token first.");
      process.exit(1);
    }

    const tokenInfo = JSON.parse(fs.readFileSync("./doodi-token-info.json", "utf8"));
    
    if (!tokenInfo.mintAuthority) {
      console.log("✅ Mint authority already revoked for this token");
      console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
      console.log(`   Mint Address: ${tokenInfo.mintAddress}`);
      return;
    }

    console.log(`🔒 Revoking mint authority for ${tokenInfo.name}...`);
    console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`   Mint Address: ${tokenInfo.mintAddress}`);
    console.log(`   Network: ${tokenInfo.network}`);

    // Connect to network
    const connection = createConnection(tokenInfo.network);
    const mint = new PublicKey(tokenInfo.mintAddress);

    // Load wallet
    const { getNetworkConfig } = require("./token-creation/network-config");
    const networkConfig = getNetworkConfig(tokenInfo.network);
    const walletKeypair = loadWallet(networkConfig);

    console.log(`👛 Using wallet: ${walletKeypair.publicKey.toString()}`);

    // Verify current mint authority
    const mintInfo = await connection.getParsedAccountInfo(mint);
    const mintData = mintInfo.value.data.parsed.info;
    
    if (!mintData.mintAuthority) {
      console.log("✅ Mint authority is already null - token supply is fixed");
      
      // Update token info file
      tokenInfo.mintAuthority = null;
      tokenInfo.status = "completed";
      fs.writeFileSync("./doodi-token-info.json", JSON.stringify(tokenInfo, null, 2));
      return;
    }

    if (mintData.mintAuthority !== walletKeypair.publicKey.toString()) {
      console.error(`❌ Wallet is not the mint authority`);
      console.error(`   Current authority: ${mintData.mintAuthority}`);
      console.error(`   Wallet: ${walletKeypair.publicKey.toString()}`);
      process.exit(1);
    }

    // Show current token supply
    console.log(`📊 Current Token Supply: ${Number(mintData.supply) / Math.pow(10, mintData.decimals)} tokens`);

    // Confirm action
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirmed = await new Promise((resolve) => {
      console.log(`\n⚠️  WARNING: This action is IRREVERSIBLE!`);
      console.log(`🔒 Revoking mint authority will permanently fix the token supply.`);
      console.log(`   No more tokens can ever be minted after this action.`);
      
      rl.question('\nDo you want to revoke mint authority? (yes/no): ', (answer) => {
        rl.close();
        const confirmed = answer.toLowerCase().trim() === 'yes' || answer.toLowerCase().trim() === 'y';
        resolve(confirmed);
      });
    });

    if (!confirmed) {
      console.log('❌ Operation cancelled by user');
      return;
    }

    // Revoke mint authority
    console.log('\n🔒 Revoking mint authority...');
    const signature = await setAuthority(
      connection,
      walletKeypair,
      mint,
      walletKeypair.publicKey,
      AuthorityType.MintTokens,
      null // Set to null to remove authority
    );

    console.log(`✅ Mint authority revoked successfully!`);
    console.log(`   Transaction: ${signature}`);

    // Verify the change
    const updatedMintInfo = await connection.getParsedAccountInfo(mint);
    const updatedMintData = updatedMintInfo.value.data.parsed.info;

    console.log('\n📊 Final Token Status:');
    console.log(`   Supply: ${Number(updatedMintData.supply) / Math.pow(10, updatedMintData.decimals)} tokens (FIXED)`);
    console.log(`   Mint Authority: ${updatedMintData.mintAuthority || "None - Supply is permanent"}`);

    // Update token info file
    tokenInfo.mintAuthority = null;
    tokenInfo.status = "completed";
    tokenInfo.mintAuthorityRevokedAt = new Date().toISOString();
    tokenInfo.revokeTransaction = signature;

    fs.writeFileSync("./doodi-token-info.json", JSON.stringify(tokenInfo, null, 2));
    console.log('\n💾 Token info updated');

    // Show explorer links
    const clusterParam = networkConfig.cluster === "mainnet-beta" ? "" : `?cluster=${networkConfig.cluster}`;
    console.log('\n🔗 View on Solana Explorer:');
    console.log(`   Token: ${networkConfig.explorerUrl}/address/${mint.toString()}${clusterParam}`);
    console.log(`   Revoke Transaction: ${networkConfig.explorerUrl}/tx/${signature}${clusterParam}`);

    console.log(`\n🎉 ${tokenInfo.name} supply is now permanently fixed!`);

  } catch (error) {
    console.error("❌ Failed to revoke mint authority:", error.message);
    process.exit(1);
  }
}

// Show usage
function showUsage() {
  console.log(`
🔒 Revoke Mint Authority Script

This script permanently revokes the mint authority for a token, making the supply fixed forever.

Usage: node revoke-mint-authority.js

Requirements:
  - doodi-token-info.json file must exist
  - Wallet must be the current mint authority
  - Network connection to the blockchain

⚠️  WARNING: This action is IRREVERSIBLE!
`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  revokeMintAuthority();
}

module.exports = { revokeMintAuthority };