import mongoose, { Document, Schema } from 'mongoose';

export interface IAddress extends Document {
  addressId: string;
  walletId: string;
  accountId: string;
  address: string;
  publicKey: string; // Public key for the address
  derivationPath: string;
  addressIndex: number;
  currencyCode: string;
  isActive: boolean;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    label?: string;
    description?: string;
  };
}

const AddressSchema: Schema = new Schema({
  addressId: {
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
  accountId: {
    type: String,
    required: true,
    index: true
  },
  address: {
    type: String,
    required: true,
    index: true
  },
  publicKey: {
    type: String,
    required: true
  },
  derivationPath: {
    type: String,
    required: true
  },
  addressIndex: {
    type: Number,
    required: true
  },
  currencyCode: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  metadata: {
    label: String,
    description: String
  }
}, {
  timestamps: true,
  collection: 'addresses'
});

// Indexes for performance
AddressSchema.index({ addressId: 1 });
AddressSchema.index({ walletId: 1 });
AddressSchema.index({ accountId: 1 });
AddressSchema.index({ address: 1 });
AddressSchema.index({ isActive: 1 });

export default mongoose.model<IAddress>('Address', AddressSchema);
