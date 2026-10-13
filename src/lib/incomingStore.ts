import { IncomingOffer } from "./types";

// In-memory queue of pending candidate offers awaiting user permission
const pendingOffers: Map<string, IncomingOffer> = new Map();

// Set of Gmail Message IDs that have already been handled (either queued, analyzed, or dismissed)
// This guarantees that polling Gmail every 1 minute never results in duplicate notifications
const processedMessageIds: Set<string> = new Set();

export const incomingStore = {
  add(offer: Omit<IncomingOffer, "id" | "timestamp">): IncomingOffer | null {
    const messageId = offer.messageId;

    // 1. If this Gmail message was already processed/dismissed/analyzed, ignore it
    if (messageId && processedMessageIds.has(messageId)) {
      return null;
    }

    // 2. If this Gmail message is already sitting in the pending queue, do not duplicate it
    if (messageId) {
      for (const existing of pendingOffers.values()) {
        if (existing.messageId === messageId) {
          return null; // Already present in queue
        }
      }
    }

    const id = `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullOffer: IncomingOffer = {
      ...offer,
      id,
      timestamp: Date.now(),
    };
    pendingOffers.set(id, fullOffer);

    // Keep memory clean: max 20 pending offers
    if (pendingOffers.size > 20) {
      const oldestKey = pendingOffers.keys().next().value;
      if (oldestKey) pendingOffers.delete(oldestKey);
    }

    return fullOffer;
  },

  getAll(): IncomingOffer[] {
    return Array.from(pendingOffers.values()).sort((a, b) => b.timestamp - a.timestamp);
  },

  get(id: string): IncomingOffer | undefined {
    return pendingOffers.get(id);
  },

  remove(id: string): boolean {
    const existing = pendingOffers.get(id);
    if (existing?.messageId) {
      // Remember this messageId permanently so future polls ignore it
      processedMessageIds.add(existing.messageId);

      // Keep processed cache bounded (max 500 IDs)
      if (processedMessageIds.size > 500) {
        const oldest = processedMessageIds.values().next().value;
        if (oldest) processedMessageIds.delete(oldest);
      }
    }
    return pendingOffers.delete(id);
  },

  clear(): void {
    // Mark all currently pending offers as processed before clearing
    for (const offer of pendingOffers.values()) {
      if (offer.messageId) {
        processedMessageIds.add(offer.messageId);
      }
    }
    pendingOffers.clear();
  },

  reset(): void {
    pendingOffers.clear();
    processedMessageIds.clear();
  },
};
