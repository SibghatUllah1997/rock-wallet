import Account, { IAccount } from '../models/Account';
import { BSVService } from './BSVService';
import { ShardingService } from './ShardingService';

export interface CreateAccountRequest {
  walletId: string;
  currencyId: string;
  currencyCode: string;
  blockchainId: string;
  portfolioId: string;
  customNames?: {
    saving?: string;
    current?: string;
  };
}

export interface CreateAccountResponse {
  accounts: Array<{
    accountId: string;
    accountIndex: number;
    accountType: 'saving' | 'current';
    customName?: string;
    derivationPath: string;
    xpub: string;
    isNative: boolean;
  }>;
  nextAvailableIndices: {
    saving: number;
    current: number;
  };
}

export class AccountService {
  private bsvService: BSVService;

  constructor() {
    this.bsvService = new BSVService(process.env.BSV_NETWORK === 'testnet');
  }

  /**
   * Create accounts for a specific currency with privacy-focused indexing
   * - Native BSV: indices 0 (saving) and 1 (current)
   * - Non-native assets: indices 1000+ (auto-increment)
   */
  async createAccountsForCurrency(request: CreateAccountRequest): Promise<CreateAccountResponse> {
    const { walletId, currencyId, currencyCode, blockchainId, portfolioId, customNames } = request;

    // Check if this is a native currency (BSV)
    const isNative = currencyId.toLowerCase() === 'bsv' || currencyCode.toLowerCase() === 'bsv';

    // Get the next available indices for this currency
    const { savingIndex, currentIndex } = await this.getNextAvailableIndices(walletId, currencyId, isNative);

    // Get wallet's xpub to derive account keys
    const wallet = await this.getWalletXpub(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Validate wallet type - legacy APIs cannot use MPC wallets
    const Wallet = require('../models/Wallet').default;
    const walletDoc = await Wallet.findOne({ walletId, isActive: true });
    if (walletDoc && walletDoc.walletType === 'mpc') {
      throw new Error('MPC wallets cannot use legacy account creation. Use MPC APIs (/rwcore/api/v1/mpc/wallets/{wallet_id}/accounts/xpub) instead.');
    }

    // Create derivation paths
    const savingPath = `m/44'/1'/${savingIndex}'`;
    const currentPath = `m/44'/1'/${currentIndex}'`;

    // For now, we'll use the same xpub for both accounts
    // In a real implementation, you'd derive new xpubs from the wallet's xpub
    const savingXpub = wallet.xpub;
    const currentXpub = wallet.xpub;

    // Create account documents
    const accounts: IAccount[] = [];

    // Saving account
    const savingAccount = new Account({
      accountId: this.generateAccountId(),
      walletId,
      currencyId,
      currencyCode,
      blockchainId,
      portfolioId,
      derivationPath: savingPath,
      accountIndex: savingIndex,
      xpub: savingXpub,
      accountType: 'saving',
      customName: customNames?.saving || null,
      isNative,
      isActive: true
    });

    // Current account
    const currentAccount = new Account({
      accountId: this.generateAccountId(),
      walletId,
      currencyId,
      currencyCode,
      blockchainId,
      portfolioId,
      derivationPath: currentPath,
      accountIndex: currentIndex,
      xpub: currentXpub,
      accountType: 'current',
      customName: customNames?.current || null,
      isNative,
      isActive: true
    });

    // Save both accounts
    await savingAccount.save();
    await currentAccount.save();

    accounts.push(savingAccount, currentAccount);

    return {
      accounts: accounts.map(account => ({
        accountId: account.accountId,
        accountIndex: account.accountIndex,
        accountType: account.accountType,
        customName: account.customName,
        derivationPath: account.derivationPath,
        xpub: account.xpub,
        isNative: account.isNative
      })),
      nextAvailableIndices: {
        saving: savingIndex + (isNative ? 2 : 2), // Next available indices
        current: currentIndex + (isNative ? 2 : 2)
      }
    };
  }

  /**
   * Get next available indices for a currency
   * - Native: 0, 1, 2, 3, 4, 5... (even=saving, odd=current)
   * - Non-native: 1000, 1001, 1002, 1003, 1004, 1005... (even=saving, odd=current)
   */
  private async getNextAvailableIndices(walletId: string, currencyId: string, isNative: boolean): Promise<{ savingIndex: number; currentIndex: number }> {
    let baseIndex = isNative ? 0 : 1000;

    // Find the highest index for this wallet and currency type (native/non-native)
    const existingAccount = await Account.findOne({
      walletId,
      isNative,
      isActive: true
    }).sort({ accountIndex: -1 });

    if (existingAccount) {
      // Start from the next available pair
      baseIndex = existingAccount.accountIndex + 1;
    }

    // Ensure we're at the start of a pair (even index for saving)
    if (baseIndex % 2 !== 0) {
      baseIndex += 1;
    }

    return {
      savingIndex: baseIndex,
      currentIndex: baseIndex + 1
    };
  }

  /**
   * Get wallet's xpub for derivation
   */
  private async getWalletXpub(walletId: string): Promise<{ xpub: string } | null> {
    const Wallet = require('../models/Wallet').default;
    const wallet = await Wallet.findOne({ walletId, isActive: true });
    if (!wallet) {
      return null;
    }
    
    // Validate wallet type - legacy APIs cannot use MPC wallets
    if (wallet.walletType === 'mpc') {
      throw new Error('MPC wallets cannot use legacy account creation. Use MPC APIs (/rwcore/api/v1/mpc/wallets/{wallet_id}/accounts/xpub) instead.');
    }
    
    return { xpub: wallet.xpub };
  }

  /**
   * Generate unique account ID
   */
  private generateAccountId(): string {
    return `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all accounts for a wallet with optional filtering
   */
  async getAccountsForWallet(walletId: string, filters?: {
    currencyId?: string;
    accountType?: 'saving' | 'current';
    isNative?: boolean;
  }): Promise<IAccount[]> {
    const query: any = { walletId, isActive: true };

    if (filters?.currencyId) {
      query.currencyId = filters.currencyId;
    }

    if (filters?.accountType) {
      query.accountType = filters.accountType;
    }

    if (filters?.isNative !== undefined) {
      query.isNative = filters.isNative;
    }

    return await Account.find(query).sort({ accountIndex: 1 });
  }

  /**
   * Update account custom name
   */
  async updateAccountName(accountId: string, customName: string): Promise<IAccount | null> {
    const account = await Account.findOneAndUpdate(
      { accountId, isActive: true },
      { customName },
      { new: true }
    );
    return account;
  }

  /**
   * Get account by ID
   */
  async getAccountById(accountId: string): Promise<IAccount | null> {
    return await Account.findOne({ accountId, isActive: true });
  }

  /**
   * Get accounts grouped by currency
   */
  async getAccountsGroupedByCurrency(walletId: string): Promise<{
    [currencyId: string]: {
      currencyCode: string;
      blockchainId: string;
      accounts: {
        saving?: IAccount;
        current?: IAccount;
      };
    };
  }> {
    const accounts = await this.getAccountsForWallet(walletId);
    const grouped: any = {};

    accounts.forEach(account => {
      if (!grouped[account.currencyId]) {
        grouped[account.currencyId] = {
          currencyCode: account.currencyCode,
          blockchainId: account.blockchainId,
          accounts: {}
        };
      }

      grouped[account.currencyId].accounts[account.accountType] = account;
    });

    return grouped;
  }
}
