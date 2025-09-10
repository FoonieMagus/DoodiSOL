const { createToken } = require("./token-creation/token-core");
const { NETWORKS } = require("./token-creation/network-config");

/**
 * Show usage instructions
 */
function showUsage() {
  console.log("Usage: node simple-token-create.js [network] [wallet-path]");
  console.log("");
  console.log("Arguments:");
  console.log(
    "  network      Network to deploy to (devnet|mainnet) [default: devnet]"
  );
  console.log("  wallet-path  Custom wallet file path [optional]");
  console.log("");
  console.log("Examples:");
  console.log(
    "  node simple-token-create.js                    # Deploy to devnet with default wallet"
  );
  console.log(
    "  node simple-token-create.js devnet              # Deploy to devnet with default wallet"
  );
  console.log(
    "  node simple-token-create.js mainnet ~/wallet.json  # Deploy to mainnet with custom wallet"
  );
  console.log("");
  console.log("Features:");
  console.log("  • Creates DOODi token with metadata");
  console.log("  • Creates token without initial minting (airdrop-ready)");
  console.log("  • Preserves mint authority for airdrop operations");
  console.log("");
  console.log("Post-Creation Scripts:");
  console.log(
    "  • airdrop.js - Mint-based airdrops or transfer-based distributions"
  );
  console.log("  • revoke-mint-authority.js - Permanently fix token supply");
  console.log("");
  console.log("Supported Networks:");
  Object.entries(NETWORKS).forEach(([key, config]) => {
    console.log(`  ${key.padEnd(8)} - ${config.name} (${config.url})`);
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);

  // Handle help flag
  if (args.includes("--help") || args.includes("-h")) {
    showUsage();
    process.exit(0);
  }

  const network = args[0] || "devnet";
  const walletPath = args[1] === "null" ? null : args[1] || null;

  // Validate network
  if (!NETWORKS[network.toLowerCase()]) {
    console.error(`❌ Invalid network: ${network}`);
    console.error(`Supported networks: ${Object.keys(NETWORKS).join(", ")}`);
    console.error("");
    showUsage();
    process.exit(1);
  }

  // Create token using modular approach
  createToken(network, walletPath);
}

module.exports = {
  createToken,
};
