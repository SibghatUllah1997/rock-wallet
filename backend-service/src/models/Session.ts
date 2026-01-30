import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  sessionId: string;
  userId: string;
  accessTokenId?: string; // JWT jti claim for access token tracking
  refreshToken: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema: Schema = new Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  accessTokenId: {
    type: String,
    index: true
  },
  refreshToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  deviceId: {
    type: String,
    index: true
  },
  ipAddress: String,
  userAgent: String,
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'sessions'
});

// Indexes for performance
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ refreshToken: 1, isActive: 1 });
SessionSchema.index({ expiresAt: 1 });
SessionSchema.index({ accessTokenId: 1, userId: 1, isActive: 1 }); // Compound index for session lookup

// Note: Removed pre-hook that auto-filtered expired sessions as it interferes with explicit queries
// We handle expiration checks explicitly in our queries

export default mongoose.model<ISession>('Session', SessionSchema);

