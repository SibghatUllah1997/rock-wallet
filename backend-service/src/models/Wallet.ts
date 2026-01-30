import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
  walletId: string;
  walletType?: 'legacy' | 'mpc'; // Wallet type: legacy (account-level xpub) or mpc (root-level xpub)
  xpub: string;
  xpubHash?: string;
  network: 'testnet' | 'mainnet';
  shard1: string; // Encrypted shard stored in DB
  shard2: string; // Encrypted shard stored in DB
  shard3?: string; // Optional third shard for recovery scenarios
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  metadata?: {
    deviceId?: string;
    clientId?: string;
    ipAddress?: string;
  };
}

const WalletSchema: Schema = new Schema({
  walletId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  walletType: {
    type: String,
    enum: ['legacy', 'mpc'],
    default: 'legacy',
    index: true
  },
  xpubHash: {
    type: String,
    required: false,
    index: true
  },
  xpub: {
    type: String,
    required: true,
    index: true
  },
  network: {
    type: String,
    enum: ['testnet', 'mainnet'],
    required: true,
    default: 'testnet'
  },
  shard1: {
    type: String,
    required: true
  },
  shard2: {
    type: String,
    required: true
  },
  shard3: {
    type: String,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    deviceId: String,
    clientId: String,
    ipAddress: String
  }
}, {
  timestamps: true,
  collection: 'wallets'
});

// Indexes for performance
WalletSchema.index({ walletId: 1 });
WalletSchema.index({ xpub: 1 });
WalletSchema.index({ createdAt: -1 });
WalletSchema.index({ isActive: 1 });

export default mongoose.model<IWallet>('Wallet', WalletSchema);
