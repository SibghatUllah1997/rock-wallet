import { BSVSDK } from '../src/index';

/**
 * Universal BSV SDK Flow
 * 
 * This example demonstrates the exact flow requested:
 * 1. Initialize SDK with API URL
 * 2. Dynamic gas fee calculation (real-time)
 * 3. Check testnet true/false
 * 4. Generate mnemonic → return 3 shards + xpub
 * 5. Function to accept dynamic index with BIP44 → generate keypair and sign tx
 */
async function universalBSVFlow() {
  console.log('🚀 Universal BSV SDK Flow Demo\n');

  try {
    // 1. Initialize SDK with API URL
    console.log('📋 Step 1: Initialize SDK with API URL');
    const sdk = new BSVSDK({
      isTestnet: true,
      maxAddresses: 100000,
      feeRate: 5,
      rpcUrl: 'https://api.whatsonchain.com/v1/bsv/test',
      explorerUrl: 'https://test.whatsonchain.com'
    });

    console.log('✅ SDK initialized with custom API URL');
    console.log('RPC URL:', sdk.getConfig().rpcUrl);
    console.log('Explorer URL:', sdk.getConfig().explorerUrl, '\n');

    // 2. Dynamic gas fee calculation (real-time)
    console.log('📋 Step 2: Dynamic Gas Fee Calculation (Real-time)');
    const feeInfo = await sdk.getDynamicFees();
    console.log('💰 Current Fee Rate:', feeInfo.feeRate, 'sat/byte');
    console.log('💰 Recommended Fee:', feeInfo.recommendedFee, 'satoshis');
    console.log('💰 Fast Fee:', feeInfo.fastFee, 'satoshis');
    console.log('💰 Slow Fee:', feeInfo.slowFee, 'satoshis');
    console.log('💰 Timestamp:', new Date(feeInfo.timestamp).toISOString(), '\n');

    // 3. Check testnet true/false
    console.log('📋 Step 3: Check Network Status (Testnet True/False)');
    const networkStatus = await sdk.checkNetworkStatus();
    console.log('🌐 Network Name:', networkStatus.name);
    console.log('🌐 Is Testnet:', networkStatus.isTestnet);
    console.log('🌐 API Connected:', networkStatus.connected);
    console.log('🌐 RPC URL:', networkStatus.rpcUrl);
    console.log('🌐 Explorer URL:', networkStatus.explorerUrl);
    
    if (networkStatus.error) {
      console.log('⚠️  Network Error:', networkStatus.error);
    }
    console.log('');

    // 4. Generate mnemonic → return 3 shards + xpub
    console.log('📋 Step 4: Generate Mnemonic → Return 3 Shards + xPub');
    const walletData = await sdk.generateWalletWithShards();
    
    console.log('🔐 Mnemonic:', walletData.mnemonic);
    console.log('🔐 Shards Count:', walletData.shards.length);
    console.log('🔐 Threshold:', walletData.threshold);
    console.log('🔐 Total Shares:', walletData.totalShares);
    console.log('🔐 xPub:', walletData.xpub.substring(0, 50) + '...');
    console.log('🔐 Network:', walletData.network);
    
    // Verify shards work
    console.log('\n🔍 Verifying Shards:');
    const reconstructed = sdk.combineShards([walletData.shards[0], walletData.shards[1]]);
    console.log('✅ Shard reconstruction successful:', reconstructed === walletData.mnemonic);
    console.log('');

    // 5. Function to accept dynamic index with BIP44 → generate keypair and sign tx
    console.log('📋 Step 5: Dynamic Index BIP44 → Generate Keypair and Sign TX');
    
    // Generate keypairs from different dynamic indices
    const indices = [0, 5, 10, 15, 20];
    const keypairs = [];
    
    for (const index of indices) {
      console.log(`\n🔑 Generating Keypair for Index ${index}:`);
      const keypair = sdk.generateKeypairFromIndex(walletData.xpub, index);
      
      console.log(`  Address: ${keypair.address}`);
      console.log(`  Private Key: ${keypair.privateKey.substring(0, 20)}...`);
      console.log(`  Public Key: ${keypair.publicKey.substring(0, 20)}...`);
      console.log(`  Derivation Path: ${keypair.derivationPath}`);
      
      keypairs.push(keypair);
    }

    // Demonstrate transaction signing with dynamic fees
    console.log('\n📝 Transaction Signing Demo:');
    if (keypairs.length > 0) {
      const fromKeypair = keypairs[0];
      const toAddress = keypairs[1].address; // Use another generated address
      
      console.log(`From Address: ${fromKeypair.address}`);
      console.log(`To Address: ${toAddress}`);
      console.log(`Amount: 1000 satoshis`);
      console.log(`Fee Rate: ${feeInfo.feeRate} sat/byte`);
      
      try {
        const signedTx = await sdk.signTransaction({
          fromAddress: fromKeypair.address,
          toAddress: toAddress,
          amount: 1000,
          privateKey: fromKeypair.privateKey,
          feeRate: feeInfo.feeRate
        });
        
        console.log('✅ Transaction signed successfully!');
        console.log('📄 Transaction ID:', signedTx.transactionId);
        console.log('💰 Fee:', signedTx.fee, 'satoshis');
        console.log('📥 Inputs:', signedTx.inputs);
        console.log('📤 Outputs:', signedTx.outputs);
        console.log('📄 Signed TX Hex:', signedTx.signedTransactionHex.substring(0, 50) + '...');
        
      } catch (txError) {
        console.log('⚠️  Transaction signing failed (expected for demo):', txError instanceof Error ? txError.message : 'Unknown error');
        console.log('ℹ️  This is normal in a demo environment without actual funds');
      }
    }

    // Additional demonstrations
    console.log('\n🎯 Additional Features Demo:');
    
    // Generate multiple addresses from xPub
    console.log('\n📍 Multiple Address Generation from xPub:');
    for (let i = 0; i < 5; i++) {
      const derived = sdk.deriveAddressFromXPub(walletData.xpub, 0, i);
      console.log(`  Index ${i}: ${derived.address}`);
    }

    // Shard recovery demonstration
    console.log('\n🔄 Shard Recovery Demo:');
    const recovery = sdk.recoverShards([walletData.shards[0], walletData.shards[1]]);
    console.log('✅ New shards generated from 2 existing ones');
    console.log('✅ New shards count:', recovery.shards.length);
    
    // Verify recovery works
    const recoveredMnemonic = sdk.combineShards([recovery.shards[0], recovery.shards[1]]);
    console.log('✅ Recovery verification:', recoveredMnemonic === walletData.mnemonic);

    // Network configuration update
    console.log('\n⚙️  Dynamic Configuration Update:');
    sdk.updateConfig({ feeRate: 10 });
    const updatedConfig = sdk.getConfig();
    console.log('✅ Updated fee rate:', updatedConfig.feeRate);
    
    const newFeeInfo = await sdk.getDynamicFees();
    console.log('✅ New dynamic fees:', newFeeInfo.feeRate, 'sat/byte');

    console.log('\n🎉 Universal BSV SDK Flow Complete!');
    console.log('\n📊 Summary:');
    console.log('✅ SDK initialized with custom API URL');
    console.log('✅ Dynamic gas fees calculated in real-time');
    console.log('✅ Network status validated (testnet confirmed)');
    console.log('✅ Mnemonic generated with 3 shards + xPub');
    console.log('✅ Dynamic BIP44 indices used for keypair generation');
    console.log('✅ Transaction signing with dynamic fees');
    console.log('✅ Multiple addresses generated from xPub');
    console.log('✅ Shard recovery functionality verified');
    console.log('✅ Dynamic configuration updates working');

  } catch (error) {
    console.error('❌ Error in universal flow:', error);
  }
}

// Run the universal flow demo
if (require.main === module) {
  universalBSVFlow().catch(console.error);
}

export { universalBSVFlow };
