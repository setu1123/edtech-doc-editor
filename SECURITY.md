# Security & Scaling Architecture - Collaborative Editor

This document outlines key production security considerations, mitigation strategies, and scaling structures designed for the collaborative document editor.

---

## 1. Preventing Out-of-Memory (OOM) Attacks

### The Threat
A malicious actor could send a massive or deeply nested synchronization payload (e.g., millions of character edits or malformed JSON blocks) designed to consume heap space, resulting in a Node.js process Out of Memory (OOM) crash and denying service to other active users.

### Mitigation Strategies
1. **Payload Body Size Limit (Enforced)**:
   - We enforce strict body size checking at the API gateway layer or inside our Next.js sync endpoint by checking `content-length` and rejecting requests exceeding 5MB:
     ```ts
     const contentLength = request.headers.get("content-length");
     if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
       return NextResponse.json({ error: "Payload too large" }, { status: 413 });
     }
     ```
2. **Schema & Logical Clock Validation**:
   - Every block operation is strictly validated. The server rejects elements if:
     - `positionKey` exceeds 100 characters (preventing indexing overflow attacks).
     - `lamportClock` jumps excessively (e.g., > 1,000 increments in a single client update), which could exhaust integer bounds or break order.
     - Content size per block is capped (e.g., max 100KB per block).
3. **JSON Parsing Defensively**:
   - Using streaming JSON parsers (like `oboe.js` or `JSONStream`) in production instead of memory-blocking `JSON.parse()` for parsing sync payload arrays, which ensures items are validated item-by-item rather than loading the entire payload into the V8 heap at once.

---

## 2. Tenant Isolation & Row Level Security (RLS)

### The Threat
Data leakage where a user alters synchronization parameters or requests document IDs belonging to another workspace owner.

### Mitigation Scoping
- **Strict ORM Scoping**:
  - Rather than relying on raw queries, every data mutation and lookup is scoped dynamically through the validated `userId` extracted from the HttpOnly session token.
  - In our Prisma models, tenant access is verified through the `DocumentMember` table:
    ```ts
    const membership = await prisma.documentMember.findUnique({
      where: {
        documentId_userId: { documentId: id, userId: user.id },
      },
    });
    if (!membership) throw new Error("Access Denied");
    ```
- **PostgreSQL Row Level Security (RLS)**:
  - If migrating this SQLite schema to a production PostgreSQL database (e.g., Supabase or AWS RDS), we can configure native PostgreSQL RLS:
    ```sql
    ALTER TABLE "Block" ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY document_member_policy ON "Block"
    FOR ALL
    USING (
      document_id IN (
        SELECT document_id FROM "DocumentMember" WHERE user_id = current_setting('app.current_user_id')
      )
    );
    ```

---

## 3. Scaling Document State Over Time

### The Threat
As a document is edited over months, the list of blocks and mutations grows, leading to larger payload sizes, slower IndexedDB queries, and database bloat.

### Scaling Solutions
1. **CRDT State Compaction / Garbage Collection**:
   - Periodically, the server can "compact" the document. Compaction takes the active blocks, captures an automated version checkpoint, and purges historical deleted records and mutation logs older than 30 days.
2. **Fractional Indexing Key Rebalancing**:
   - Continuous inserts in the same location can result in very long position keys (e.g., `a0.11111111...`).
   - The compaction engine periodically re-balances block positions, generating new evenly-distributed position keys (e.g., `'a'`, `'b'`, `'c'`) and updating them with a bumped logical clock so co-editors sync the clean structure.
