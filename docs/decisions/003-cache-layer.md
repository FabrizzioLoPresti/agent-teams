# ADR-003: Cache Layer — Redis

**Status:** Accepted
**Date:** 2025
**Area:** Cache and infrastructure

---

## Context

Authentication via Better-Auth requires validating the user session on every protected request. If each request queried PostgreSQL to verify the session, the cost would be O(1) database query per authenticated ORPC call — including those that occur during SSR.

Additionally, rate limiting needs a shared, low-latency store to count authentication attempts within short time windows (10 seconds).

Alternatives evaluated: **Memcached**, **PostgreSQL with a cache table**, **no cache (PostgreSQL only)**.

---

## Decision

Use **Redis** as secondary storage for Better-Auth (session caching and rate limiting).

---

## Why It's the Right Choice

### 1. Sub-millisecond latency

Redis operates in memory. A session lookup in Redis takes ~0.1–0.5ms versus ~2–10ms in PostgreSQL (even with an index). In an SSR application, each page can trigger multiple authenticated ORPC calls before rendering, multiplying the impact.

### 2. Native TTL

Redis supports per-key TTL (Time To Live) natively. The cached session expires automatically after 5 minutes (`cookieCache.maxAge`) with no cleanup jobs needed. PostgreSQL would require an additional table with a periodic purge job.

### 3. Atomic operations for rate limiting

Rate limiting requires `INCREMENT` + `EXPIRE` atomically to avoid race conditions between concurrent requests. Redis has `INCR`, `EXPIRE`, and `EVAL` (Lua scripts) that guarantee atomicity without database transactions.

### 4. Direct integration with Better-Auth

Better-Auth has native support for `secondaryStorage` (a `get/set/delete` interface). Redis maps directly to this interface:

```typescript
secondaryStorage: {
  get: async (key) => redisClient.get(key),
  set: async (key, value, ttl) => redisClient.set(key, value, { EX: ttl }),
  delete: async (key) => redisClient.del(key),
}
```

No extra adapters or complex integration code needed.

### 5. Standard Cache-Aside pattern

The flow is simple and predictable:
1. Request arrives with a session cookie
2. Better-Auth checks Redis (cache hit → ~0.3ms)
3. If not in cache, fetches from PostgreSQL and caches in Redis for 5 min
4. 99% of requests in an active session are cache hits

---

## Why Not the Alternatives

**Memcached:** Faster in pure benchmarks, but does not support per-key TTL natively or atomic increment operations. Redis has sufficient features for the use cases and a better Node.js ecosystem.

**PostgreSQL only:** Viable, but adds unnecessary latency. In SSR with multiple queries per render, the overhead accumulates. Additionally, rate limiting would be more complex to implement correctly without race conditions.

---

## Accepted Trade-offs

| Aspect | Impact |
|--------|--------|
| Additional distributed state | Redis is another infrastructure piece that can fail |
| Possible desynchronization | If a session is invalidated in PostgreSQL, Redis may hold stale data for up to 5 minutes |
| Limited memory | Redis is in-memory; production sizing must be planned carefully |

Desynchronization is the most relevant trade-off. It is accepted because: (a) sessions are rarely invalidated during normal operation, (b) the 5-minute TTL limits the impact, (c) Better-Auth explicitly invalidates the cache on logout.

---

## Consequences

- Redis runs alongside PostgreSQL in `docker-compose.yml` in local development
- The `REDIS_URL` variable is required in `src/env/server.ts`
- In production, use a managed Redis (e.g., Upstash, Railway Redis) to avoid manual persistence and backup management
- Better-Auth rate limiting uses the same Redis instance (`storage: 'secondary-storage'`)
