import { IncomingOffer } from "./types";
import { Redis } from "@upstash/redis";

// Check for Upstash Redis or Vercel KV environment variables
function getRedisClient(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.STORAGE_REST_API_URL ||
    process.env.STORAGE_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN ||
    process.env.STORAGE_TOKEN;

  if (url && token) {
    try {
      return new Redis({ url, token });
    } catch (e) {
      console.warn("Failed to initialize Upstash Redis:", e);
    }
  }

  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

// In-memory fallback queue for local development
const memoryPendingOffers: Map<string, IncomingOffer> = new Map();
const memoryProcessedIds: Set<string> = new Set();

const REDIS_PENDING_KEY = "shieldintern:pending_offers";
const REDIS_PROCESSED_KEY = "shieldintern:processed_ids";

export const incomingStore = {
  async add(offer: Omit<IncomingOffer, "id" | "timestamp">): Promise<IncomingOffer | null> {
    const messageId = offer.messageId;
    const redis = getRedisClient();

    if (redis) {
      try {
        // 1. Check if already processed
        if (messageId) {
          const isProcessed = await redis.sismember(REDIS_PROCESSED_KEY, messageId);
          if (isProcessed) return null;
        }

        // 2. Check if already in pending queue
        if (messageId) {
          const allPending = (await redis.hvals<IncomingOffer>(REDIS_PENDING_KEY)) || [];
          if (allPending.some((o) => o.messageId === messageId)) {
            return null;
          }
        }

        const id = `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const fullOffer: IncomingOffer = {
          ...offer,
          id,
          timestamp: Date.now(),
        };

        await redis.hset(REDIS_PENDING_KEY, { [id]: fullOffer });
        return fullOffer;
      } catch (err) {
        console.warn("Upstash Redis add error, falling back to in-memory:", err);
      }
    }

    // In-memory fallback
    if (messageId && memoryProcessedIds.has(messageId)) {
      return null;
    }
    if (messageId) {
      for (const existing of memoryPendingOffers.values()) {
        if (existing.messageId === messageId) return null;
      }
    }

    const id = `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullOffer: IncomingOffer = {
      ...offer,
      id,
      timestamp: Date.now(),
    };
    memoryPendingOffers.set(id, fullOffer);

    if (memoryPendingOffers.size > 25) {
      const oldestKey = memoryPendingOffers.keys().next().value;
      if (oldestKey) memoryPendingOffers.delete(oldestKey);
    }

    return fullOffer;
  },

  async getAll(): Promise<IncomingOffer[]> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const offers = (await redis.hvals<IncomingOffer>(REDIS_PENDING_KEY)) || [];
        return offers.sort((a, b) => b.timestamp - a.timestamp);
      } catch (err) {
        console.warn("Upstash Redis getAll error, falling back to in-memory:", err);
      }
    }

    return Array.from(memoryPendingOffers.values()).sort((a, b) => b.timestamp - a.timestamp);
  },

  async get(id: string): Promise<IncomingOffer | undefined> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const offer = await redis.hget<IncomingOffer>(REDIS_PENDING_KEY, id);
        return offer || undefined;
      } catch (err) {
        console.warn("Upstash Redis get error, falling back to in-memory:", err);
      }
    }

    return memoryPendingOffers.get(id);
  },

  async remove(id: string): Promise<boolean> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const existing = await redis.hget<IncomingOffer>(REDIS_PENDING_KEY, id);
        if (existing?.messageId) {
          await redis.sadd(REDIS_PROCESSED_KEY, existing.messageId);
        }
        const deletedCount = await redis.hdel(REDIS_PENDING_KEY, id);
        return deletedCount > 0;
      } catch (err) {
        console.warn("Upstash Redis remove error, falling back to in-memory:", err);
      }
    }

    const existing = memoryPendingOffers.get(id);
    if (existing?.messageId) {
      memoryProcessedIds.add(existing.messageId);
      if (memoryProcessedIds.size > 500) {
        const oldest = memoryProcessedIds.values().next().value;
        if (oldest) memoryProcessedIds.delete(oldest);
      }
    }
    return memoryPendingOffers.delete(id);
  },

  async clear(): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const allOffers = (await redis.hvals<IncomingOffer>(REDIS_PENDING_KEY)) || [];
        const messageIds = allOffers.map((o) => o.messageId).filter(Boolean) as string[];
        if (messageIds.length > 0) {
          await redis.sadd(REDIS_PROCESSED_KEY, ...messageIds);
        }
        await redis.del(REDIS_PENDING_KEY);
        return;
      } catch (err) {
        console.warn("Upstash Redis clear error, falling back to in-memory:", err);
      }
    }

    for (const offer of memoryPendingOffers.values()) {
      if (offer.messageId) memoryProcessedIds.add(offer.messageId);
    }
    memoryPendingOffers.clear();
  },

  async reset(): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(REDIS_PENDING_KEY, REDIS_PROCESSED_KEY);
        return;
      } catch (err) {
        console.warn("Upstash Redis reset error, falling back to in-memory:", err);
      }
    }

    memoryPendingOffers.clear();
    memoryProcessedIds.clear();
  },
};
