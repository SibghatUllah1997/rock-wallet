# BSV SDK

A comprehensive TypeScript SDK for multi-blockchain wallet operations, transaction management, and blockchain interactions with secure sharding support. Supports Bitcoin SV (BSV), Bitcoin (BTC), and Ethereum/EVM-compatible blockchains.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Multi-Blockchain Support](#multi-blockchain-support)
- [Sharding](#sharding)
- [Transaction Operations](#transaction-operations)
- [Network Support](#network-support)
- [Development](#development)
- [Testing](#testing)

## 🎯 Overview

The BSV SDK provides a complete toolkit for working with multiple blockchains:

- **Bitcoin SV (BSV)**: Full support for BSV mainnet and testnet
- **Bitcoin (BTC)**: Full support for BTC mainnet and testnet
- **Ethereum/EVM**: Support for Ethereum and EVM-compatible chains

### Core Capabilities

- **Wallet Generation**: Mnemonic generation and validation
- **Secure Sharding**: 2/3 threshold Shamir Secret Sharing
- **Key Derivation**: BIP44-compliant key derivation for multiple blockchains
- **Transaction Building**: Native transaction creation for BSV, BTC, and Ethereum
- **Transaction Signing**: Secure transaction signing for all supported blockchains
- **UTXO Management**: UTXO fetching and coin selection (BSV/BTC)
- **Balance Queries**: Real-time balance checking
- **Network Integration**: Blockchain node RPC and broadcasting
- **Multi-Address Support**: Generate and manage multiple addresses
- **xPub Support**: Extended public keys for account-level and root-level derivation

## ✨ Features

### Core Features

- ✅ **Mnemonic Generation** (BIP39, 12-word)
- ✅ **Shamir Secret Sharing** (2/3 threshold)
- ✅ **BIP44 Key Derivation** (m/44'/coinType'/account'/change/address)
- ✅ **xPub Support** (Extended public keys - account-level and root-level)
- ✅ **Transaction Building** (Native transactions for BSV, BTC, Ethereum)
- ✅ **Transaction Signing** (Private key signing for all blockchains)
- ✅ **Transaction Broadcasting** (Multi-node broadcasting)
- ✅ **UTXO Management** (Fetching and selection for BSV/BTC)
- ✅ **Balance Operations** (Query and validate)
- ✅ **Address Generation** (P2PKH and P2SH for BSV/BTC, Ethereum addresses)
- ✅ **Network Status** (Block height, fee estimates)
- ✅ **Testnet & Mainnet** (Full support for both)
- ✅ **Multi-Blockchain** (BSV, BTC, Ethereum/EVM)

### Blockchain Support

- 🔗 **Bitcoin SV (BSV)**: Coin type 236 (mainnet) / 1 (testnet)
- 🔗 **Bitcoin (BTC)**: Coin type 0 (mainnet/testnet)
- 🔗 **Ethereum/EVM**: Coin type 60 (all EVM-compatible chains)

### Security Features

- 🔐 **Cryptographically Secure** entropy generation
- 🔐 **Industry-Standard** Shamir Secret Sharing
- 🔐 **BIP44 Compliant** derivation paths
- 🔐 **Secure Random** number generation
- 🔐 **Root-level xPub** support for MPC wallets

## 📦 Installation

### npm

```bash
npm install @rockwallet/bsv-sdk
```

### yarn

```bash
yarn add @rockwallet/bsv-sdk
```

### Build from Source

```bash
git clone <repository-url>
cd bsv-sdk
npm install
npm run build
```

## 🚀 Quick Start

### Basic Usage (BSV)

```typescript
import { BSVSDK } from '@rockwallet/bsv-sdk';

// Initialize SDK
const sdk = new BSVSDK({
  isTestnet: true,      // Use testnet
  maxAddresses: 100000, // Maximum addresses
  feeRate: 5            // Default fee rate (satoshis per byte)
});

// Generate mnemonic
const mnemonic = sdk.generateMnemonic();
console.log('Mnemonic:', mnemonic);

// Split into shards (2/3 threshold)
const shards = sdk.splitMnemonic(mnemonic);
console.log('Shards:', shards.shards);

// Generate xPub (account-level)
const xpub = sdk.generateXPub(mnemonic);
console.log('xPub:', xpub.xpub);

// Derive address
const address = sdk.deriveAddressFromXPub(xpub.xpub, 0);
console.log('Address:', address.address);

// Get balance
const balance = await sdk.getBalance(address.address);
console.log('Balance:', balance, 'satoshis');
```

### Multi-Blockchain Usage

```typescript
import { BSVSDK, XPubManager, EthereumKeyPairManager } from '@rockwallet/bsv-sdk';

const mnemonic = 'your twelve word mnemonic phrase here...';

// BSV Account XPUB (coin type 236 for mainnet)
const bsvXpub = XPubManager.generateXPubWithCoinType(mnemonic, 236, 0);
console.log('BSV xPub:', bsvXpub.xpub);

// BTC Account XPUB (coin type 0)
const btcXpub = XPubManager.generateXPubWithCoinType(mnemonic, 0, 0);
console.log('BTC xPub:', btcXpub.xpub);

// Ethereum Account XPUB (coin type 60)
const ethXpub = EthereumKeyPairManager.generateEthereumXPub(mnemonic, "m/44'/60'/0'");
console.log('Ethereum xPub:', ethXpub.xpub);

// Root-level xPub (for MPC wallets)
const rootXpub = XPubManager.generateRootXPub(mnemonic);
console.log('Root xPub:', rootXpub.xpub);
```

## 📚 API Reference

### BSVSDK Class

Main SDK class providing all wallet and transaction operations.

#### Constructor

```typescript
new BSVSDK(config?: Partial<BSVSDKConfig>)
```

**Configuration:**
```typescript
interface BSVSDKConfig {
  isTestnet?: boolean;        // Network: testnet (true) or mainnet (false)
  maxAddresses?: number;      // Maximum addresses to generate
  feeRate?: number;           // Default fee rate (satoshis per byte)
  rpcUrl?: string;            // Custom RPC URL
  explorerUrl?: string;       // Custom explorer URL
  defaultAccountIndex?: number; // Default account index
}
```

### Wallet Operations

#### generateMnemonic()

Generate a new 12-word BIP39 mnemonic.

```typescript
const mnemonic: string = sdk.generateMnemonic();
```

#### validateMnemonic(mnemonic: string)

Validate a mnemonic phrase.

```typescript
const isValid: boolean = sdk.validateMnemonic(mnemonic);
```

#### splitMnemonic(mnemonic: string)

Split mnemonic into 3 shards using Shamir Secret Sharing (2/3 threshold).

```typescript
const result: ShardingResult = sdk.splitMnemonic(mnemonic);
// Returns: { shards: string[], threshold: 2, totalShares: 3 }
```

#### combineShards(shards: string[])

Combine 2 shards to reconstruct mnemonic.

```typescript
const mnemonic: string = sdk.combineShards([shard1, shard2]);
```

#### recoverShards(shards: string[])

Recover 3 new shards from 2 existing shards.

```typescript
const result: RecoveryResult = sdk.recoverShards([shard1, shard2]);
// Returns: { shards: string[], threshold: 2, totalShares: 3 }
```

#### generateXPub(mnemonic: string, accountIndex?: number)

Generate extended public key (xPub) from mnemonic (account-level, BSV).

```typescript
const xpub: ExtendedPublicKey = sdk.generateXPub(mnemonic, 0);
// Returns: { xpub: string, network: string, derivationPath: string }
```

#### generateXPubWithCoinType(mnemonic: string, coinType: number, accountIndex: number)

Generate extended public key (xPub) for specific coin type (BSV/BTC).

```typescript
// BSV mainnet (coin type 236)
const bsvXpub = XPubManager.generateXPubWithCoinType(mnemonic, 236, 0);

// BTC (coin type 0)
const btcXpub = XPubManager.generateXPubWithCoinType(mnemonic, 0, 0);
```

#### generateRootXPub(mnemonic: string)

Generate root-level extended public key (xPub) from mnemonic (path "m").

```typescript
const rootXpub = XPubManager.generateRootXPub(mnemonic);
// Returns: { xpub: string, derivationPath: "m" }
```

#### deriveAddressFromXPub(xpub: string, addressIndex: number, changeIndex?: number, addressFormat?: 'p2pkh' | 'p2sh')

Derive address from xPub at specific index.

```typescript
const result: XPubDerivationResult = sdk.deriveAddressFromXPub(
  xpub,
  0,      // address index
  0,      // change index (0 = external, 1 = change)
  'p2pkh' // address format
);
// Returns: { address: string, publicKey: string, derivationPath: string }
```

#### generateKeyPairAtPath(mnemonic: string, path: string, addressFormat?: 'p2pkh' | 'p2sh')

Generate key pair at specific derivation path.

```typescript
const keyPair: KeyPairResult = sdk.generateKeyPairAtPath(
  mnemonic,
  "m/44'/236'/0'/0/0", // Full derivation path
  'p2pkh'
);
// Returns: { address, privateKey, publicKey, derivationPath }
```

### Multi-Blockchain Operations

#### Bitcoin (BTC) Transaction Signing

```typescript
import { BitcoinTransactionSigner } from '@rockwallet/bsv-sdk';

const result = await BitcoinTransactionSigner.signTransaction({
  unsignedTxHex: string;        // Unsigned transaction hex
  utxos: Array<{                // UTXO array
    tx_hash: string;
    vout: number;
    script_pub_key_hex: string;
    value: number;
  }>;
  privateKeys: string[];         // WIF format private keys
  isMainnet?: boolean;           // Network type
  rpcUrl?: string;               // Optional custom RPC URL
});
// Returns: { signedTransactionHex, transactionId }
```

#### BSV Transaction Signing

```typescript
import { BSVTransactionSigner } from '@rockwallet/bsv-sdk';

const result = await BSVTransactionSigner.signTransaction({
  unsignedTxHex: string;         // Unsigned transaction hex
  utxos: Array<{                // UTXO array
    tx_hash: string;
    vout: number;
    script_pub_key_hex?: string;
    value: number;
  }>;
  privateKeys: string[];         // WIF format private keys
  isTestnet?: boolean;           // Network type
  rpcUrl?: string;               // Optional custom RPC URL
});
// Returns: { signedTransactionHex, transactionId }
```

#### Ethereum Transaction Signing

```typescript
import { EthereumTransactionSigner } from '@rockwallet/bsv-sdk';

const result = await EthereumTransactionSigner.signTransaction(
  unsignedTx: string | EthereumTransactionRequest, // RLP-encoded hex or transaction object
  privateKey: string,                              // Hex format private key
  chainId: number                                  // Chain ID (1 = Ethereum mainnet)
);
// Returns: { signedTransactionHex, transactionHash, from, to, value, chainId }
```

#### Ethereum Address Derivation

```typescript
import { EthereumKeyPairManager } from '@rockwallet/bsv-sdk';

const keyPair = EthereumKeyPairManager.deriveEthereumAddress(
  mnemonic,
  "m/44'/60'/0'",  // Account path
  "0/0"            // Address path
);
// Returns: { address, privateKey, publicKey, derivationPath }
```

#### Ethereum xPub Generation

```typescript
import { EthereumKeyPairManager } from '@rockwallet/bsv-sdk';

const xpub = EthereumKeyPairManager.generateEthereumXPub(
  mnemonic,
  "m/44'/60'/0'"   // Account path
);
// Returns: { xpub, derivationPath, publicKey, chainCode }
```

### Transaction Operations

#### signTransaction(params) - BSV

Sign a native BSV transaction.

```typescript
const result = await sdk.signTransaction({
  fromAddress: string;      // Source address
  toAddress: string;        // Destination address
  amount: number;           // Amount in satoshis
  privateKey: string;       // Private key for signing
  feeRate?: number;         // Optional fee rate
  changeAddress?: string;   // Optional change address
});
// Returns: { signedTransactionHex, transactionId, fee, inputs, outputs, amountBSV }
```

#### sendTransaction(fromAddress, toAddress, amount, privateKey, feeRate?)

Send native BSV transaction (sign and broadcast).

```typescript
const result: BroadcastResult = await sdk.sendTransaction(
  'mqbfhksgzwdj6ZzrAQssZqyn1KdTMae6QJ',
  'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef',
  10000, // satoshis
  privateKey,
  5      // fee rate
);
// Returns: { success, transactionId, explorerUrl, error? }
```

#### broadcastTransactionNative(transactionHex: string)

Broadcast signed transaction to BSV network.

```typescript
const result = await sdk.broadcastTransactionNative(signedTxHex);
// Returns: { success: boolean, txid?: string, error?: string }
```

### UTXO & Balance Operations

#### getUTXOs(address: string)

Get unspent transaction outputs for an address.

```typescript
const utxos: UTXO[] = await sdk.getUTXOs(address);
```

#### getBalance(address: string)

Get total balance for an address (in satoshis).

```typescript
const balance: number = await sdk.getBalance(address);
```

#### getNativeBalance(address: string)

Get native BSV balance with detailed information.

```typescript
const balance: NativeBalance = await sdk.getNativeBalance(address);
// Returns: { satoshis, bsv, formatted, confirmed, unconfirmed }
```

#### validateBalance(address: string, amount: number)

Validate if address has sufficient balance.

```typescript
const validation: BalanceValidation = await sdk.validateBalance(address, 10000);
// Returns: { isValid, balance, required, difference, errors[] }
```

#### satoshisToBSV(satoshis: number)

Convert satoshis to BSV string.

```typescript
const bsv: string = sdk.satoshisToBSV(100000000); // "1.00000000"
```

#### bsvToSatoshis(bsv: string | number)

Convert BSV to satoshis.

```typescript
const satoshis: number = sdk.bsvToSatoshis('1.5'); // 150000000
```

### Network Operations

#### getLatestBlock()

Get latest block information.

```typescript
const block: BlockInfo = await sdk.getLatestBlock();
```

#### getTransaction(txid: string)

Get transaction information.

```typescript
const tx: TransactionInfo = await sdk.getTransaction(txid);
```

#### getDynamicFees()

Get dynamic fee estimates.

```typescript
const fees = await sdk.getDynamicFees();
// Returns: { feeRate, recommendedFee, fastFee, slowFee, timestamp }
```

#### checkNetworkStatus()

Check network connection status.

```typescript
const status = await sdk.checkNetworkStatus();
// Returns: { name, isTestnet, connected, rpcUrl, explorerUrl, error? }
```

#### validateAddress(address: string)

Validate BSV address format.

```typescript
const isValid: boolean = sdk.validateAddress(address);
```

#### getExplorerUrl(txid: string)

Get explorer URL for transaction.

```typescript
const url: string = sdk.getExplorerUrl(txid);
```

## 💡 Usage Examples

### Complete Wallet Creation Flow

```typescript
import { BSVSDK } from '@rockwallet/bsv-sdk';

const sdk = new BSVSDK({ isTestnet: true });

// 1. Generate mnemonic
const mnemonic = sdk.generateMnemonic();
console.log('Mnemonic:', mnemonic);

// 2. Split into shards
const shardingResult = sdk.splitMnemonic(mnemonic);
console.log('Shard 1:', shardingResult.shards[0]);
console.log('Shard 2:', shardingResult.shards[1]);
console.log('Shard 3:', shardingResult.shards[2]);

// 3. Generate xPub (account-level)
const xpubResult = sdk.generateXPub(mnemonic);
console.log('xPub:', xpubResult.xpub);

// 4. Generate root-level xPub (for MPC wallets)
const rootXpub = XPubManager.generateRootXPub(mnemonic);
console.log('Root xPub:', rootXpub.xpub);

// 5. Generate first address
const addressResult = sdk.deriveAddressFromXPub(xpubResult.xpub, 0);
console.log('First Address:', addressResult.address);

// 6. Get balance
const balance = await sdk.getNativeBalance(addressResult.address);
console.log('Balance:', balance.formatted, 'BSV');
```

### Multi-Blockchain Wallet

```typescript
import { BSVSDK, XPubManager, EthereumKeyPairManager } from '@rockwallet/bsv-sdk';

const mnemonic = 'your twelve word mnemonic phrase here...';

// Generate xPubs for all blockchains
const bsvXpub = XPubManager.generateXPubWithCoinType(mnemonic, 236, 0); // BSV mainnet
const btcXpub = XPubManager.generateXPubWithCoinType(mnemonic, 0, 0);   // BTC
const ethXpub = EthereumKeyPairManager.generateEthereumXPub(mnemonic, "m/44'/60'/0'"); // Ethereum

// Derive addresses
const bsvAddress = XPubManager.deriveAddressFromXPub(bsvXpub.xpub, 0, 0, 'p2pkh');
const btcAddress = XPubManager.deriveAddressFromXPub(btcXpub.xpub, 0, 0, 'p2pkh');
const ethAddress = EthereumKeyPairManager.deriveEthereumAddress(mnemonic, "m/44'/60'/0'", "0/0");

console.log('BSV Address:', bsvAddress.address);
console.log('BTC Address:', btcAddress.address);
console.log('Ethereum Address:', ethAddress.address);
```

### Transaction Signing (BSV)

```typescript
const sdk = new BSVSDK({ isTestnet: true });

// Recover mnemonic from shards
const mnemonic = sdk.combineShards([shard1, shard2]);

// Generate key pair for account index 0
const keyPair = sdk.generateKeyPairAtIndex(mnemonic, 0, 0);

// Sign transaction
const signedTx = await sdk.signTransaction({
  fromAddress: keyPair.address,
  toAddress: 'mqbfhksgzwdj6ZzrAQssZqyn1KdTMae6QJ',
  amount: 10000, // 10000 satoshis
  privateKey: keyPair.privateKey,
  feeRate: 5
});

console.log('Transaction ID:', signedTx.transactionId);
console.log('Fee:', signedTx.fee, 'satoshis');

// Broadcast transaction
const broadcastResult = await sdk.broadcastTransactionNative(signedTx.signedTransactionHex);
if (broadcastResult.success) {
  console.log('Transaction broadcasted:', broadcastResult.txid);
  console.log('Explorer:', sdk.getExplorerUrl(broadcastResult.txid));
}
```

### Transaction Signing (BTC)

```typescript
import { BitcoinTransactionSigner, XPubManager } from '@rockwallet/bsv-sdk';

const mnemonic = 'your mnemonic...';
const keyPair = XPubManager.generateKeyPairAtPath(mnemonic, "m/44'/0'/0'/0/0");

// Build unsigned transaction (using bitcoinjs-lib or similar)
const unsignedTxHex = '...'; // Your unsigned transaction hex

// Sign transaction
const result = await BitcoinTransactionSigner.signTransaction({
  unsignedTxHex,
  utxos: [{
    tx_hash: '...',
    vout: 0,
    script_pub_key_hex: '...',
    value: 100000
  }],
  privateKeys: [keyPair.privateKey],
  isMainnet: true
});

console.log('Signed TX:', result.signedTransactionHex);
console.log('TX ID:', result.transactionId);
```

### Transaction Signing (Ethereum)

```typescript
import { EthereumTransactionSigner, EthereumKeyPairManager } from '@rockwallet/bsv-sdk';

const mnemonic = 'your mnemonic...';
const keyPair = EthereumKeyPairManager.deriveEthereumAddress(mnemonic, "m/44'/60'/0'", "0/0");

// Create unsigned transaction
const unsignedTx = {
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  value: '0x2386f26fc10000', // 