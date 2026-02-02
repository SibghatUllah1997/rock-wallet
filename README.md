# MPC Rockwallet Backend

Monorepo for the MPC Rockwallet backend API and the multi-chain BSV SDK. Supports **Bitcoin SV (BSV)**, **Bitcoin (BTC)**, and **Ethereum/EVM** with secure sharding (Shamir Secret Sharing), UTXO-based signing, account-based (EVM) signing, and MNEE token flows.

---

## Table of contents

- [Monorepo structure](#monorepo-structure)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Root scripts](#root-scripts)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [Chain integration](#chain-integration)
- [Mainnet vs testnet](#mainnet-vs-testnet)
- [Sign Transaction API](#sign-transaction-api)
- [Ethereum signable payload](#ethereum-signable-payload)
- [Bitcoin (BTC) payloads](#bitcoin-btc-payloads)
- [Scripts reference](#scripts-reference)
- [Postman](#postman)
- [Testing](#testing)
- [License](#license)

---

## Monorepo structure

| Workspace        | Description |
|-----------------|-------------|
| **backend-service** | Express API: MPC wallet create/recover, account xpub generation, transaction signing (BSV/BTC/ETH), MNEE cosigner integration, JWT/auth, MongoDB. |
| **bsv-sdk**         | TypeScript SDK: Shamir sharding, BIP32/BIP44 key derivation, BSV/BTC/ETH signers, transaction building, UTXO management, MNEE integration. |

The backend depends on the **built** SDK (`bsv-sdk/dist`). Build order: **SDK first**, then backend.

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** 7+ (for workspaces)
- **MongoDB** (or Amazon DocumentDB) for wallet/shard storage

---

## Quick start

From the **repository root**:

```bash
# Install dependencies for all workspaces (backend + SDK)
npm install

# Build SDK then backend (required before first run)
npm run build

# Run the backend (production)
npm start

# Run the backend in development (ts-node; SDK must still be built)
npm run dev
```

- **`npm install`** — Installs dependencies for `backend-service` and `bsv-sdk`.
- **`npm run build`** — Builds `@rockwallet/bsv-sdk` then `bsv-wallet-backend-service`.
- **`npm start`** — Runs the backend: `node backend-service/dist/index.js`.
- **`npm run dev`** — Runs the backend with `ts-node` (no pre-build required for backend code; SDK must be built for full functionality).

---

## Root scripts

| Script           | Command | Description |
|------------------|--------|-------------|
| Install          | `npm install` | Install all workspace dependencies |
| Build            | `npm run build` | Build SDK, then backend |
| Start backend    | `npm start` | Run backend (production) |
| Dev backend      | `npm run dev` | Run backend with ts-node |
| Test all         | `npm test` | Run SDK tests then backend tests |
| Test SDK         | `npm run test:sdk` | Run only bsv-sdk tests |
| Test backend     | `npm run test:backend` | Run only backend-service tests |

To build or run a single workspace:

```bash
npm run build -w @rockwallet/bsv-sdk
npm run build -w bsv-wallet-backend-service
npm start -w bsv-wallet-backend-service
```

---

## Environment variables

Configure the backend via a `.env` file in `backend-service/` or via shell exports. Common variables:

### MongoDB

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | **Required.** Connection string (e.g. `mongodb://localhost:27017/bsv-wallet-service`). |
| `MONGODB_USE_TLS` | Set to `true` for TLS (e.g. DocumentDB). |
| `MONGODB_CA_PATH` | Path to CA certificate when using TLS. |

### Backend

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `3000`). |
| `NODE_ENV` | `development` \| `production` \| `test`. |
| `API_VERSION` | API version prefix (default `v1`). |
| `LOG_FORMAT` | Morgan log format (default `combined`). |

### BSV network

| Variable | Description |
|----------|-------------|
| `BSV_NETWORK` | `mainnet` or `testnet`. Used for wallet creation, BSV RPC, and MNEE. |
| `BSV_RPC_URL` | Optional. Override RPC/explorer base (e.g. WhatsOnChain). |
| `BSV_EXPLORER_URL` | Optional. Override explorer URL. |

### Bitcoin (BTC)

| Variable | Description |
|----------|-------------|
| `BTCTESTNET` | Set to `true` to allow BTC **testnet** (coin type 1, path `m/44'/1'/0'`). When unset or `false`, only mainnet (coin type 0, `m/44'/0'/0'`) is allowed for signing and xpub. |

### MNEE (BSV tokens)

| Variable | Description |
|----------|-------------|
| `MNEE_API_KEY` | Optional. API key for MNEE cosigner/transfer flows. |

### Security and auth

| Variable | Description |
|----------|-------------|
| `SHARD_ENCRYPTION_KEY` | **Required for create/recover/sign.** Key used to encrypt/decrypt shards (min length enforced in development). |
| `JWT_SECRET` | **Required for JWT auth.** Used to sign/verify JWT tokens. |
| `JWT_EXPIRES_IN` | Token expiry (default `24h`). |
| `API_USERNAME` / `API_PASSWORD` | Optional. Basic auth for non-MPC routes. |
| `AUTHME_BASE_URL` | Optional. AuthMe service URL for JWT verification. |
| `JWT_EXPECTED_ISSUER` | Optional. Expected JWT issuer for verification. |

---

## API overview

- **Base URL (MPC):** `/rwcore/api/v1/mpc`
- **Other APIs:** `/api/v1/auth`, `/api/v1/wallets`, `/api/v1/users`, etc. (see `backend-service/src/index.ts`).

### MPC endpoints (all require Bearer token and MPC headers)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rwcore/api/v1/mpc/wallets/create` | Create wallet (2-of-3 shards). Body: `wallet_id`. Returns shards and `xpub_hash` (store for recovery). |
| POST | `/rwcore/api/v1/mpc/wallets/recovery` | Recover wallet. Body: `wallet_id`, `wallet_key`, `xpub_hash`, shards. Validates `xpub_hash` (case-insensitive; fallback to hash of stored xpub). |
| POST | `/rwcore/api/v1/mpc/wallets/:wallet_id/accounts/xpub` | Generate account-level xpub. Body: `account_path` (e.g. `m/44'/236'/0'` BSV, `m/44'/60'/0'` ETH, `m/44'/0'/0'` BTC mainnet, `m/44'/1'/0'` BTC testnet). |
| POST | `/rwcore/api/v1/mpc/wallets/:wallet_id/transactions/sign` | Sign transaction. Body: `tx_id`, `tx_data`, `wallet_key`, `blockchain_type`, `network_fee`, `account_path`, and either `account_chain_details` (Ethereum) or `utxos` (BSV/BTC), or `mnee_recipients` (MNEE flow). |

Required MPC headers (examples): `X-RW-Device-ID`, `X-RW-Client-ID`, `X-RW-Request-ID`, `X-RW-Session-ID`, `X-RW-Correlation-ID`, `X-RW-Forwarded-Proto`, `X-RW-Forwarded-Port`, `X-Forwarded-For`, `User-Agent`, `Content-Type`, `Connection`, `Accept`, `Host`, `Date`.

---

## Chain integration

| Chain | Library | Usage in codebase |
|-------|---------|-------------------|
| **BSV** | `@bsv/sdk` only | Transactions, scripts, builder, signer, protocols, tokens. No `bitcoinjs-lib` in BSV signing paths. |
| **Bitcoin (BTC)** | `bitcoinjs-lib` | SegWit (P2WPKH) and legacy (P2PKH) signing in `bsv-sdk/src/transaction/bitcoin.ts`. |
| **Ethereum** | `ethers` | Signing in `bsv-sdk/src/transaction/ethereum.ts`; key derivation in `bsv-sdk/src/wallet/ethereum.ts`. |

---

## Mainnet vs testnet

- **Wallet creation** uses **`BSV_NETWORK`** only (not `BTCTESTNET`). Use `BSV_NETWORK=mainnet` for production BSV.
- **`BTCTESTNET`** affects only **Sign** and **Generate account xpub**: when `BTCTESTNET=true`, coin type **1** (BTC testnet) is allowed; when unset or `false`, coin type 1 is rejected (mainnet-only).
- **Account paths:**
  - BSV mainnet: `m/44'/236'/0'`; BSV testnet: `m/44'/1'/0'`.
  - BTC mainnet: `m/44'/0'/0'`; BTC testnet: `m/44'/1'/0'`.
  - Ethereum: `m/44'/60'/0'` (same path for mainnet/testnet; chain distinguished by `chain_id`).

---

## Sign Transaction API

### Blockchain types

- **`UTXO_BASED`** — BSV or Bitcoin. Requires `tx_data` (unsigned transaction hex) and `utxos` (each with `tx_hash`, `vout`, `script_pub_key_hex`, `value`, `address_path`). Optional `tx_type` for BSV protocol; backend can auto-detect from hex.
- **`ACCOUNT_BASED`** — Ethereum/EVM. Requires `tx_data` (base64-encoded RLP unsigned transaction hex), `account_path: "m/44'/60'/0'"`, and `account_chain_details`: `{ address, address_path, chain_id }`.

### tx_data formats

- **UTXO (BSV/BTC):** Raw unsigned transaction **hex string** (no base64). For BTC legacy, each UTXO in the sign request must include `previous_tx_hex` (full previous tx hex) in addition to `script_pub_key_hex`.
- **Ethereum:** **Base64-encoded** RLP unsigned transaction hex. Backend decodes base64 → hex, then passes hex to the SDK. Build with ethers: `Transaction.from(txRequest).unsignedSerialized`, then base64-encode the hex (see [Ethereum signable payload](#ethereum-signable-payload)).

### MNEE (BSV non-native) cosigned flow

- Send **`mnee_recipients`** instead of `tx_data`/`utxos`: array of `{ address, amount }`.
- Backend builds and cosigns the transfer, returns raw tx in `data.tx_data`; client broadcasts that hex (e.g. WhatsOnChain or MNEE `submitRawTx`).

### BSV non-native (MNEE, 1Sat, etc.) with pre-built tx

- For pre-built unsigned hex, each UTXO must include **`script_pub_key_hex`** set to the **exact scriptPubKey of the output being spent** (P2PKH/P2PK), not the OP_RETURN or protocol output.

### BTC SegWit vs Legacy

- **SegWit (P2WPKH):** `script_pub_key_hex` per UTXO; no `previous_tx_hex` required.
- **Legacy (P2PKH):** `script_pub_key_hex` **and** `previous_tx_hex` (full previous transaction hex) per UTXO.

---

## Ethereum signable payload

For **ACCOUNT_BASED** (Ethereum), the backend expects:

- **tx_data:** Base64-encoded RLP unsigned transaction hex (built with ethers).
- **account_path:** `m/44'/60'/0'`.
- **account_chain_details:** `{ address, address_path: "0/0", chain_id }`. `address` must be the sender derived from your account xpub at `0/0`.

Use the script **`scripts/build-eth-sign-payload.js`** to build a signable payload from your Ethereum account xpub (e.g. from Generate account xpub with path `m/44'/60'/0'`).

**Example (repo root):**

```bash
ETH_XPUB="xpub6DLsoMhXZ1Q12VR8QoZVgicM4vh3ifey2catrQgxYmLG67spaEBK44ykBTKnxLkAof9BG6yQxAaCg8aeUTKVtCzbuTRWhhSfPCLa11BHUu2" \
TO_ADDRESS="0x<40 hex chars>" \
VALUE_WEI=1000000000000000 \
CHAIN_ID=1 \
NONCE=0 \
NODE_PATH=bsv-sdk/node_modules node scripts/build-eth-sign-payload.js
```

**Environment variables (script):**

| Variable | Description |
|----------|-------------|
| `ETH_XPUB` | Account-level xpub (m/44'/60'/0'). Required. |
| `TO_ADDRESS` | Recipient address (0x + 40 hex chars). Required. |
| `VALUE_WEI` | Amount in wei (default 0). Can be hex, e.g. `0x2386f26fc10000`. |
| `CHAIN_ID` | Chain ID (1=mainnet, 5=goerli, 11155111=sepolia, 56=BSC, etc.). Default 1. |
| `NONCE` | Sender nonce (default 0). |
| `GAS_LIMIT` | Gas limit (default 21000). |
| `GAS_PRICE` | Legacy gas price (wei). Used if EIP-1559 not set. |
| `MAX_FEE_PER_GAS` / `MAX_PRIORITY_FEE` | EIP-1559 fees (wei). If both set, EIP-1559 tx is built. |
| `TX_ID` | Optional tx_id. Default `eth-sign-<timestamp>`. |
| `WALLET_KEY` | Placeholder or real (default `{{wallet_key}}`). |

The script prints a JSON body you can merge with `wallet_id` and send to **POST** `/rwcore/api/v1/mpc/wallets/:wallet_id/transactions/sign` with `blockchain_type: "ACCOUNT_BASED"`.

---

## Bitcoin (BTC) payloads

### Build real SegWit and Legacy payloads

**`scripts/build-btc-real-payloads.js`** fetches live UTXOs from Blockstream (testnet or mainnet), builds unsigned tx, and outputs payloads compatible with the Sign API.

**Example (repo root):**

```bash
SEGWIT_ADDRESS="tb1q..." \
LEGACY_ADDRESS="n..." \
DEST_ADDRESS="muBHrgGpKFwDwvqHnNHyywqBBarWpRr4Yh" \
NODE_PATH=bsv-sdk/node_modules node scripts/build-btc-real-payloads.js
```

**Environment variables:** `SEGWIT_ADDRESS`, `LEGACY_ADDRESS`, `DEST_ADDRESS`, `SEGWIT_AMOUNT_SATS`, `LEGACY_AMOUNT_SATS`, `NETWORK_FEE`, `ACCOUNT_PATH`, `ADDRESS_PATH`, `BTC_TESTNET`, `WALLET_KEY`, `WRITE_FILES`. See script header for defaults.

### Derive BTC addresses from xpub

**`scripts/derive-btc-addresses-from-xpub.js`** derives SegWit (P2WPKH) and Legacy (P2PKH) sender addresses from an account-level xpub (e.g. from Generate account xpub with `m/44'/0'/0'` or `m/44'/1'/0'`).

```bash
XPUB="tpub..." ADDRESS_PATH=0/0 NODE_PATH=bsv-sdk/node_modules node scripts/derive-btc-addresses-from-xpub.js
```

---

## Scripts reference

Scripts in `scripts/` often need the SDK or shared deps. From repo root, use **`NODE_PATH=bsv-sdk/node_modules`** so they resolve `ethers`, `bitcoinjs-lib`, `@bsv/sdk`, `@mnee/ts-sdk`, etc. Ensure SDK is built: `npm run build` or `npm run build -w @rockwallet/bsv-sdk`.

| Script | Purpose |
|--------|---------|
| **build-eth-sign-payload.js** | Build Ethereum (ACCOUNT_BASED) sign payload: derive sender from xpub, build RLP unsigned tx, output base64 tx_data + account_chain_details. |
| **build-btc-real-payloads.js** | Fetch UTXOs from Blockstream, build SegWit and Legacy sign payloads for backend. |
| **derive-btc-addresses-from-xpub.js** | Derive SegWit and Legacy BTC addresses from account xpub. |
| **build-bsv-native-payload.js** | Build BSV native (P2PKH) sign payload. |
| **create-mnee-payload.js** | Create MNEE cosigned sign payload (mnee_recipients) for Postman/API testing. |
| **create-and-broadcast-mnee.js** | MNEE cosigned transfer and broadcast (env: RECIPIENT_ADDRESS, AMOUNT). |
| **transfer-mnee-complete.js** | Full MNEE flow: sign via API then MNEE cosigner + broadcast (env: SIGN_API_URL, WALLET_ID, WALLET_KEY, SENDER_ADDRESS, RECIPIENT_ADDRESS, AMOUNT). |
| **fetch-and-build-two-payloads.js** | Fetch UTXOs and build two payloads (e.g. SegWit + Legacy) with env-based addresses. |
| **bitcoin-offline-segwit-signing-example.js** | Example SegWit signing with bitcoinjs-lib. |
| **print-segwit-payload.js**, **print-legacy-payload.js**, **print-mnee-sign-payload.js** | Print example payloads for testing. |

---

## Postman

- **Collection:** `MPC Wallet APIs - Complete Test Suite (All Scenarios).postman_collection.json`
- **Environment:** `MPC API - Local Development.postman_environment.json`

The collection includes scenarios for:

- Create wallet, Recover wallet, Generate account xpub
- Sign (BSV Native), Sign (BSV MNEE), Sign (BTC SegWit), Sign (BTC Legacy)
- Sign (Ethereum): use payload from `build-eth-sign-payload.js` (set `tx_data`, `account_path`, `account_chain_details`, `blockchain_type: ACCOUNT_BASED`).

---

## Testing

From repo root:

- **All:** `npm test` (runs SDK then backend tests).
- **SDK only:** `npm run test:sdk`.
- **Backend only:** `npm run test:backend`.

Backend tests may require MongoDB (e.g. `MONGODB_URI` or `MONGODB_TEST_URI`). See `backend-service/tests/setup.ts` and `jest.config.js`.

---

## License

ISC.
