
# Deployment Guide – Rockwallet MPC Backend

This document provides a clean and structured guide for setting up and running the **mpc-rockwallet-backend** project.

---

## 1. Clone the Repository
```bash
git clone https://github.com/rockwalletcode/mpc-rockwallet-backend.git
```

---

## 2. Checkout the Required Branch
Navigate into the repository and switch to the correct branch:
```bash
cd mpc-rockwallet-backend
git checkout main
```

---

## 3. Project Structure
Inside the `mpc-rockwallet-backend` directory, you will find:
- `backend-service`
- `bsv-sdk`

---

## 4. Build the `bsv-sdk` Package
1. Navigate into the folder:
   ```bash
   cd bsv-sdk
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the SDK:
   ```bash
   npm run build
   ```
4. Return to the parent directory:
   ```bash
   cd ..
   ```

---

## 5. Start the Backend Service
1. Navigate into the backend service folder:
   ```bash
   cd backend-service
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the service:
   ```bash
   pm2 start dist/index.js --name rockwallet-mpc-backend
   ```

---

## 6. Service Startup
After completing the steps, the backend service should start successfully.

---
