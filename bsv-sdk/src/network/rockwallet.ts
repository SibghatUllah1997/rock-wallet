import axios, { AxiosRequestConfig } from 'axios';

export interface RockWalletConfig {
  baseUrl: string; // e.g. https://api2-qa.rockwallet.net
  clientId: string; // X-RW-Client-ID
  getAccessToken: () => Promise<string> | string; // bearer provider
  getSessionId?: () => Promise<string> | string; // optional session provider
  getDeviceId?: () => Promise<string> | string; // optional device id
  getRequestId?: () => Promise<string> | string; // optional request id
}

export class RockWalletClient {
  private config: RockWalletConfig;

  constructor(config: RockWalletConfig) {
    this.config = config;
  }

  private async buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const token = await Promise.resolve(this.config.getAccessToken());
    const sessionId = this.config.getSessionId ? await Promise.resolve(this.config.getSessionId()) : undefined;
    const deviceId = this.config.getDeviceId ? await Promise.resolve(this.config.getDeviceId()) : undefined;
    const requestId = this.config.getRequestId ? await Promise.resolve(this.config.getRequestId()) : undefined;
    return {
      'Authorization': `Bearer ${token}`,
      'X-RW-Client-ID': this.config.clientId,
      ...(sessionId ? { 'X-RW-Session-ID': String(sessionId) } : {}),
      ...(deviceId ? { 'X-RW-Device-ID': String(deviceId) } : {}),
      ...(requestId ? { 'X-RW-Request-ID': String(requestId) } : {}),
      'Content-Type': 'application/json',
      ...extra
    };
  }

  private async post<T>(path: string, body: any, headers?: Record<string, string>): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const axiosConfig: AxiosRequestConfig = {
      url,
      method: 'POST',
      headers: await this.buildHeaders(headers),
      data: body,
      timeout: 20000
    };
    const res = await axios(axiosConfig);
    return res.data as T;
  }

  private async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const axiosConfig: AxiosRequestConfig = {
      url,
      method: 'GET',
      headers: await this.buildHeaders(headers),
      timeout: 20000
    };
    const res = await axios(axiosConfig);
    return res.data as T;
  }

  // --- CTWS endpoints ---
  createWallet(body: { wallet_id: string; xpub: string }): Promise<any> {
    return this.post('/rwcore/api/v1/ctws/wallets/create', body);
  }

  recoverWallet(body: { xpub: string }): Promise<any> {
    return this.post('/rwcore/api/v1/ctws/wallets/recovery', body);
  }

  createAccounts(walletId: string, body: { accounts: Array<any> }): Promise<any> {
    return this.post(`/rwcore/api/v1/ctws/wallets/${encodeURIComponent(walletId)}/accounts/create`, body);
  }

  createAddress(walletId: string, body: { account_id: string; currency_id: string; blockchain_id: string }): Promise<any> {
    return this.post(`/rwcore/api/v1/ctws/wallets/${encodeURIComponent(walletId)}/addresses/create`, body);
  }

  syncTransactions(walletId: string): Promise<any> {
    return this.get(`/rwcore/api/v1/ctws/wallets/${encodeURIComponent(walletId)}/transactions/sync`);
  }

  syncBalance(walletId: string, body: { account_ids: string[] }): Promise<any> {
    return this.post(`/rwcore/api/v1/ctws/wallets/${encodeURIComponent(walletId)}/balance/sync`, body);
  }

  getPortfolios(walletId: string): Promise<any> {
    return this.get(`/rwcore/api/v1/ctws/wallets/${encodeURIComponent(walletId)}/portfolios`);
  }

  getAccounts(walletId: string): Promise<any> {
    return this.get(`/rwcore/api/v1/ctws/wallets/${encodeURIComponent(walletId)}/accounts`);
  }
}


