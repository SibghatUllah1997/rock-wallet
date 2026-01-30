import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BSV Wallet SDK API',
      version: '1.0.0',
      description: 'Complete BSV Wallet SDK with sharding, transaction signing, and broadcasting',
      contact: {
        name: 'BSV Wallet SDK Team',
        email: 'support@bsvwallet.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.bsvwallet.com',
        description: 'Production server'
      }
    ],
    security: [
      {
        basicAuth: []
      }
    ],
    components: {
      securitySchemes: {
        basicAuth: {
          type: 'http',
          scheme: 'basic',
          description: 'Basic authentication with username and password'
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token authentication'
        }
      },
      schemas: {
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'healthy',
              description: 'Service health status'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
              description: 'Current server timestamp'
            },
            uptime: {
              type: 'number',
              example: 3600.5,
              description: 'Server uptime in seconds'
            },
            version: {
              type: 'string',
              example: '1.0.0',
              description: 'API version'
            }
          }
        },
        NetworkStatus: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'BSV Testnet',
              description: 'Network name'
            },
            isTestnet: {
              type: 'boolean',
              example: true,
              description: 'Whether this is a testnet'
            },
            connected: {
              type: 'boolean',
              example: true,
              description: 'Connection status to the network'
            },
            rpcUrl: {
              type: 'string',
              example: 'https://api.whatsonchain.com/v1/bsv/test',
              description: 'RPC endpoint URL'
            },
            explorerUrl: {
              type: 'string',
              example: 'https://test.whatsonchain.com',
              description: 'Block explorer URL'
            },
            error: {
              type: 'string',
              example: null,
              description: 'Error message if connection failed',
              nullable: true
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            result: {
              type: 'string',
              example: 'error'
            },
            code: {
              type: 'string',
              example: 'VALIDATION_ERROR'
            },
            msg: {
              type: 'string',
              example: 'validation error'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    example: 'VALIDATION_ERROR'
                  },
                  err_msg: {
                    type: 'string',
                    example: 'Invalid input provided'
                  }
                }
              }
            }
          }
        },
        Error: {
          type: 'object',
          description: 'Error response (same structure as ErrorResponse)',
          properties: {
            result: {
              type: 'string',
              example: 'error'
            },
            code: {
              type: 'string',
              example: 'VALIDATION_ERROR'
            },
            msg: {
              type: 'string',
              example: 'validation error'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    example: 'VALIDATION_ERROR'
                  },
                  err_msg: {
                    type: 'string',
                    example: 'Invalid input provided'
                  }
                }
              }
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            result: {
              type: 'string',
              example: 'success'
            },
            code: {
              type: 'string',
              example: 'RW_SUCCESS'
            },
            msg: {
              type: 'string',
              example: 'operation completed successfully'
            },
            data: {
              type: 'object'
            }
          }
        },
        Success: {
          type: 'object',
          description: 'Success response (same structure as SuccessResponse)',
          properties: {
            result: {
              type: 'string',
              example: 'success'
            },
            code: {
              type: 'string',
              example: 'RW_SUCCESS'
            },
            msg: {
              type: 'string',
              example: 'operation completed successfully'
            },
            data: {
              type: 'object'
            }
          }
        },
        UserCreateRequest: {
          type: 'object',
          required: ['email', 'name'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            }
          }
        },
        UserCreateResponse: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              example: 'a6dbbba6-3f75-4b39-aab2-8113f675721c'
            },
            email: {
              type: 'string',
              example: 'user@example.com'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            },
            shard3: {
              type: 'string',
              description: 'Third shard for recovery'
            },
            addresses: {
              type: 'object',
              properties: {
                saving: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      derivationPath: {
                        type: 'string',
                        example: 'm/44\'/1\'/0\'/0/0'
                      },
                      address: {
                        type: 'string',
                        example: 'mw9sM8HBn4eWGQyUetx3DQ85p4erZbPNR8'
                      }
                    }
                  }
                },
                current: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      derivationPath: {
                        type: 'string',
                        example: 'm/44\'/1\'/1\'/0/0'
                      },
                      address: {
                        type: 'string',
                        example: 'mh6wRyvSgGWPpeGvRwfDvrCQbUBPFi1pUY'
                      }
                    }
                  }
                }
              }
            },
            network: {
              type: 'string',
              enum: ['testnet', 'mainnet'],
              example: 'testnet'
            }
          }
        },
        UserRecoveryRequest: {
          type: 'object',
          required: ['email', 'name'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            }
          }
        },
        UserRecoveryResponse: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              example: 'a6dbbba6-3f75-4b39-aab2-8113f675721c'
            },
            email: {
              type: 'string',
              example: 'user@example.com'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            },
            xpub: {
              type: 'string',
              description: 'Extended public key'
            },
            shard3: {
              type: 'string',
              description: 'Newly generated third shard'
            },
            addresses: {
              type: 'object',
              properties: {
                saving: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      derivationPath: {
                        type: 'string',
                        example: 'm/44\'/1\'/0\'/0/0'
                      },
                      address: {
                        type: 'string',
                        example: 'mw9sM8HBn4eWGQyUetx3DQ85p4erZbPNR8'
                      }
                    }
                  }
                },
                current: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      derivationPath: {
                        type: 'string',
                        example: 'm/44\'/1\'/1\'/0/0'
                      },
                      address: {
                        type: 'string',
                        example: 'mh6wRyvSgGWPpeGvRwfDvrCQbUBPFi1pUY'
                      }
                    }
                  }
                }
              }
            },
            network: {
              type: 'string',
              enum: ['testnet', 'mainnet'],
              example: 'testnet'
            },
            recoveredMnemonic: {
              type: 'string',
              description: 'Recovered mnemonic phrase (for verification only)'
            }
          }
        },
        TransactionRequest: {
          type: 'object',
          required: ['email', 'derivationPath', 'toAddress', 'amount', 'shardFromUser'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            derivationPath: {
              type: 'string',
              example: 'm/44\'/1\'/0\'/0/0',
              pattern: '^m/44\'/(1|236)\'/\\d+\'/\\d+/\\d+$'
            },
            toAddress: {
              type: 'string',
              example: 'mqbfhksgzwdj6ZzrAQssZqyn1KdTMae6QJ'
            },
            amount: {
              type: 'number',
              minimum: 1,
              example: 10000
            },
            feeRate: {
              type: 'number',
              minimum: 1,
              example: 5
            },
            network: {
              type: 'string',
              enum: ['testnet', 'mainnet'],
              default: 'testnet',
              example: 'testnet'
            },
            utxoAlgorithm: {
              type: 'string',
              enum: ['smallest-first', 'largest-first', 'random'],
              default: 'smallest-first',
              example: 'smallest-first'
            },
            shardFromUser: {
              type: 'string',
              description: 'One shard from user for 2-of-3 recovery',
              example: '80390a45935bf4bf7e38688fb13bFDAEAD20514A5F54A19CECD2FFFD41EB1258E7B70A99AE74462FD8AFECA48413DFC36E6F9E341509AEE8F84B1DF421ED6B4C6EA33E711F1DCAD5728674564022574FD'
            }
          }
        },
        TransactionResponse: {
          type: 'object',
          properties: {
            transactionId: {
              type: 'string',
              example: 'abc123def456...'
            },
            transactionHex: {
              type: 'string',
              example: '0100000001...'
            },
            fee: {
              type: 'number',
              example: 1250
            },
            explorerUrl: {
              type: 'string',
              example: 'https://testnet.whatsonchain.com/tx/abc123def456...'
            },
            fromAddress: {
              type: 'string',
              example: 'mw9sM8HBn4eWGQyUetx3DQ85p4erZbPNR8'
            },
            derivationPath: {
              type: 'string',
              example: 'm/44\'/1\'/0\'/0/0'
            },
            network: {
              type: 'string',
              example: 'testnet'
            }
          }
        },
        BalanceRequest: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: {
              type: 'string',
              example: 'a6dbbba6-3f75-4b39-aab2-8113f675721c',
              description: 'User ID to fetch balance for'
            },
            network: {
              type: 'string',
              enum: ['testnet', 'mainnet'],
              description: 'Network type (optional, defaults to user\'s network)'
            }
          }
        },
        BalanceResponse: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              example: 'a6dbbba6-3f75-4b39-aab2-8113f675721c'
            },
            email: {
              type: 'string',
              example: 'user@example.com'
            },
            totalBalance: {
              type: 'number',
              example: 50000,
              description: 'Total balance across all addresses in satoshis'
            },
            addresses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  address: {
                    type: 'string',
                    example: 'mw9sM8HBn4eWGQyUetx3DQ85p4erZbPNR8'
                  },
                  derivationPath: {
                    type: 'string',
                    example: 'm/44\'/1\'/0\'/0/0'
                  },
                  balance: {
                    type: 'number',
                    example: 25000,
                    description: 'Balance in satoshis'
                  },
                  utxos: {
                    type: 'number',
                    example: 5,
                    description: 'Number of UTXOs'
                  }
                }
              }
            },
            network: {
              type: 'string',
              example: 'testnet'
            }
          }
        },
        FeeEstimatesRequest: {
          type: 'object',
          properties: {
            network: {
              type: 'string',
              enum: ['testnet', 'mainnet'],
              description: 'Network type (optional, defaults to testnet)'
            }
          }
        },
        FeeEstimatesResponse: {
          type: 'object',
          properties: {
            slow: {
              type: 'number',
              example: 1,
              description: 'Slow fee rate in satoshis per byte'
            },
            medium: {
              type: 'number',
              example: 3,
              description: 'Medium fee rate in satoshis per byte'
            },
            fast: {
              type: 'number',
              example: 5,
              description: 'Fast fee rate in satoshis per byte'
            },
            timestamp: {
              type: 'number',
              example: 1761223114938,
              description: 'Timestamp when fees were calculated'
            },
            source: {
              type: 'string',
              example: 'dynamic-calculation',
              description: 'Source of the fee data'
            },
            network: {
              type: 'string',
              example: 'testnet',
              description: 'Network these fees are for'
            }
          }
        }
      },
      responses: {
        ErrorResponse: {
          description: 'Error response',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              }
            }
          }
        },
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              },
              example: {
                result: 'error',
                code: 'UNAUTHORIZED',
                msg: 'authentication required'
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              },
              example: {
                result: 'error',
                code: 'NOT_FOUND',
                msg: 'resource not found'
              }
            }
          }
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              },
              example: {
                result: 'error',
                code: 'INTERNAL_ERROR',
                msg: 'internal server error'
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check and system status endpoints'
      },
      {
        name: 'Network',
        description: 'Network status, blockchain information, and fee estimates'
      },
      {
        name: 'Authentication',
        description: 'User authentication, login, logout, and token management'
      },
      {
        name: 'User Management',
        description: 'User profile, password, sessions, statistics, and account deactivation'
      },
      {
        name: 'Wallets',
        description: 'Wallet creation, recovery, and management'
      },
      {
        name: 'Accounts',
        description: 'Account creation and management'
      },
      {
        name: 'Transactions',
        description: 'Transaction signing, broadcasting, syncing, and retrieval'
      },
      {
        name: 'Balance',
        description: 'Balance queries and portfolio information'
      },
      {
        name: 'Addresses',
        description: 'Address generation and management'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/index.ts'
  ]
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'BSV Wallet SDK API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    }
  }));

  // Serve swagger.json
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};
