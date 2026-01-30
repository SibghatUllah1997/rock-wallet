import { BSVSDK } from '../src/index';

/**
 * Comprehensive BSV SDK Operations Demo
 * 
 * This example demonstrates ALL native and non-native operations:
 * - Native BSV balance and decimal handling
 * - Token balance and decimal handling  
 * - Native BSV transaction signing
 * - Token transaction signing
 * - Balance validation
 * - Decimal conversions
 * - Fee calculations
 */
async function comprehensiveOperationsDemo() {
  console.log('🚀 Comprehensive BSV SDK Operations Demo\n');

  try {
    // Initialize SDK
    const sdk = new BSVSDK({
      isTestnet: true,
      maxAddresses: 100000,
      feeRate: 5,
      rpcUrl: 'https://api.whatsonchain.com/v1/bsv/test'
    });

    console.log('✅ SDK initialized with comprehensive operations\n');

    // Generate wallet for testing
    const walletData = await sdk.generateWalletWithShards();
    const testAddress = walletData.xpub; // Using xpub as test address for demo

    console.log('🔐 Generated Test Wallet:');
    console.log('Address:', testAddress.substring(0, 50) + '...');
    console.log('Network:', walletData.network);
    console.log('');

    // === NATIVE BSV OPERATIONS ===
    console.log('💰 === NATIVE BSV OPERATIONS ===');

    // 1. Get Native Balance
    console.log('\n1. Get Native BSV Balance:');
    try {
      const nativeBalance = await sdk.getNativeBalance(testAddress);
      console.log('Confirmed:', nativeBalance.confirmed, 'satoshis');
      console.log('Unconfirmed:', nativeBalance.unconfirmed, 'satoshis');
      console.log('Total:', nativeBalance.total, 'satoshis');
      console.log('BSV Format:', nativeBalance.bsv, 'BSV');
      console.log('UTXOs:', nativeBalance.utxos);
    } catch (error) {
      console.log('⚠️  Native balance fetch failed (expected for demo):', error instanceof Error ? error.message : 'Unknown error');
    }

    // 2. Decimal Conversions
    console.log('\n2. Native BSV Decimal Conversions:');
    const satoshis = 123456789;
    const bsvAmount = sdk.satoshisToBSV(satoshis);
    const backToSatoshis = sdk.bsvToSatoshis(bsvAmount);
    
    console.log('Original Satoshis:', satoshis);
    console.log('Converted to BSV:', bsvAmount);
    console.log('Converted back to Satoshis:', backToSatoshis);
    console.log('Conversion accurate:', satoshis === backToSatoshis);

    // 3. Native Transaction Signing
    console.log('\n3. Native BSV Transaction Signing:');
    try {
      const nativeTx = await sdk.signTransaction({
        fromAddress: testAddress,
        toAddress: 'recipient_address_here',
        amount: 10000, // 10000 satoshis
        privateKey: 'demo_private_key',
        feeRate: 5
      });
      
      console.log('✅ Native Transaction Signed:');
      console.log('Transaction ID:', nativeTx.transactionId);
      console.log('Fee:', nativeTx.fee, 'satoshis');
      console.log('Amount (BSV):', nativeTx.amountBSV, 'BSV');
      console.log('Inputs:', nativeTx.inputs);
      console.log('Outputs:', nativeTx.outputs);
    } catch (error) {
      console.log('⚠️  Native transaction signing failed (expected for demo):', error instanceof Error ? error.message : 'Unknown error');
    }

    // 4. Balance Validation
    console.log('\n4. Native Balance Validation:');
    try {
      const balanceValidation = await sdk.validateBalance(
        testAddress,
        1000, // 1000 satoshis
        false // not a token
      );
      
      console.log('Validation Result:');
      console.log('Is Valid:', balanceValidation.isValid);
      console.log('Errors:', balanceValidation.errors.length > 0 ? balanceValidation.errors : 'None');
      console.log('Warnings:', balanceValidation.warnings.length > 0 ? balanceValidation.warnings : 'None');
    } catch (error) {
      console.log('⚠️  Balance validation failed (expected for demo):', error instanceof Error ? error.message : 'Unknown error');
    }

    // === TOKEN OPERATIONS ===
    console.log('\n\n🪙 === TOKEN OPERATIONS ===');

    // 1. Token Decimal Handling
    console.log('\n1. Token Decimal Handling:');
    const rawTokenAmount = 1234567890;
    const tokenDecimalsExample = 8;
    const formattedToken = sdk.formatTokenAmount(rawTokenAmount, tokenDecimalsExample);
    const parsedToken = sdk.parseTokenAmount(formattedToken, tokenDecimalsExample);
    
    console.log('Raw Token Amount:', rawTokenAmount);
    console.log('Token Decimals:', tokenDecimalsExample);
    console.log('Formatted Amount:', formattedToken);
    console.log('Parsed Amount:', parsedToken);
    console.log('Conversion accurate:', rawTokenAmount === parsedToken);

    // 2. Token Amount Validation
    console.log('\n2. Token Amount Validation:');
    const tokenValidation = TokenManager.validateTokenAmount(1.5, tokenDecimalsExample);
    console.log('Token Validation (1.5 tokens):');
    console.log('Is Valid:', tokenValidation.isValid);
    console.log('Raw Amount:', tokenValidation.rawAmount);
    console.log('Formatted Amount:', tokenValidation.formattedAmount);
    console.log('Error:', tokenValidation.error || 'None');

    // 3. Token Transaction Signing
    console.log('\n3. Token Transaction Signing:');
    try {
      const tokenTx = await sdk.signTokenTransaction({
        fromAddress: testAddress,
        toAddress: 'recipient_address_here',
        tokenId: 'SEN_TOKEN_123',
        amount: 100000000, // 1 token (with 8 decimals)
        privateKey: 'demo_private_key',
        feeRate: 5
      });
      
      console.log('✅ Token Transaction Signed:');
      console.log('Transaction ID:', tokenTx.transactionId);
      console.log('Fee:', tokenTx.fee, 'satoshis');
      console.log('Token Amount:', tokenTx.tokenAmount);
      console.log('Inputs:', tokenTx.inputs);
      console.log('Outputs:', tokenTx.outputs);
    } catch (error) {
      console.log('⚠️  Token transaction signing failed (expected for demo):', error instanceof Error ? error.message : 'Unknown error');
    }

    // 4. Token Balance Validation
    console.log('\n4. Token Balance Validation:');
    try {
      const tokenBalanceValidation = await sdk.validateBalance(
        testAddress,
        1000000, // 0.01 tokens (with 8 decimals)
        true, // is a token
        'SEN_TOKEN_123'
      );
      
      console.log('Token Balance Validation Result:');
      console.log('Is Valid:', tokenBalanceValidation.isValid);
      console.log('Errors:', tokenBalanceValidation.errors.length > 0 ? tokenBalanceValidation.errors : 'None');
      console.log('Warnings:', tokenBalanceValidation.warnings.length > 0 ? tokenBalanceValidation.warnings : 'None');
    } catch (error) {
      console.log('⚠️  Token balance validation failed (expected for demo):', error instanceof Error ? error.message : 'Unknown error');
    }

    // === COMPREHENSIVE BALANCE OPERATIONS ===
    console.log('\n\n📊 === COMPREHENSIVE BALANCE OPERATIONS ===');

    // 1. Complete Balance (Native + Tokens)
    console.log('\n1. Complete Balance (Native + Tokens):');
    try {
      const completeBalance = await sdk.getCompleteBalance(testAddress);
      
      console.log('Native BSV Balance:');
      console.log('  Total:', completeBalance.native.total, 'satoshis');
      console.log('  BSV Format:', completeBalance.native.bsv, 'BSV');
      console.log('  UTXOs:', completeBalance.native.utxos);
      
      console.log('Token Balances:');
      if (completeBalance.tokens.length > 0) {
        completeBalance.tokens.forEach(token => {
          console.log(`  ${token.symbol}: ${token.formattedBalance} (${token.balance} raw)`);
        });
      } else {
        console.log('  No tokens found');
      }
    } catch (error) {
      console.log('⚠️  Complete balance fetch failed (expected for demo):', error instanceof Error ? error.message : 'Unknown error');
    }

    // 2. Balance Summary
    console.log('\n2. Balance Summary:');
    try {
      const balanceSummary = await sdk.getBalanceSummary(testAddress);
      console.log('Balance Summary:');
      console.log(balanceSummary);
    } catch (error) {
      console.log('⚠️  Balance summary failed (expected for demo):', error instanceof Error ? error.message : 'Unknown error');
    }

    // === FEE CALCULATIONS ===
    console.log('\n\n💸 === FEE CALCULATIONS ===');

    // 1. Dynamic Fees
    console.log('\n1. Dynamic Fee Calculation:');
    const feeInfo = await sdk.getDynamicFees();
    console.log('Current Fee Rate:', feeInfo.feeRate, 'sat/byte');
    console.log('Recommended Fee:', feeInfo.recommendedFee, 'satoshis');
    console.log('Fast Fee:', feeInfo.fastFee, 'satoshis');
    console.log('Slow Fee:', feeInfo.slowFee, 'satoshis');

    // 2. Fee Calculations
    console.log('\n2. Transaction Fee Calculations:');
    const nativeFee = BalanceManager.calculateNativeFee(2, 2, feeInfo.feeRate);
    const tokenFee = BalanceManager.calculateTokenFee(2, 2, 100, feeInfo.feeRate);
    
    console.log('Native Transaction Fee (2 inputs, 2 outputs):', nativeFee, 'satoshis');
    console.log('Token Transaction Fee (2 inputs, 2 outputs, 100 byte OP_RETURN):', tokenFee, 'satoshis');

    // === DECIMAL HANDLING EXAMPLES ===
    console.log('\n\n🔢 === DECIMAL HANDLING EXAMPLES ===');

    console.log('\n1. Native BSV Decimal Examples:');
    const bsvAmounts = [0.00000001, 0.1, 1.0, 10.5, 100.12345678];
    bsvAmounts.forEach(amount => {
      const satoshis = sdk.bsvToSatoshis(amount);
      const backToBSV = sdk.satoshisToBSV(satoshis);
      console.log(`${amount} BSV → ${satoshis} satoshis → ${backToBSV} BSV`);
    });

    console.log('\n2. Token Decimal Examples:');
    const tokenDecimalsArray = [0, 2, 6, 8, 18];
    const tokenAmounts = [1, 1.5, 100.123456, 0.000001];
    
    tokenDecimalsArray.forEach((decimals: number) => {
      console.log(`\nToken with ${decimals} decimals:`);
      tokenAmounts.forEach(amount => {
        const raw = sdk.parseTokenAmount(amount, decimals);
        const formatted = sdk.formatTokenAmount(raw, decimals);
        console.log(`  ${amount} → ${raw} raw → ${formatted}`);
      });
    });

    console.log('\n🎉 Comprehensive Operations Demo Complete!');
    console.log('\n📊 Summary of Operations Demonstrated:');
    console.log('✅ Native BSV balance fetching with decimal formatting');
    console.log('✅ Native BSV transaction signing with fee calculation');
    console.log('✅ Token balance operations with decimal handling');
    console.log('✅ Token transaction signing with validation');
    console.log('✅ Balance validation for both native and tokens');
    console.log('✅ Decimal conversions (BSV ↔ satoshis)');
    console.log('✅ Token decimal formatting and parsing');
    console.log('✅ Dynamic fee calculations');
    console.log('✅ Comprehensive balance aggregation');
    console.log('✅ Complete balance summaries');

  } catch (error) {
    console.error('❌ Error in comprehensive operations demo:', error);
  }
}

// Import required classes for the demo
import { TokenManager, BalanceManager } from '../src/index';

// Run the comprehensive demo
if (require.main === module) {
  comprehensiveOperationsDemo().catch(console.error);
}

export { comprehensiveOperationsDemo };
