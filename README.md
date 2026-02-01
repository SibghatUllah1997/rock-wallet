# MPC Rockwallet Backend

Monorepo for the MPC Rockwallet backend API and the multi-chain BSV SDK. Supports Bitcoin SV (BSV), Bitcoin (BTC), and Ethereum/EVM with secure sharding, UTXO-based signing, and MNEE token flows.

---

## Monorepo structure

| Workspace        | Description |
|-----------------|-------------|
| `backend-service` | Express API: MPC wallets, addresses, balances, transaction signing, MNEE cosigner integration |
| `bsv-sdk`         | TypeScript SDK: sharding, key derivation, BSV/BTC/ETH signers, transaction building, UTXO management |

The backend depends on the built SDK (`bsv-sdk/dist`). Build order is SDK first, then backend.

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** 7+ (for workspaces)

---

## Quick start

From the **repository root**:

```bash
# Install dependencies for all workspaces (backend + SDK)
npm install

# Build SDK then backend
npm run build

# Run the backend (production)
npm start

# Run the backend in development (ts-node)
npm run dev
```

- **`npm install`** — Installs dependencies for `backend-service` and `bsv-sdk`.
- **`npm run build`** — Builds `@rockwallet/bsv-sdk` then `bsv-wallet-backend-service`.
- **`npm start`** — Runs the backend: `node backend-service/dist/index.js`.
- **`npm run dev`** — Runs the backend with `ts-node` (no pre-build required for backend; SDK must be built for full functionality).

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
npm run start -w bsv-wallet-backend-service
```

---

## Environment

Configure the backend via environment variables (e.g. `.env` in `backend-service/` or in the shell). Common options:

- **MongoDB**: connection string and DB name (see `backend-service` for exact vars).
- **BSV**: `BSV_NETWORK=mainnet` or `testnet` for wallet/network.
- **BTC**: `BTCTESTNET=true` to allow BTC testnet paths (e.g. `m/44'/1'/0'`) for signing/xpub.
- **MNEE**: `MNEE_API_KEY` optional for MNEE cosigner/transfer flows.

---

## Chain integration

- **BSV** — Uses **`@bsv/sdk`** only for transactions and scripts (builder, signer, protocols, tokens). No `bitcoinjs-lib` in BSV code paths.
- **Bitcoin (BTC)** — Uses **`bitcoinjs-lib`** (e.g. `bsv-sdk/src/transaction/bitcoin.ts`) for SegWit/legacy signing.
- **Ethereum** — Uses **ethers** (e.g. `bsv-sdk/src/transaction/ethereum.ts`, `bsv-sdk/src/wallet/ethereum.ts`).

---

## Mainnet vs testnet

- **Wallet creation** uses **`BSV_NETWORK`** only (not `BTCTESTNET`). Use `BSV_NETWORK=mainnet` for mainnet.
- **`BTCTESTNET`** only affects **sign** and **generate account xpub**: when `BTCTESTNET=true`, coin type 1 (BTC testnet) is allowed; when unset or false, coin type 1 is rejected for mainnet wallets.
- For **Bitcoin mainnet** signing/xpub use `account_path: "m/44'/0'/0'"` (coin type 0).

---

## Non-native BSV and sign API

The backend supports **native BSV** and **non-native token protocols** with the same UTXO-based sign flow.

**Supported transaction types:** `native`, `MNEE`, `1Sat`, `MNEE-STAS`, `STAS`, `inscription`, `RUN`, `BCAT`, `paymail`, `covenant`, `custom`.

- **Sign request** can include optional `tx_type`; if omitted, the backend detects the protocol from `tx_data` (unsigned tx hex).
- For **BSV non-native** (MNEE, 1Sat, etc.): **`script_pub_key_hex`** is required per UTXO and must be the **exact scriptPubKey of the output being spent** (P2PKH/P2PK), not the OP_RETURN or protocol data output.
- **MNEE cosigned flow:** Use **`mnee_recipients`** in the sign request (no `tx_data`/`utxos`). Backend calls `mnee.transfer()` and returns the cosigned raw tx in `data.tx_data`; broadcast that hex separately (e.g. WhatsOnChain or MNEE `submitRawTx`).

**Example sign body (MNEE cosigned):**

```json
{
  "tx_id": "mnee-sign-1",
  "wallet_key": "{{wallet_key}}",
  "blockchain_type": "UTXO_BASED",
  "network_fee": 5,
  "account_path": "m/44'/236'/0'",
  "mnee_recipients": [
    { "address": "17nrTWVw2sBtRmQ4rxYoenF9YWmsFZzyyZ", "amount": 0.001 }
  ]
}
```

---

## Scripts (payloads, MNEE, BTC)

Scripts in `scripts/` often need the SDK or shared deps. From repo root, use `NODE_PATH=bsv-sdk/node_modules` so they resolve `@bsv/sdk` and `@mnee/ts-sdk`:

```bash
# MNEE cosigned transfer (create-and-hold)
RECIPIENT_ADDRESS=1Addr... AMOUNT=0.001 node scripts/create-and-broadcast-mnee.js
NODE_PATH=bsv-sdk/node_modules node scripts/create-and-broadcast-mnee.js

# Full MNEE flow: sign via API then MNEE cosigner + broadcast
SIGN_API_URL=https://your-api.com WALLET_ID=... WALLET_KEY=... \
  SENDER_ADDRESS=1Addr... RECIPIENT_ADDRESS=1Addr... AMOUNT=0.001 \
  node scripts/transfer-mnee-complete.js

# Create MNEE sign payload (for Postman / API testing)
NODE_PATH=bsv-sdk/node_modules node scripts/create-mnee-payload.js
```

Ensure the SDK is built before scripts that require it: `npm run build` (or `npm run build -w @rockwallet/bsv-sdk`).

---

## Testing

From root:

- **All:** `npm test` (runs SDK then backend tests).
- **SDK only:** `npm run test:sdk`.
- **Backend only:** `npm run test:backend`.

---

## License

ISC.
