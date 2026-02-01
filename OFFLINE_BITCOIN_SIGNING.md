# Fully Offline Bitcoin Transaction Signing (SegWit Only)

Production-oriented guide for **fully offline** Bitcoin signing using **SegWit (witness) inputs only**: P2WPKH, P2WSH, Taproot (P2TR). No legacy P2PKH, no previous transaction hex, no network access.

---

## 1. Why Legacy Inputs Cannot Be Signed Fully Offline (Without Previous Tx)

### Mathematical vs. specification requirement

- **Mathematically**, legacy (P2PKH) sighash can be computed with only:
  - outpoint (txid + vout)
  - value
  - scriptPubKey (e.g. `76a914<hash160(pubkey)>88ac`)

  So in theory you do **not** need the full previous transaction bytes to produce a valid signature.

- **In practice**, BIP 174 (PSBT) and common libraries (e.g. bitcoinjs-lib) require **nonWitnessUtxo** (full previous transaction) for **non-segwit** inputs because:
  1. **Integrity**: The signer verifies that `double-SHA256(nonWitnessUtxo) === prevout hash` and that the output at `vout` matches the claimed scriptPubKey. That prevents signing a tx that spends a different UTXO than the one described.
  2. **No trusted “UTXO oracle”**: Without the full tx, the signer would have to trust that (txid, vout, value, scriptPubKey) is correct. In air-gapped/MPC/hardware setups, the rule is: **never trust; always verify**. The only way to verify without the network is to have the full previous tx.

So:

- **Legacy (P2PKH)**: Fully offline signing **without** previous tx hex is possible only with a **custom** signer that skips that verification and uses only (txid, vout, value, scriptPubKey). Standard PSBT flow and libraries expect `nonWitnessUtxo` for legacy → **we treat legacy as “not fully offline” in the sense of “no previous tx required”.**
- **SegWit**: The signed message (sighash) is defined so that **script + value** are enough; no full previous tx is committed or needed. PSBT allows **witnessUtxo only** for SegWit → **fully offline with no previous tx hex.**

---

## 2. How SegWit Sighash Removes the Need for Full Previous Tx

### SegWit v0 (P2WPKH, P2WSH)

- Sighash commits: `version || hashPrevouts || hashSequence || outpoint || scriptCode || value || sequence || hashOutputs || locktime`.
- **scriptCode** is derived from the **scriptPubKey** (e.g. for P2WPKH it’s the P2PKH script of the 20-byte hash).
- **value** is the UTXO value in satoshis.
- The **full previous transaction** is **not** part of the signed message. Only (outpoint, scriptCode, value, sequence, outputs, locktime, …) are.

So the signer needs per input:

- outpoint (txid + vout)
- **scriptPubKey** (to build scriptCode)
- **value**

→ **witnessUtxo = { script, value }** is sufficient. No `nonWitnessUtxo`.

### Taproot (P2TR)

- Sighash (BIP 341) commits: outpoint, value, scriptPubKey (or key path), sequence, hashOutputs, locktime, etc.
- Again, the **previous tx** is not in the message; only **value** and **script** (or internal key) are.

So for Taproot as well, **witnessUtxo { script, value }** (plus Taproot-specific fields like `tapInternalKey` or `tapLeafScript`) is enough. No previous tx hex.

---

## 3. Minimum UTXO Data Required to Sign (SegWit Only)

| Field           | Required | Description |
|----------------|----------|-------------|
| **txid**       | Yes      | 32-byte previous tx hash (API often as hex, 64 chars). |
| **vout**       | Yes      | Output index (0-based). |
| **value**      | Yes      | Amount in satoshis (number or bigint). |
| **scriptPubKey** | Yes    | Exact script (hex or buffer). P2WPKH: `0014<h20>`, P2WSH: `0020<h32>`, P2TR: `5120<xonly32>`. |

**Not required:** previous transaction hex, block height, confirmations, or any network call.

---

## 4. Exact PSBT Input Fields for Offline Signing

### P2WPKH

```ts
{
  hash: Buffer (32 bytes, txid in natural/hash order),
  index: number,
  witnessUtxo: {
    script: Buffer,   // P2WPKH scriptPubKey: 0x00 0x14 <20-byte pubkey hash>
    value: bigint     // satoshis
  }
  // optional: bip32Derivation for HD
}
```

**No** `nonWitnessUtxo`.

### P2WSH

```ts
{
  hash: Buffer,
  index: number,
  witnessUtxo: { script: Buffer, value: bigint },
  witnessScript: Buffer   // the redeem script (inside the P2WSH)
  // optional: bip32Derivation
}
```

**No** `nonWitnessUtxo`.

### Taproot (key path spend)

```ts
{
  hash: Buffer,
  index: number,
  witnessUtxo: { script: Buffer, value: bigint },
  tapInternalKey: Buffer   // 32-byte x-only public key
  // optional: tapBip32Derivation
}
```

**No** `nonWitnessUtxo`.

### Taproot (script path)

```ts
{
  hash: Buffer,
  index: number,
  witnessUtxo: { script: Buffer, value: bigint },
  tapLeafScript: [ { script: Buffer, leafVersion: number, controlBlock: Buffer } ],
  // ...
}
```

---

## 5. Minimal PSBT Structure (Offline, SegWit Only)

- **Global**: unsigned transaction (version, inputs with empty witness, outputs, locktime).
- **Per input**: `hash`, `index`, `witnessUtxo`; for P2WSH add `witnessScript`; for P2TR add `tapInternalKey` or `tapLeafScript` as needed.
- **No** `nonWitnessUtxo` anywhere.
- **Outputs**: same as in the unsigned tx (script + value).

---

## 6. Example Fake UTXO Input (P2WPKH)

```json
{
  "tx_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "vout": 0,
  "script_pub_key_hex": "0014b3b8e3c3e8e3c3e8e3c3e8e3c3e8e3c3e8e3c3e8",
  "value": 100000
}
```

- `tx_hash`: 64 hex chars (32 bytes); can be placeholder for testing.
- `script_pub_key_hex`: P2WPKH = `00 14` + 20-byte pubkey hash (40 hex chars) = 22 bytes = 44 hex chars. Use the hash that matches the key you will sign with.
- `value`: satoshis (e.g. 100000).

No `previous_tx_hex`; signer uses only these fields.

---

## 7. Signing Flow (Step-by-Step)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. UNSIGNED TX + UTXO METADATA (offline)                                 │
│    • unsignedTxHex (inputs have empty scriptSig/witness)                 │
│    • Per input: txid, vout, value, scriptPubKey (SegWit only)           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. BUILD PSBT (offline)                                                  │
│    • Create PSBT from unsigned tx                                       │
│    • For each input: add hash, index, witnessUtxo { script, value }      │
│    • Do NOT add nonWitnessUtxo                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. SIGN (offline)                                                        │
│    • For each input: psbt.signInput(i, keyPair)                         │
│    • Sighash uses only witnessUtxo (script + value)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. FINALIZE & EXTRACT (offline)                                          │
│    • psbt.finalizeAllInputs()                                            │
│    • psbt.extractTransaction() → signed tx                               │
│    • Optional: fix input hash byte order for wire (see implementation)   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. BROADCAST (online, optional)                                          │
│    • Send signed hex to node / API. Not required for “signing” itself.   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Common Errors and Fixes

| Error | Cause | Fix |
|-------|--------|-----|
| **"nonWitnessUtxo required"** | Library or flow expects full prev tx for a **non-SegWit** input. | Use **SegWit** inputs only (P2WPKH/P2WSH/P2TR) and supply only **witnessUtxo**. Do not use legacy P2PKH if you want no previous tx. |
| **"Input amount missing"** | `witnessUtxo.value` missing or wrong type. | Set `witnessUtxo: { script, value }` with **value** as **bigint** (satoshis). |
| **"witnessUtxo missing"** | Input added without witness data. | For every SegWit input add `witnessUtxo: { script: Buffer(scriptPubKey), value: bigint }`. |
| **"Can not sign for this input with the key"** | scriptPubKey does not match the key used. | Ensure scriptPubKey is the one for the signing key (e.g. P2WPKH = 0014<RIPEMD160(SHA256(pubkey))>). |
| **"Non-witness UTXO hash doesn't match"** | You supplied nonWitnessUtxo but its hash ≠ prevout. | For offline SegWit-only, **do not supply nonWitnessUtxo**. Use witnessUtxo only. |

---

## 9. MPC / Threshold Signing Compatibility

- **Same PSBT, multiple signers**: Build PSBT once (unsigned tx + witnessUtxo per input). Export PSBT (base64). Each signer imports, signs their inputs, exports. Combine partial PSBTs or pass a single PSBT from signer to signer.
- **No network**: Each signer only needs the PSBT and their keys; no RPC, no prev tx fetch.
- **Hardware / HSM**: Device receives PSBT (or relevant input subset), returns partial signatures; same witnessUtxo-only input structure.
- **Threshold (e.g. 2-of-3)**: For single-sig P2WPKH you still have one key per UTXO; for multisig (P2WSH or Taproot script path), add `witnessScript` / `tapLeafScript` and have each signer sign; combine into one witness.

---

## 10. Node.js example (P2WPKH, no previous_tx_hex)

From repo root (requires bsv-sdk dependencies):

```bash
NODE_PATH=bsv-sdk/node_modules node scripts/bitcoin-offline-segwit-signing-example.js
```

The script builds a minimal PSBT with **witnessUtxo only**, signs with a derived or test key, and prints the signed tx hex. No network, no `previous_tx_hex`.

## 11. References

- BIP 141 (SegWit), BIP 143 (v0 sighash), BIP 174 (PSBT), BIP 341/342 (Taproot).
- bitcoinjs-lib: use `witnessUtxo` only for SegWit; do not add `nonWitnessUtxo` for fully offline flow.
