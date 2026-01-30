import mongoose, { Document, Schema } from 'mongoose';

export interface IAccount extends Document {
  accountId: string;
  walletId: string;
  currencyId: string;
  currencyCode: string;
  blockchainId: string;
  portfolioId: string;
  derivationPath: string;
  accountIndex: number;
  xpub: string;
  accountType: 'saving' | 'current';
  customName?: string;
  isNative: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    accountName?: string;
    description?: string;
  };
}

const AccountSchema: Schema = new Schema({
  accountId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  walletId: {
    type: String,
    required: true,
    index: true
  },
  currencyId: {
    type: String,
    required: true
  },
  currencyCode: {
    type: String,
    required: true
  },
  blockchainId: {
    type: String,
    required: true
  },
  portfolioId: {
    type: String,
    required: true
  },
  derivationPath: {
    type: String,
    required: true
  },
  accountIndex: {
    type: Number,
    required: true
  },
  xpub: {
    type: String,
    required: true
  },
  accountType: {
    type: String,
    enum: ['saving', 'current'],
    required: true
  },
  customName: {
    type: String,
    default: null
  },
  isNative: {
    type: Boolean,
    required: true,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    accountName: String,
    description: String
  }
}, {
  timestamps: true,
  collection: 'accounts'
});

// Indexes for performance
AccountSchema.index({ accountId: 1 });
AccountSchema.index({ walletId: 1 });
AccountSchema.index({ currencyCode: 1 });
AccountSchema.index({ portfolioId: 1 });
AccountSchema.index({ isActive: 1 });
AccountSchema.index({ walletId: 1, currencyId: 1 });
AccountSchema.index({ walletId: 1, accountIndex: 1 });
AccountSchema.index({ walletId: 1, currencyId: 1, accountType: 1 });
AccountSchema.index({ walletId: 1, isNative: 1 });

export default mongoose.model<IAccount>('Account', AccountSchema);
