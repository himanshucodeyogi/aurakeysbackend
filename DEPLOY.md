# AuraKeys Backend — Vercel Deploy Guide

## Step 1: MongoDB Atlas setup (free)

1. Go to https://cloud.mongodb.com → Create free account
2. Create a new **free cluster (M0)**
3. Under **Database Access** → Add user (username + password)
4. Under **Network Access** → Add IP: `0.0.0.0/0` (allow all — needed for Vercel)
5. Click **Connect** → **Drivers** → copy the connection string
   - It looks like: `mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true`
   - Replace `<password>` with your actual password

## Step 2: Deploy to Vercel

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Go to backend folder
cd backend

# Deploy
vercel deploy --prod
```

When prompted:
- Set up and deploy: **Y**
- Which scope: select your account
- Link to existing project: **N**
- Project name: `aurakeys-backend`
- In which directory: **./  (current)**
- Override settings: **N**

## Step 3: Set Environment Variables on Vercel

After deploy, go to **Vercel Dashboard → aurakeys-backend → Settings → Environment Variables**

Add these two:

| Name               | Value                          |
|--------------------|--------------------------------|
| `MONGODB_URI`      | your MongoDB Atlas connection string |
| `ADMIN_PASSWORD`   | a strong password for admin dashboard |

Then redeploy: `vercel deploy --prod`

## Step 4: Update the Flutter app

In your `.env` file (project root), add:
```
GROQ_API_KEY=your_existing_key
ANALYTICS_BACKEND_URL=https://aurakeys-backend.vercel.app
```

Replace `aurakeys-backend.vercel.app` with your actual Vercel URL.

## Step 5: Update website

In `website/app.js`, set:
```js
const BACKEND_URL = 'https://aurakeys-backend.vercel.app';
```

## API Endpoints

| Method | Endpoint               | Use               |
|--------|------------------------|-------------------|
| POST   | /api/track             | App → send events |
| GET    | /api/public-stats      | Website stats     |
| GET    | /api/admin/stats       | Admin overview    |
| GET    | /api/admin/users       | Admin user list   |
| GET    | /api/admin/user?id=... | Admin user detail |

Admin endpoints require: `Authorization: Bearer <ADMIN_PASSWORD>`

## Admin Dashboard

Open `website/admin.html` in browser.
- Enter your Vercel backend URL
- Enter your ADMIN_PASSWORD
