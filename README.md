# ⚡ Collaborative Canvas - House of Edtech

A high-performance, **Local-First, Collaborative Document Editor** with offline synchronization, deterministic conflict-free resolution (Lamport Clocks + Fractional Indexing), and granular time-travel version control.

Built for the **House of Edtech Fullstack Developer Assignment**.

---

## 🚀 Key Features

- **Local-First Architecture**: Changes are saved instantly to the browser's IndexedDB ([Dexie.js](https://dexie.org/)). Working with documents, blocks, and dashboard operates completely offline with zero UI network blocks.
- **Background Sync Engine**: Queues local modifications while offline and flushes them to the server when connection is restored.
- **Conflict Resolution (CRDT)**: Resolves typing and arrangement conflicts deterministically:
  - **Lamport Logical Clocks**: Sorts chronological events.
  - **Lexicographical Client IDs**: Resolves concurrent clock ties deterministically without losing data.
  - **Fractional Indexing**: Orders blocks dynamically and lexicographically.
- **Time Travel & Snapshots**: Creates immutable snapshots of document states. Restoring a version performs a semantic revert on active canvases by generating clean, higher-clocked update mutations.
- **Granular Auth & RLS Scoping**: Built-in cookie-based JWT sessions with `OWNER`, `EDITOR`, and `VIEWER` support. Endpoint security prevents viewers from pushing state modifications.
- **Gemini AI Integration**: Built-in assistant side panel for summarizing and rewriting text blocks.
- **Out of Memory (OOM) Protection**: Max payload constraints (5MB body limit) on sync APIs.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack, TypeScript)
- **Database**: SQLite (via Prisma ORM v5)
- **Client Storage**: Dexie.js (IndexedDB wrapper)
- **Styling**: Tailwind CSS v4 & custom Glassmorphic variables
- **AI Engine**: Google Gemini API SDK (`@google/generative-ai`)

---

## 📦 Getting Started

### 1. Installation
Clone the repository, navigate to the folder, and install dependencies:
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="generate-a-secure-key"
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere" # Optional: to activate Gemini AI
```

### 3. Run Migrations
Run the initial Prisma migration to set up the SQLite database:
```bash
npx prisma migrate dev
```

### 4. Run Dev Server
Launch the development server:
```bash
npm run dev
```
Open `http://localhost:3000` to start editing.

---

## 🧪 Simulation Testing
Run the conflict resolution unit tests:
```bash
node test-sync.js
```

---

## ☁️ Deployment Instructions

### Deploy to Vercel
1. Push the code to a GitHub repository.
2. Link the repository to your [Vercel Dashboard](https://vercel.com).
3. Set your environment variables in the Vercel project settings:
   - `JWT_SECRET`: A secure random string.
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
4. **Database Setup**: Since SQLite is file-based and Vercel functions are stateless, migrate the database to a PostgreSQL instance (e.g. Supabase, Neon, or RDS) for production:
   - Swap the database provider in `prisma/schema.prisma`:
     ```prisma
     datasource db {
       provider = "postgresql"
       url      = env("DATABASE_URL")
     }
     ```
   - Change your `DATABASE_URL` environment variable on Vercel to point to your PostgreSQL database.
   - Run `npx prisma db push` or `npx prisma migrate deploy` to deploy the schema.
