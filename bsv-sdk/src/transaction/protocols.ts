/**
 * BSV transaction protocol detection for native and non-native token protocols.
 * Used for routing and validation; signing flow (UTXO + keys) remains the same.
 * Uses @bsv/sdk only (BSV); do not mix with bitcoinjs-lib (reserved for BTC services).
 */
import { Transaction as BsvTransaction, OP, LockingScript } from '@bsv/sdk';

/** Supported BSV transaction protocol types */
export type TxProtocol =
  | 'native'
  | 'MNEE'
  | '1Sat'
  | 'MNEE-STAS'
  | 'STAS'
  | 'inscription'
  | 'RUN'
  | 'BCAT'
  | 'paymail'
  | 'covenant'
  | 'custom';

export const PROTOCOL_NAMES: TxProtocol[] = [
  'native',
  'MNEE',
  '1Sat',
  'MNEE-STAS',
  'STAS',
  'inscription',
  'RUN',
  'BCAT',
  'paymail',
  'covenant',
  'custom'
];

const PROTOCOL_SIGNATURES: Array<{ tag: string | RegExp; protocol: TxProtocol }> = [
  { tag: /^bsv-21|"p"\s*:\s*"bsv-21"/i, protocol: '1Sat' },
  { tag: /^bsv-20|"p"\s*:\s*"bsv-20"/i, protocol: '1Sat' },
  { tag: /^1Sat|1sat/i, protocol: '1Sat' },
  { tag: /^STAS|stas/i, protocol: 'STAS' },
  { tag: /^MNEE-STAS|mnee-stas/i, protocol: 'MNEE-STAS' },
  { tag: /^MNEE|mnee/i, protocol: 'MNEE' },
  { tag: /^ord\s|"p"\s*:\s*"ord"/i, protocol: 'inscription' },
  { tag: /^inscription|inscribe/i, protocol: 'inscription' },
  { tag: /^RUN\s|"RUN"|run\s/i, protocol: 'RUN' },
  { tag: /^BCAT|bcat|19Hxig/i, protocol: 'BCAT' },
  { tag: /^paymail|Paymail|paymail:/i, protocol: 'paymail' },
  { tag: /^covenant|stateful|hash.?state|scrypt/i, protocol: 'covenant' },
  { tag: /^SEN|sensible/i, protocol: 'custom' },
  { tag: /^METANET|metanet/i, protocol: 'custom' }
];

export interface DetectResult {
  protocol: TxProtocol;
  outputIndex?: number;
}

/**
 * Detect transaction protocol from unsigned transaction hex by inspecting output scripts.
 */
export function detectTxType(unsignedTxHex: string): DetectResult {
  const trimmed = (unsignedTxHex && typeof unsignedTxHex === 'string')
    ? unsignedTxHex.trim()
    : '';
  if (!trimmed || trimmed.length < 20 || trimmed.length % 2 !== 0) {
    return { protocol: 'native' };
  }
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    return { protocol: 'native' };
  }

  let transaction: BsvTransaction;
  try {
    transaction = BsvTransaction.fromHex(trimmed);
  } catch {
    return { protocol: 'native' };
  }

  const outs = transaction.outputs || [];
  for (let i = 0; i < outs.length; i++) {
    const output = outs[i];
    const lockingScript = output?.lockingScript;
    if (!lockingScript) continue;
    const protocol = detectProtocolFromLockingScript(lockingScript);
    if (protocol !== 'native') {
      return { protocol, outputIndex: i };
    }
  }

  return { protocol: 'native' };
}

function detectProtocolFromLockingScript(lockingScript: LockingScript): TxProtocol {
  try {
    const chunks = lockingScript.chunks;
    if (!chunks || chunks.length < 2) return 'native';
    if (chunks[0].op !== OP.OP_RETURN) {
      if (isStandardP2PKHOrSimilar(lockingScript.toBinary())) return 'native';
      return 'custom';
    }
    const dataChunk = chunks[1];
    const data = dataChunk?.data;
    if (!data || data.length < 2) return 'native';
    const str = Buffer.from(data).toString('utf8');
    const strLower = str.toLowerCase();
    for (const { tag, protocol } of PROTOCOL_SIGNATURES) {
      if (typeof tag === 'string') {
        if (strLower.startsWith(tag.toLowerCase())) return protocol;
      } else {
        if (tag.test(str)) return protocol;
      }
    }
    try {
      const json = JSON.parse(str);
      const p = (json && json.p) ? String(json.p).toLowerCase() : '';
      if (p.includes('bsv-20') || p.includes('bsv-21')) return '1Sat';
      if (p === 'ord' || p.includes('ord')) return 'inscription';
      if (p.includes('stas')) return 'STAS';
      if (p.includes('mnee')) return p.includes('stas') ? 'MNEE-STAS' : 'MNEE';
    } catch {
      // not JSON
    }
    return 'custom';
  } catch {
    return 'native';
  }
}

function isStandardP2PKHOrSimilar(script: number[]): boolean {
  if (script.length >= 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14) return true;
  if (script.length === 35 && script[0] === 33 && script[34] === 0xac) return true;
  if (script.length === 67 && script[0] === 65 && script[66] === 0xac) return true;
  return false;
}

/** Locking script type for choosing correct unlock template (MNEE, 1Sat, STAS, RUN, etc. still use P2PKH or P2PK for owner) */
export type LockingScriptType = 'p2pkh' | 'p2pk' | 'other';

/** P2PKH pattern: OP_DUP OP_HASH160 push(20) ... OP_EQUALVERIFY [OP_CHECKSIG|...]. Standard is 76 a9 14 [20] 88 ac; 1Sat cosigner scripts use 76 a9 14 [20] 88 ad 21 [pubkey]. */
function scriptContainsP2PKH(script: number[] | Uint8Array): boolean {
  const arr = Array.isArray(script) ? script : Array.from(script);
  for (let i = 0; i <= arr.length - 24; i++) {
    if (arr[i] === 0x76 && arr[i + 1] === 0xa9 && arr[i + 2] === 0x14 && arr[i + 23] === 0x88) return true;
  }
  return false;
}

/**
 * Classify a locking script so the signer can pick the correct unlock template.
 * MNEE, 1Sat, STAS, RUN, inscription, BCAT etc. use P2PKH (or P2PK) for the spendable part.
 * Token outputs (1Sat/BSV-20, MNEE) often have a full script = protocol data + P2PKH; we allow those and sign with the full script as subscript.
 */
export function getLockingScriptType(lockingScript: LockingScript): LockingScriptType {
  try {
    const script = lockingScript.toBinary();
    const arr: number[] = Array.isArray(script) ? (script as number[]) : Array.from(script as ArrayLike<number>);
    if (arr.length >= 25 && arr[0] === 0x76 && arr[1] === 0xa9 && arr[2] === 0x14) return 'p2pkh';
    if (arr.length === 35 && arr[0] === 33 && arr[34] === 0xac) return 'p2pk';
    if (arr.length === 67 && arr[0] === 65 && arr[66] === 0xac) return 'p2pk';
    if (scriptContainsP2PKH(arr)) return 'p2pkh';
    return 'other';
  } catch {
    return 'other';
  }
}

export function isAllowedProtocol(value: string): value is TxProtocol {
  return PROTOCOL_NAMES.includes(value as TxProtocol);
}

/** True if the locking script is 1Sat-style: OP_FALSE OP_IF ... OP_ENDIF <spendable> (e.g. MNEE/BSV-20 cosigner). */
export function is1SatStyleScript(lockingScript: LockingScript): boolean {
  try {
    const script = lockingScript.toBinary();
    const arr: number[] = Array.isArray(script) ? (script as number[]) : Array.from(script as ArrayLike<number>);
    return arr.length >= 3 && arr[0] === 0x00 && arr[1] === 0x63;
  } catch {
    return false;
  }
}

const OP_ENDIF = 0x68;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;

/**
 * For 1Sat-style scripts (OP_FALSE OP_IF ... OP_ENDIF <spendable part>), the sighash scriptCode
 * must be only the part that actually runs (after OP_ENDIF). Otherwise the node can fail with
 * "Operation not valid with the current stack size". Returns null if not a 1Sat-style script.
 */
export function getEffectiveScriptFor1Sat(lockingScript: LockingScript): LockingScript | null {
  try {
    const script = lockingScript.toBinary();
    const arr: number[] = Array.isArray(script) ? (script as number[]) : Array.from(script as ArrayLike<number>);
    if (arr.length < 3 || arr[0] !== 0x00 || arr[1] !== 0x63) return null; // OP_FALSE OP_IF
    let pos = 2;
    while (pos < arr.length) {
      const b = arr[pos];
      if (b === OP_ENDIF) {
        const afterEndIf = arr.slice(pos + 1);
        if (afterEndIf.length === 0) return null;
        const hex = Buffer.from(afterEndIf).toString('hex');
        return LockingScript.fromHex(hex);
      }
      if (b >= 1 && b <= 75) {
        pos += 1 + b;
        continue;
      }
      if (b === OP_PUSHDATA1) {
        if (pos + 2 > arr.length) return null;
        pos += 2 + arr[pos + 1];
        continue;
      }
      if (b === OP_PUSHDATA2) {
        if (pos + 4 > arr.length) return null;
        pos += 4 + (arr[pos + 1]! | (arr[pos + 2]! << 8));
        continue;
      }
      if (b === OP_PUSHDATA4) {
        if (pos + 6 > arr.length) return null;
        pos += 6 + (arr[pos + 1]! | (arr[pos + 2]! << 8) | (arr[pos + 3]! << 16) | (arr[pos + 4]! << 24));
        continue;
      }
      pos += 1;
    }
    return null;
  } catch {
    return null;
  }
}
