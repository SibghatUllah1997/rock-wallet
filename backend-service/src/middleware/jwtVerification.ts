import axios, { AxiosInstance } from "axios";
import crypto, { KeyObject } from "crypto";
import { Request, Response, NextFunction } from "express";

/* ==========================
   Types
========================== */
interface ApiResponse<T> {
  status?: string;
  data: T;
}

interface GetKeysResponse {
  keys: {
    kid: string;
    pub_key: string; // DER Base64 string
  }[];
}

interface JwtClaims {
  userId: number;
  email?: string;
  clientId: string;
  scope?: string;
  sessionId?: string;
  issuedAt: Date;
  expiresAt: Date;
  issuer: string;
}

interface VerificationResult {
  valid: boolean;
  data?: JwtClaims;
  error?: string;
}

/* ==========================
   AuthMeClient
========================== */
class AuthMeClient {
  private http: AxiosInstance;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: `${baseUrl}/rwcore/api/v1/auth`,
      timeout: 5000
    });
  }

  async getKeys(): Promise<ApiResponse<GetKeysResponse>> {
    const response = await this.http.get<ApiResponse<GetKeysResponse>>("/keys");
    if (!response || !response.data || !response.data.data) {
      throw new Error("Empty response from AuthMe service");
    }
    return response.data;
  }
}

/* ==========================
   JwksClient
========================== */
class JwksClient {
  private keyCache: Map<string, KeyObject> = new Map();
  private authMeClient: AuthMeClient;

  constructor(authMeClient: AuthMeClient) {
    this.authMeClient = authMeClient;
  }

  async getPublicKey(kid: string): Promise<KeyObject | null> {
    if (!this.keyCache.has(kid)) {
      await this.refreshKeys();
    }
    return this.keyCache.get(kid) || null;
  }

  private async refreshKeys(): Promise<void> {
    const response = await this.authMeClient.getKeys();
    const keys = response.data.keys;
    if (!keys || keys.length === 0) return;

    this.keyCache.clear();

    for (const key of keys) {
      if (!key?.pub_key) continue;
      try {
        const publicKey = createPublicKeyFromAuthMe(key.pub_key);
        this.keyCache.set(key.kid, publicKey);
        console.log(`Cached key ${key.kid}`);
      } catch (err) {
        console.warn(`Failed to parse key ${key.kid}`, err);
      }
    }
  }
}

/* ==========================
   JWT Verification Service
========================== */
class JwtVerificationService {
  private jwksClient: JwksClient;
  private expectedIssuer: string;

  constructor(jwksClient: JwksClient, expectedIssuer: string) {
    this.jwksClient = jwksClient;
    this.expectedIssuer = expectedIssuer;
  }

  async verifyToken(token: string): Promise<VerificationResult> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return failure("Invalid JWT token format");

      const [headerB64, payloadB64, signatureB64] = parts;

      const header = decodeJson(headerB64);
      const payload = decodeJson(payloadB64);

      const kid = header.kid;
      if (!kid) return failure("Missing key ID in JWT header");

      const publicKey = await this.jwksClient.getPublicKey(kid);
      if (!publicKey) return failure(`Public key not found for key ID: ${kid}`);

      const signingInput = `${headerB64}.${payloadB64}`;

      const signature = Buffer.from(signatureB64, "base64url");

      /* ==========================
         Signature verification
         COMMENTED OUT for testing only
      ========================== */
      const signingHash = crypto.createHash("sha256").update(signingInput, "utf8").digest();
      const isValid = crypto.verify(
        "RSA-SHA256",
        signingHash,
        publicKey,
        signature
      );

      if (!isValid) return failure("Invalid JWT signature");

      const claimsValidation = this.validateClaims(payload);
      if (!claimsValidation.valid) return claimsValidation;

      return success(extractClaims(payload));
    } catch (err: any) {
      return failure(`Token verification failed: ${err.message}`);
    }
  }

  private validateClaims(payload: any): VerificationResult {
    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp) return failure("Missing expiry time in JWT");
    if (payload.exp < now) return failure("JWT token has expired");

    if (!payload.iss) return failure("Missing issuer in JWT");
    if (payload.iss !== this.expectedIssuer)
      return failure(`Invalid issuer: ${payload.iss}`);

    if (!payload.sub) return failure("Missing subject in JWT");
    if (!payload.aud) return failure("Missing audience in JWT");
    if (!payload.iat) return failure("Missing issued at time in JWT");

    return { valid: true };
  }
}

/* ==========================
   Helpers
========================== */
function decodeJson(base64Url: string): any {
  return JSON.parse(Buffer.from(base64Url, "base64url").toString("utf8"));
}

function extractClaims(payload: any): JwtClaims {
  return {
    userId: Number(payload.sub),
    email: payload.name,
    clientId: payload.aud,
    scope: payload.scope,
    sessionId: payload.sess,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: new Date(payload.exp * 1000),
    issuer: payload.iss
  };
}

function success(data: JwtClaims): VerificationResult {
  return { valid: true, data };
}

function failure(error: string): VerificationResult {
  return { valid: false, error };
}

// Helper to convert AuthMe pub_key to proper PEM
function createPublicKeyFromAuthMe(pubKeyBase64: string): KeyObject {
  const pem = `-----BEGIN PUBLIC KEY-----\n${pubKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
  return crypto.createPublicKey({
    key: pem,
    format: 'pem',
    type: 'spki',
  });
}

/* ==========================
   Middleware
========================== */
const authMeClient = new AuthMeClient(process.env.AUTHME_BASE_URL || "http://localhost:8101");
const jwksClient = new JwksClient(authMeClient);
const jwtService = new JwtVerificationService(jwksClient, process.env.JWT_EXPECTED_ISSUER || "");

export async function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // const authHeader = req.headers.authorization;
  // if (!authHeader || !authHeader.startsWith("Bearer ")) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  // const token = authHeader.substring("Bearer ".length);
  // const result = await jwtService.verifyToken(token);


  // const tokenSessionId = result.data?.sessionId;
  // const tokenClientId = result.data?.clientId;
  // const headerSessionId = req.headers['x-rw-session-id'] as string || req.body.session_id as string;
  // const headerClientId = req.headers['x-rw-client-id'] as string || req.body.client_id as string;

  // console.log('tokenSessionId:', tokenSessionId);
  // console.log('tokenClientId:', tokenClientId);
  // console.log('headerSessionId:', headerSessionId);
  // console.log('headerClientId:', headerClientId);
  // console.log('req.headers:', req.headers);

  // // Validate session ID
  // if (!headerSessionId) {
  //   return res.status(400).json({ message: "Missing session ID in request" });
  // }
  // // if (tokenSessionId != headerSessionId) {
  // //   return res.status(401).json({ message: "Session ID mismatch" });
  // // }

  // // Validate client ID
  // if (!headerClientId) {
  //   return res.status(400).json({ message: "Missing client ID in request" });
  // }
  // if (tokenClientId != headerClientId) {
  //   return res.status(401).json({ message: "Client ID mismatch" });
  // }

  // console.log(" result", result)

  // if (!result.valid) {
  //   return res.status(401).json({ message: result.error });
  // }

  // (req as any).user = result.data;
  next();
}
