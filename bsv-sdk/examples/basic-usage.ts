import { BSVSDK } from '../src/index';

async function demonstrateBSVSDK() {
  console.log('🚀 BSV SDK Demo - Basic Usage\n');

  // Initialize SDK
  const sdk = new BSVSDK({
    isTestnet: true,
    maxAddresses: 100000,
    feeRate: 5
  });

  console.log('📋 SDK Configuration:');
  console.log('Network:', sdk.getNetworkConfig().name);
  console.log('Max Addresses:', sdk.getConfig().maxAddresses);
  console.log('Fee Rate:', sdk.getConfig().feeRate, 'sat/byte\n');

  // 1. Generate mnemonic
  console.log('🔐 Step 1: Generate Mnemonic');
  const mnemonic = sdk.generateMnemonic();
  console.log('Generated Mnemonic:', mnemonic);
  console.log('Valid:', sdk.validateMnemonic(mnemonic), '\n');

  // 2. Split mnemonic into shards
  console.log('🔒 Step 2: Split Mnemonic into Shards');
  const shardingResult = sdk.splitMnemonic(mnemonic);
  console.log('Number of Shards:', shardingResult.shards.length);
  console.log('Threshold:', shardingResult.threshold);
  console.log('Shard 1:', shardingResult.shards[0].substring(0, 20) + '...');
  console.log('Shard 2:', shardingResult.shards[1].substring(0, 20) + '...');
  console.log('Shard 3:', shardingResult.shards[2].substring(0, 20) + '...\n');

  // 3. Reconstruct mnemonic from 2 shards
  console.log('🔓 Step 3: Reconstruct Mnemonic from 2 Shards');
  const reconstructed = sdk.combineShards([shardingResult.shards[0], shardingResult.shards[1]]);
  console.log('Reconstructed:', reconstructed === mnemonic ? '✅ Success' : '❌ Failed');
  console.log('Mnemonic Match:', reconstructed === mnemonic, '\n');

  // 4. Recovery: Generate new shards from 2 existing shards
  console.log('🔄 Step 4: Recovery - Generate New Shards');
  const recovery = sdk.recoverShards([shardingResult.shards[0], shardingResult.shards[1]]);
  console.log('New Shards Generated:', recovery.shards.length);
  console.log('New Shard 1:', recovery.shards[0].substring(0, 20) + '...');
  console.log('Verification:', sdk.combineShards([recovery.shards[0], recovery.shards[1]]) === mnemonic ? '✅ Success' : '❌ Failed', '\n');

  // 5. Generate xPub key
  console.log('🔑 Step 5: Generate Extended Public Key (xPub)');
  const xpub = sdk.generateXPub(mnemonic);
  console.log('xPub:', xpub.xpub.substring(0, 50) + '...');
  console.log('Network:', xpub.network);
  console.log('Derivation Path:', xpub.derivationPath, '\n');

  // 6. Generate wallet
  console.log('💼 Step 6: Generate Complete Wallet');
  const wallet = sdk.generateWallet(mnemonic);
  console.log('Address:', wallet.address);
  console.log('Private Key:', wallet.privateKey.substring(0, 20) + '...');
  console.log('Public Key:', wallet.publicKey.substring(0, 20) + '...', '\n');

  // 7. Generate multiple addresses
  console.log('🏠 Step 7: Generate Multiple Addresses');
  const addresses = sdk.generateAddressRange(mnemonic, 0, 5);
  console.log('Generated', addresses.length, 'addresses:');
  addresses.forEach((addr, index) => {
    console.log(`  ${index}: ${addr.address}`);
  });
  console.log('');

  // 8. Derive addresses from xPub
  console.log('📍 Step 8: Derive Addresses from xPub');
  for (let i = 0; i < 3; i++) {
    const derived = sdk.deriveAddressFromXPub(xpub.xpub, i);
    console.log(`Index ${i}: ${derived.address}`);
  }
  console.log('');

  // 9. Validate addresses
  console.log('✅ Step 9: Address Validation');
  const testAddress = wallet.address;
  console.log('Address:', testAddress);
  console.log('Valid:', sdk.validateAddress(testAddress));
  console.log('Explorer URL:', sdk.getAddressExplorerUrl(testAddress), '\n');

  // 10. Network information
  console.log('🌐 Step 10: Network Information');
  const networkConfig = sdk.getNetworkConfig();
  console.log('Network Name:', networkConfig.name);
  console.log('RPC URL:', networkConfig.rpcUrl);
  console.log('Explorer URL:', networkConfig.explorerUrl, '\n');

  console.log('🎉 BSV SDK Demo Complete!');
  console.log('\n📚 Key Features Demonstrated:');
  console.log('✅ Universal entropy generation');
  console.log('✅ 12-word mnemonic creation');
  console.log('✅ 2/3 Shamir Secret Sharing');
  console.log('✅ Shard recovery functionality');
  console.log('✅ xPub key generation');
  console.log('✅ Address derivation');
  console.log('✅ Multiple address generation');
  console.log('✅ Address validation');
  console.log('✅ Network configuration');
  console.log('\n🚀 Ready for production use!');
}

// Run the demo
if (require.main === module) {
  demonstrateBSVSDK().catch(console.error);
}

export { demonstrateBSVSDK };
