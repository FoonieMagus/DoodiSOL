const { PublicKey } = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount,
  burn,
  getMint,
  getAccount,
} = require("@solana/spl-token");
const fs = require("fs");
const { createConnection } = require("./token-creation/network-config");
const { loadWallet } = require("./token-creation/wallet-manager");
const { TOKEN_CONFIG } = require("./token-creation/token-config");

/**
 * Burn tokens from a specified account
 * @param {string} network - Network to use (devnet/mainnet)
 * @param {number} amount - Amount of tokens to burn (in UI units)
 * @param {string} fromAddress - Address to burn tokens from (optional, defaults to creator wallet)
 * @param {boolean} dryRun - Only show what would be done without executing
 */
async function burnTokens(
  network = "devnet",
  amount = null,
  fromAddress = null,
  dryRun = false
) {
  try {
    // Load token info
    if (!fs.existsSync("./doodi-token-info.json")) {
      console.error(
        "❌ Token info file not found. Please create a token first."
      );
      process.exit(1);
    }

    const tokenInfo = JSON.parse(
      fs.readFileSync("./doodi-token-info.json", "utf8")
    );

    console.log(
      `🔥 ${dryRun ? "DRY RUN - " : ""}Token Burn for ${tokenInfo.name}...`
    );
    console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`   Mint Address: ${tokenInfo.mintAddress}`);
    console.log(`   Network: ${tokenInfo.network}`);

    // Validate network matches
    if (tokenInfo.network !== network) {
      console.warn(
        `⚠️  Network mismatch: Token is on ${tokenInfo.network}, but ${network} specified.`
      );
      console.log(`   Using token network: ${tokenInfo.network}`);
      network = tokenInfo.network;
    }

    // Connect to network
    const connection = createConnection(network);
    const mint = new PublicKey(tokenInfo.mintAddress);

    // Load wallet
    const { getNetworkConfig } = require("./token-creation/network-config");
    const networkConfig = getNetworkConfig(network);
    const walletKeypair = loadWallet(networkConfig);

    console.log(`👛 Using wallet: ${walletKeypair.publicKey.toString()}`);

    // Get mint info
    console.log(`\\n🔍 Checking token mint info...`);
    const mintInfo = await getMint(connection, mint);
    const currentSupplyRaw = Number(mintInfo.supply);
    const currentSupplyUI = currentSupplyRaw / Math.pow(10, mintInfo.decimals);

    console.log(`   • Current total supply: ${currentSupplyUI.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
    console.log(`   • Mint Authority: ${mintInfo.mintAuthority?.toString() || "None (Revoked)"}`);
    console.log(`   • Freeze Authority: ${mintInfo.freezeAuthority?.toString() || "None"}`);

    // Determine the account to burn from
    let burnFromAddress;
    if (fromAddress) {
      try {
        burnFromAddress = new PublicKey(fromAddress);
        console.log(`\\n🎯 Burning from specified address: ${fromAddress}`);
      } catch (error) {
        console.error(`❌ Invalid fromAddress: ${error.message}`);
        process.exit(1);
      }
    } else {
      burnFromAddress = walletKeypair.publicKey;
      console.log(`\\n🎯 Burning from wallet address: ${walletKeypair.publicKey.toString()}`);
    }

    // Get the token account to burn from
    console.log(`\\n🏦 Getting token account...`);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      walletKeypair,
      mint,
      burnFromAddress
    );

    const accountInfo = await getAccount(connection, tokenAccount.address);
    const currentBalanceRaw = Number(accountInfo.amount);
    const currentBalanceUI = currentBalanceRaw / Math.pow(10, mintInfo.decimals);

    console.log(`   • Token Account: ${tokenAccount.address.toString()}`);
    console.log(`   • Current Balance: ${currentBalanceUI.toLocaleString()} ${TOKEN_CONFIG.symbol}`);

    if (currentBalanceUI === 0) {
      console.error(`❌ No tokens to burn in this account!`);
      process.exit(1);
    }

    // Determine burn amount
    let burnAmount;
    if (amount === null) {
      // Burn all tokens if no amount specified
      burnAmount = currentBalanceUI;
      console.log(`\\n🔥 Burning ALL tokens from account...`);
    } else {
      if (amount <= 0) {
        console.error(`❌ Burn amount must be greater than 0`);
        process.exit(1);
      }
      if (amount > currentBalanceUI) {
        console.error(`❌ Insufficient balance!`);
        console.error(`   • Requested to burn: ${amount.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
        console.error(`   • Available balance: ${currentBalanceUI.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
        process.exit(1);
      }
      burnAmount = amount;
      console.log(`\\n🔥 Burning ${burnAmount.toLocaleString()} ${TOKEN_CONFIG.symbol}...`);
    }

    // Calculate new supply after burn
    const newSupplyUI = currentSupplyUI - burnAmount;
    const burnAmountRaw = BigInt(
      Math.round(burnAmount * Math.pow(10, mintInfo.decimals))
    );

    console.log(`\\n📊 Burn Summary:`);
    console.log(`   • Amount to burn: ${burnAmount.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
    console.log(`   • Current total supply: ${currentSupplyUI.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
    console.log(`   • New total supply after burn: ${newSupplyUI.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
    console.log(`   • Percentage of supply burned: ${((burnAmount / currentSupplyUI) * 100).toFixed(2)}%`);

    if (dryRun) {
      console.log(`\\n🎯 DRY RUN COMPLETE - No tokens were actually burned`);
      return;
    }

    // Confirm burn operation
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const confirmed = await new Promise((resolve) => {
      console.log(`\\n${"=".repeat(60)}`);
      console.log(`⚠️  TOKEN BURN CONFIRMATION REQUIRED ⚠️`);
      console.log(`${"=".repeat(60)}`);
      console.log(`🔥 BURN OPERATION:`);
      console.log(`   • Will burn: ${burnAmount.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
      console.log(`   • From account: ${tokenAccount.address.toString()}`);
      console.log(`   • Owner: ${burnFromAddress.toString()}`);
      console.log(`   • Network: ${network.toUpperCase()}`);
      console.log(`   • This operation is IRREVERSIBLE!`);
      console.log(`   • Burned tokens will be permanently removed from circulation`);
      console.log(`\\n${"=".repeat(60)}`);

      rl.question(
        `🔥 Do you want to proceed with burning ${burnAmount.toLocaleString()} ${TOKEN_CONFIG.symbol} tokens? (yes/no): `,
        (answer) => {
          rl.close();
          const confirmed =
            answer.toLowerCase().trim() === "yes" ||
            answer.toLowerCase().trim() === "y";
          resolve(confirmed);
        }
      );
    });

    if (!confirmed) {
      console.log(`❌ Token burn cancelled by user`);
      return;
    }

    // Perform the burn
    console.log(`\\n🔥 Executing token burn...`);
    console.log(`   • Burning ${burnAmount.toLocaleString()} ${TOKEN_CONFIG.symbol}...`);

    const burnSignature = await burn(
      connection,
      walletKeypair,
      tokenAccount.address,
      mint,
      burnFromAddress.equals(walletKeypair.publicKey) ? walletKeypair : walletKeypair, // Use wallet as authority if burning from own account
      burnAmountRaw
    );

    console.log(`\\n⏳ Confirming burn transaction...`);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      signature: burnSignature,
      blockhash,
      lastValidBlockHeight
    }, "confirmed");

    if (confirmation.value.err) {
      console.error(`❌ Burn transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      process.exit(1);
    }

    console.log(`\\n🎉 Token burn completed successfully!`);
    console.log(`   • Burned: ${burnAmount.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
    console.log(`   • Transaction: ${burnSignature}`);
    console.log(`   • Explorer: https://explorer.solana.com/tx/${burnSignature}?cluster=${network === 'mainnet' ? 'mainnet-beta' : network}`);

    // Get updated supply info
    console.log(`\\n📊 Updated Token Supply:`);
    const updatedMintInfo = await getMint(connection, mint);
    const updatedSupplyUI = Number(updatedMintInfo.supply) / Math.pow(10, mintInfo.decimals);
    console.log(`   • New total supply: ${updatedSupplyUI.toLocaleString()} ${TOKEN_CONFIG.symbol}`);
    console.log(`   • Tokens permanently removed from circulation: ${burnAmount.toLocaleString()} ${TOKEN_CONFIG.symbol}`);

    // Save burn record
    const burnRecord = {
      timestamp: new Date().toISOString(),
      tokenInfo: {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        mintAddress: tokenInfo.mintAddress,
        network: network,
      },
      burnDetails: {
        amount: burnAmount,
        fromAccount: tokenAccount.address.toString(),
        fromOwner: burnFromAddress.toString(),
        signature: burnSignature,
        supplyBefore: currentSupplyUI,
        supplyAfter: updatedSupplyUI,
      },
    };

    const burnRecordFile = `burn-record-${Date.now()}.json`;
    fs.writeFileSync(burnRecordFile, JSON.stringify(burnRecord, null, 2));
    console.log(`\\n💾 Burn record saved to: ${burnRecordFile}`);

  } catch (error) {
    console.error("❌ Token burn failed:", error.message);
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log, i) => {
        console.error(`  ${i + 1}. ${log}`);
      });
    }
    process.exit(1);
  }
}

// Show usage
function showUsage() {
  console.log(`
🔥 Token Burn Script

Permanently burn tokens from circulation to reduce total supply.

Usage: node burn-tokens.js [network] [amount] [options]

Arguments:
  network               Network to use: 'devnet' or 'mainnet' [default: devnet]
  amount               Amount of tokens to burn (UI units). Use 'all' to burn entire balance

Options:
  --from <address>     Burn tokens from specific address (default: wallet address)
  --dry-run           Show what would be done without executing
  --help, -h          Show this help message

Examples:
  node burn-tokens.js devnet 1000000                    # Burn 1M tokens on devnet
  node burn-tokens.js mainnet all                       # Burn all tokens from wallet
  node burn-tokens.js mainnet 500000 --dry-run          # Preview burn operation
  node burn-tokens.js mainnet 250000 --from <address>   # Burn from specific address

⚠️  IMPORTANT WARNINGS:
  • Burned tokens are PERMANENTLY DESTROYED and cannot be recovered
  • This reduces the total circulating supply forever
  • Make sure you have sufficient SOL for transaction fees
  • Always test with --dry-run first on important operations
  • Only the token account owner can burn tokens from that account

💡 Use Cases:
  • Reduce total token supply permanently
  • Remove tokens from circulation
  • Deflationary tokenomics implementation
  • Clean up test tokens or mistakes
`);
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showUsage();
    process.exit(0);
  }

  const network = args[0] || "devnet";
  let amount = args[1];
  
  // Handle 'all' keyword
  if (amount === "all") {
    amount = null; // null means burn all
  } else if (amount) {
    amount = parseFloat(amount);
    if (isNaN(amount)) {
      console.error(`❌ Invalid amount: ${args[1]}`);
      showUsage();
      process.exit(1);
    }
  }

  // Parse options
  const fromIndex = args.findIndex(arg => arg === '--from');
  const fromAddress = fromIndex !== -1 && fromIndex + 1 < args.length ? args[fromIndex + 1] : null;
  
  const dryRun = args.includes("--dry-run");

  if (!["devnet", "mainnet"].includes(network)) {
    console.error(`❌ Invalid network: ${network}`);
    console.error("Valid networks: devnet, mainnet");
    showUsage();
    process.exit(1);
  }

  burnTokens(network, amount, fromAddress, dryRun);
}

module.exports = { burnTokens };