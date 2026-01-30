declare module 'bsv' {
  export class PrivKey {
    static fromWif(wif: string): PrivKey;
    static fromRandom(): PrivKey;
    toAddress(network?: string): Address;
    toPubKey(): PubKey;
    toWif(): string;
    toString(): string;
  }

  export class PubKey {
    static fromBuffer(buffer: Buffer): PubKey;
    toAddress(network?: string): Address;
    toBuffer(): Buffer;
    toString(): string;
  }

  export class Address {
    static fromString(address: string): Address;
    toString(): string;
  }

  export class Tx {
    constructor();
    from(options: { txId: string; outputIndex: number; script?: string; satoshis: number }): Tx;
    to(address: string, satoshis: number): Tx;
    change(address: string): Tx;
    sign(privateKey: PrivKey): void;
    serialize(): string;
    toString(): string;
    toBuffer(): Buffer;
    hash: string;
    inputs: any[];
    outputs: any[];
  }

  export class TxBuilder {
    constructor();
    setFeePerKbNum(fee: number): TxBuilder;
    setChangeAddress(address: string): TxBuilder;
    setVersion(version: number): TxBuilder;
    inputFromScript(options: { txId: string; outputIndex: number; script: string; satoshis: number }): TxBuilder;
    setChangeScript(scriptHex: string): TxBuilder;
    inputFromPubKeyHash(options: { txId: string; outputIndex: number; satoshis: number; address: string }): TxBuilder;
    outputToAddress(address: string, satoshis: number): TxBuilder;
    outputToScript(scriptHex: string, satoshis: number): TxBuilder;
    signTxIn(inputIndex: number, privateKey: PrivKey): TxBuilder;
    build(): Tx;
  }

  export class Script {
    static buildPublicKeyHashOut(address: string): Script;
    toHex(): string;
  }
}

