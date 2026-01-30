import mongoose from 'mongoose';

// Setup test database
beforeAll(async () => {
  // Only connect if not already connected
  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/bsv-wallet-service-test';
    await mongoose.connect(mongoUri);
  }
});

// Cleanup after each test (skip for complete flow test)
afterEach(async () => {
  // Skip cleanup if test name contains "Complete Custodial Flow Test"
  if (expect.getState().currentTestName?.includes('Complete Custodial Flow Test')) {
    return;
  }
  
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Close database connection after all tests
afterAll(async () => {
  await mongoose.connection.close();
});
