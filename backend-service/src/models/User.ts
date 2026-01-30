import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  userId: string;
  username: string;
  email: string;
  password: string; // Hashed password
  // Wallet data embedded in user
  walletId: string;
  xpub: string;
  network: 'testnet' | 'mainnet';
  shard1: string; // First shard stored in DB
  shard2: string; // Second shard stored in DB
  // Accounts with addresses embedded
  accounts: Array<{
    accountId: string;
    accountType: 'saving' | 'current';
    accountIndex: number;
    xpub: string;
    derivationPath: string;
    address: {
      address: string;
      publicKey: string;
      derivationPath: string;
      addressIndex: number;
    };
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  metadata?: {
    deviceId?: string;
    clientId?: string;
    ipAddress?: string;
  };
  // Method to compare passwords
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: true,
    select: false // Don't return password by default in queries
  },
  walletId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  xpub: {
    type: String,
    required: true
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
  accounts: [{
    accountId: {
      type: String,
      required: true
    },
    accountType: {
      type: String,
      enum: ['saving', 'current'],
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
    derivationPath: {
      type: String,
      required: true
    },
    address: {
      address: {
        type: String,
        required: true
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
        required: true,
        default: 0
      }
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
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
  collection: 'users'
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordStr = String(this.password);
    this.password = await bcrypt.hash(passwordStr, salt);
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error('Password hashing failed'));
  }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Indexes for performance
UserSchema.index({ userId: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ walletId: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ isActive: 1 });

export default mongoose.model<IUser>('User', UserSchema);
