# COSKO — Complete System Setup & Deployment Guide

> **Author**: Mohammad Hasan ([@hasanudyavar](https://github.com/hasanudyavar))  
> **Repository**: [https://github.com/hasanudyavar/Cosko](https://github.com/hasanudyavar/Cosko)  
> **Copyright**: © 2026 Mohammad Hasan. All Rights Reserved. Proprietary & Confidential.

---

## Table of Contents

1. [System Overview & Prerequisites](#1-system-overview--prerequisites)
2. [Quickstart Setup (Local Development)](#2-quickstart-setup-local-development)
3. [Environment Configuration Reference (.env)](#3-environment-configuration-reference-env)
4. [Database Setup & Prisma Migrations](#4-database-setup--prisma-migrations)
5. [Super Admin Account Bootstrap](#5-super-admin-account-bootstrap)
6. [Object Storage Setup (Cloudflare R2 / AWS S3)](#6-object-storage-setup-cloudflare-r2--aws-s3)
7. [Realtime Synchronization Setup (Pusher Channels)](#7-realtime-synchronization-setup-pusher-channels)
8. [Running the Application](#8-running-the-application)
9. [Verification & Integration Testing](#9-verification--integration-testing)
10. [Production Deployment Guides](#10-production-deployment-guides)
    - [Option A: Ubuntu VPS with Nginx & PM2 (Recommended for Full Control)](#option-a-ubuntu-vps-with-nginx--pm2-recommended)
    - [Option B: Netlify Serverless Deployment](#option-b-netlify-serverless-deployment)
11. [Troubleshooting & Common Issues](#11-troubleshooting--common-issues)
12. [Support & Commercial Licensing](#12-support--commercial-licensing)

---

## 1. System Overview & Prerequisites

COSKO is a full-stack, enterprise-grade multi-store retail, inventory distribution, point-of-sale (POS), and double-entry accounting platform.

### Required Software & Versions
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **npm**: `v10.x` or higher
- **MySQL**: `8.0` or higher (InnoDB engine with foreign key support enabled)
- **Git**: Installed and configured on your system

### External Services (Optional for Local, Mandatory for Production)
- **Cloudflare R2** (or AWS S3 / MinIO): Private bucket for encrypted payment proofs and supplier receipts.
- **Pusher Channels**: WebSocket cluster for instant cross-device realtime synchronization.

---

## 2. Quickstart Setup (Local Development)

### Step 1: Clone Repository
```bash
git clone https://github.com/hasanudyavar/Cosko.git
cd Cosko
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
# On Linux/macOS:
cp .env.example .env

# On Windows (PowerShell):
Copy-Item .env.example .env
```

Open `.env` in your editor and update the database connection string and secret key:
```env
DATABASE_URL="mysql://root:password@localhost:3306/cosko_db?sslaccept=strict"
AUTH_SECRET="replace-with-a-random-32-character-secret-key-123456"
NEXT_PUBLIC_APP_URL="http://localhost:4028"
```

---

## 3. Environment Configuration Reference (.env)

| Variable Name | Required | Default / Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `mysql://user:pass@host:3306/db?sslaccept=strict` | Authoritative MySQL connection URL for Prisma ORM |
| `AUTH_SECRET` | **Yes** | 32+ character random string | Salt/secret used for cryptographic session signing and JWT verification |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `http://localhost:4028` (Dev) / `https://yourdomain.com` (Prod) | Public base URL used for redirect callbacks, QR codes, and assets |
| `STORAGE_ENDPOINT` | Optional* | `https://<account-id>.r2.cloudflarestorage.com` | S3-compatible API endpoint URL (*Mandatory for production document uploads) |
| `STORAGE_BUCKET` | Optional* | `cosko-assets` | Target bucket name for payment receipts and media |
| `STORAGE_ACCESS_KEY` | Optional* | R2 Access Key ID | Storage API access key |
| `STORAGE_SECRET_KEY` | Optional* | R2 Secret Access Key | Storage API secret key |
| `STORAGE_REGION` | Optional | `auto` | Storage region identifier |
| `PUSHER_APP_ID` | Optional** | `1234567` | Pusher Application ID (**Mandatory for distributed WebSocket sync) |
| `PUSHER_KEY` | Optional** | `abcdef123456` | Pusher Application Key |
| `PUSHER_SECRET` | Optional** | `987654fedcba` | Pusher Secret Key |
| `PUSHER_CLUSTER` | Optional** | `ap2` | Pusher Cluster code (e.g. `ap2`, `us2`, `eu`) |
| `NEXT_PUBLIC_PUSHER_KEY` | Optional** | `abcdef123456` | Client-side Pusher Key |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Optional** | `ap2` | Client-side Pusher Cluster |

> **Note**: Cloudflare R2 specific variable aliases (`R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are also supported natively.

---

## 4. Database Setup & Prisma Migrations

### Step 1: Create Database in MySQL
Log into MySQL and create the database schema:
```sql
CREATE DATABASE cosko_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 2: Push Prisma Schema to MySQL
Generate the Prisma Client and sync the schema tables:
```bash
npx prisma generate
npx prisma db push
```

### Step 3: Seed Demonstration & Initial Data
Populate stores, demo categories, products, customer accounts, and vendor directories:
```bash
npm run seed
```
*(Runs `scripts/seed-mysql.ts`)*

---

## 5. Super Admin Account Bootstrap

If you need to create an initial or new Super Administrator account, run the CLI bootstrap tool:

```bash
npx tsx scripts/bootstrap-superadmin.ts <email> <password>
```

**Example:**
```bash
npx tsx scripts/bootstrap-superadmin.ts admin@cosko.com SuperAdminSecurePass2026!
```

This command securely hashes the password with `bcryptjs` (salt cost factor 12) and assigns system-level clearance (Role: `SUPER_ADMIN`, Scope: `ALL_STORES`).

---

## 6. Object Storage Setup (Cloudflare R2 / AWS S3)

COSKO uses private object storage to safeguard financial payment proofs, supplier invoices, and audit attachments.

### Cloudflare R2 Setup Steps:
1. Log into your **Cloudflare Dashboard** and navigate to **R2**.
2. Click **Create Bucket** and name it `cosko-assets`.
3. Set bucket access to **Private** (do not enable public URL access).
4. Go to **Manage R2 API Tokens** and click **Create API Token**.
5. Select permissions: **Object Read & Write**.
6. Copy the **Access Key ID**, **Secret Access Key**, and **Endpoint URL** (`https://<account_id>.r2.cloudflarestorage.com`).
7. Paste these values into your `.env` file under `STORAGE_*` or `R2_*`.

---

## 7. Realtime Synchronization Setup (Pusher Channels)

COSKO synchronizes inventory changes, POS checkouts, work activity, and attendance live across multiple screens and stores using Pusher Channels.

### Pusher Setup Steps:
1. Sign up or log into [pusher.com](https://pusher.com).
2. Create a new **Channels App** (Name: `Cosko Retail`, Cluster: choose nearest, e.g. `ap2 - Mumbai`).
3. Select **React** for Frontend and **Node.js** for Backend.
4. Copy your `app_id`, `key`, `secret`, and `cluster` into `.env`.
5. Authenticated private channels (`private-store-<storeCode>`, `private-attendance`, `private-work-activity`) are authorized securely via `POST /api/realtime/auth`.

---

## 8. Running the Application

### Development Server
```bash
npm run dev
```
The application will start on **`http://localhost:4028`**.

Open your browser and navigate to:
- **`http://localhost:4028/login`**

---

## 9. Verification & Integration Testing

COSKO includes automated verification suites covering security isolation, store scoping, POS transactions, inventory limits, and proof ownership:

```bash
# Run all tests sequentially
npm run test:all

# Run TypeScript typecheck across app, scripts, and tests
npm run type-check:all

# Run security and role-clearance suite
npm run test:security

# Run responsive modal audit
npm run test:responsive
```

---

## 10. Production Deployment Guides

### Option A: Ubuntu VPS with Nginx & PM2 (Recommended)

#### 1. Server Prerequisites:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx mysql-server ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

#### 2. Clone Repository to `/var/www/cosko`:
```bash
sudo git clone https://github.com/hasanudyavar/Cosko.git /var/www/cosko
sudo chown -R $USER:$USER /var/www/cosko
cd /var/www/cosko
npm install --production=false
```

#### 3. Configure Production `.env`:
```bash
cp .env.example .env
nano .env
```
Set `NODE_ENV=production`, your MySQL credentials, `AUTH_SECRET`, and production URL.

#### 4. Build and Start:
```bash
npx prisma generate
npx prisma db push
npm run build
pm2 start npm --name "cosko-app" -- run start
pm2 save
pm2 startup
```

#### 5. Configure Nginx Reverse Proxy:
Create `/etc/nginx/sites-available/cosko`:
```nginx
server {
    server_name cosko.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4028;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/cosko /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. Issue Free SSL with Let's Encrypt:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cosko.yourdomain.com
```

---

### Option B: Netlify Serverless Deployment

1. **Host MySQL Externally**:  
   Deploy a cloud-hosted MySQL database (Aiven, PlanetScale, Railway, or AWS RDS).
2. **Push to GitHub**:  
   Ensure your code is pushed to your GitHub repository `https://github.com/hasanudyavar/Cosko`.
3. **Import into Netlify**:  
   Connect Netlify to your GitHub repository.
4. **Build Settings**:  
   - Build Command: `prisma generate && next build`
   - Publish Directory: `.next`
   - Plugin: `@netlify/plugin-nextjs` is already pre-configured in `package.json` and `netlify.toml`.
5. **Environment Variables**:  
   Add all keys from your `.env` into the **Netlify Site Settings > Environment Variables** tab:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `NEXT_PUBLIC_APP_URL`
   - `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`
   - `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`
   - `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`

---

## 11. Troubleshooting & Common Issues

| Issue | Root Cause | Solution |
|---|---|---|
| `PrismaClientInitializationError: Can't reach database server` | MySQL service stopped or invalid credentials | Verify MySQL is active (`sudo systemctl status mysql`) and `DATABASE_URL` matches username, password, host, port, and database name. |
| `HTTP 403 Forbidden on Store Operations` | Accessing data belonging to another store | Non-Super Admin users can only query and mutate records assigned to their own store. Log in as Super Admin for cross-store management. |
| `Payment Proof Upload Fails` | Storage credentials missing or incorrect | Check `STORAGE_*` variables in `.env`. Ensure your Cloudflare R2 bucket exists and your API token has write permissions. |
| `Realtime Updates Not Received` | Pusher keys unconfigured | Check `PUSHER_*` variables. The application will operate in polling mode if Pusher is unconfigured, but WebSocket realtime requires valid credentials. |
| `Port 4028 Already in Use` | Another Next.js process is running | Terminate old process (`kill $(lsof -t -i:4028)` or Windows: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 4028).OwningProcess`). |

---

## 12. Support & Commercial Licensing

This software is licensed under a **Proprietary & Confidential License Agreement**.  
For commercial licenses, enterprise customizations, or technical assistance:

- **Author**: Mohammad Hasan
- **Email**: [mohammadhasan16114@gmail.com](mailto:mohammadhasan16114@gmail.com)
- **GitHub**: [@hasanudyavar](https://github.com/hasanudyavar)
- **Repository**: [https://github.com/hasanudyavar/Cosko](https://github.com/hasanudyavar/Cosko)
