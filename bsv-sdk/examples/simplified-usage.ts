import { BSVSDK } from '../src/index';

async function demonstrateSimplifiedBSVSDK() {
  console.log('🚀 BSV SDK Demo - Simplified & Configurable\n');

  // Example 1: Default configuration
  console.log('📋 Example 1: Default Configuration');
  const defaultSdk = new BSVSDK({
    isTestnet: true,
    maxAddresses: 100000,
    feeRate: 5
  });

  console.log('Network:', defaultSdk.getNetworkConfig().name);
  console.log('RPC URL:', defaultSdk.getNetworkConfig().rpcUrl);
  console.log('Explorer:', defaultSdk.getNetworkConfig().explorerUrl, '\n');

  // Example 2: Custom network configuration
  console.log('📋 Example 2: Custom Network Configuration');
  const customSdk = new BSVSDK({
    isTestnet: true,
    maxAddresses: 50000,
    feeRate: 10,
    rpcUrl: 'https://api.whatsonchain.com/v1/bsv/test',
    explorerUrl: 'https://test.whatsonchain.com'
  });

  console.log('Network:', customSdk.getNetworkConfig().name);
  console.log('RPC URL:', customSdk.getNetworkConfig().rpcUrl);
  console.log('Explorer:', customSdk.getNetworkConfig().explorerUrl, '\n');

  // Example 3: Mainnet configuration
  console.log('📋 Example 3: Mainnet Configuration');
  const mainnetSdk = new BSVSDK({
    isTestnet: false,
    maxAddresses: 1000000,
    feeRate: 3
  });

  console.log('Network:', mainnetSdk.getNetworkConfig().name);
  console.log('RPC URL:', mainnetSdk.getNetworkConfig().rpcUrl);
  console.log('Explorer:', mainnetSdk.getNetworkConfig().explorerUrl, '\n');

  // Core functionality demonstration
  console.log('🔐 Core Functionality Demo');
  const sdk = customSdk;

  // 1. Generate mnemonic
  console.log('Step 1: Generate Mnemonic');
  const mnemonic = sdk.generateMnemonic();
  console.log('Generated:', mnemonic);
  console.log('Valid:', sdk.validateMnemonic(mnemonic), '\n');

  // 2. Split into shards
  console.log('Step 2: Split Mnemonic into Shards');
  const shards = sdk.splitMnemonic(mnemonic);
  console.log('Shards:', shards.shards.length);
  console.log('Threshold:', shards.threshold, '\n');

  // 3. Reconstruct from 2 shards
  console.log('Step 3: Reconstruct from 2 Shards');
  const reconstructed = sdk.combineShards([shards.shards[0], shards.shards[1]]);
  console.log('Success:', reconstructed === mnemonic, '\n');

  // 4. Recovery function
  console.log('Step 4: Recovery - Generate New Shards');
  const recovery = sdk.recoverShards([shards.shards[0], shards.shards[1]]);
  console.log('New Shards:', recovery.shards.length);
  console.log('Verification:', sdk.combineShards([recovery.shards[0], recovery.shards[1]]) === mnemonic, '\n');

  // 5. Generate xPub
  console.log('Step 5: Generate xPub');
  const xpub = sdk.generateXPub(mnemonic);
  console.log('xPub:', xpub.xpub.substring(0, 50) + '...');
  console.log('Network:', xpub.network, '\n');

  // 6. Generate wallet
  console.log('Step 6: Generate Complete Wallet');
  const wallet = sdk.generateWallet(mnemonic);
  console.log('Address:', wallet.address);
  console.log('Private Key:', wallet.privateKey.substring(0, 20) + '...');
  console.log('Public Key:', wallet.publicKey.substring(0, 20) + '...', '\n');

  // 7. Generate multiple addresses
  console.log('Step 7: Generate Multiple Addresses');
  const addresses = sdk.generateAddressRange(mnemonic, 0, 5);
  console.log('Generated', addresses.length, 'addresses:');
  addresses.forEach((addr, index) => {
    console.log(`  ${index}: ${addr.address}`);
  });
  console.log('');

  // 8. Derive from xPub
  console.log('Step 8: Derive Addresses from xPub');
  for (let i = 0; i < 3; i++) {
    const derived = sdk.deriveAddressFromXPub(xpub.xpub, i);
    console.log(`Index ${i}: ${derived.address}`);
  }
  console.log('');

  // 9. Dynamic configuration update
  console.log('Step 9: Dynamic Configuration Update');
  sdk.updateConfig({ feeRate: 15 });
  console.log('Updated Fee Rate:', sdk.getConfig().feeRate);
  console.log('Network Config Updated:', sdk.getNetworkConfig().name, '\n');

  // 10. Address validation
  console.log('Step 10: Address Validation');
  const testAddress = wallet.address;
  console.log('Address:', testAddress);
  console.log('Valid:', sdk.validateAddress(testAddress));
  console.log('Explorer URL:', sdk.getAddressExplorerUrl(testAddress), '\n');

  console.log('🎉 Simplified BSV SDK Demo Complete!');
  console.log('\n📚 Key Features Demonstrated:');
  console.log('✅ Universal entropy generation');
  console.log('✅ 12-word mnemonic creation');
  console.log('✅ 2/3 Shamir Secret Sharing');
  console.log('✅ Shard recovery functionality');
  console.log('✅ xPub key generation');
  console.log('✅ Address derivation');
  console.log('✅ Multiple address generation');
  console.log('✅ Configurable network settings');
  console.log('✅ Dynamic configuration updates');
  console.log('✅ Address validation');
  console.log('\n🚀 Independent SDK - No OAuth, No MongoDB, No Encryption!');
  console.log('🎯 Focus: Random mnemonic generation and secure sharding');
}

// Run the demo
if (require.main === module) {
  demonstrateSimplifiedBSVSDK().catch(console.error);
}

export { demonstrateSimplifiedBSVSDK };
