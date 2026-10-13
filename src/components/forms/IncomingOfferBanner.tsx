"use client";

import { useEffect, useState, useCallback } from "react";
import { Mail, ShieldAlert, Check, X, RefreshCw, Zap, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { IncomingOffer } from "@/lib/types";
import { useOfferStore } from "@/store/offerStore";

export default function IncomingOfferBanner() {
  const [offers, setOffers] = useState<IncomingOffer[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isPolling, setIsPolling] = useState(false);
  const { setInputText, analyzeOffer } = useOfferStore();

  const fetchOffers = useCallback(async () => {
    try {
      const res = await fetch("/api/n8n/incoming");
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      }
    } catch (e) {
      console.warn("Failed to check incoming offers:", e);
    }
  }, []);

  // Poll for incoming offers every 4 seconds
  useEffect(() => {
    let ignore = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/n8n/incoming");
        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            setOffers(() => {
              const newOffers: IncomingOffer[] = data.offers || [];
              // Adjust selectedIndex if out of bounds
              setSelectedIndex((curr) => {
                if (curr >= newOffers.length) return Math.max(0, newOffers.length - 1);
                return curr;
              });
              return newOffers;
            });
          }
        }
      } catch (e) {
        console.warn("Failed to check incoming offers:", e);
      }
    };

    const interval = setInterval(poll, 4000);
    poll();

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  const handleApprove = async (offer: IncomingOffer) => {
    await fetch(`/api/n8n/incoming?id=${offer.id}`, { method: "DELETE" });
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    setSelectedIndex((curr) => Math.max(0, curr - 1));

    setInputText(offer.body);
    await analyzeOffer(offer.body);
  };

  const handleDismiss = async (offerId: string) => {
    await fetch(`/api/n8n/incoming?id=${offerId}`, { method: "DELETE" });
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
    setSelectedIndex((curr) => Math.max(0, curr - 1));
  };

  const handleDismissAll = async () => {
    await fetch("/api/n8n/incoming?id=all", { method: "DELETE" });
    setOffers([]);
    setSelectedIndex(0);
  };

  const handleSimulateDemo = async () => {
    setIsPolling(true);
    await fetch("/api/n8n/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: "HR Recruitment <careers@quickhire-interns.org>",
        subject: "Urgent: Shortlisted for Web Development Internship",
        snippet: "Dear Candidate, You have been shortlisted for a paid internship at QuickHire. Monthly stipend 35,000 INR. A refundable security deposit of 1,200 INR is required...",
        body: `Subject: Urgent: Shortlisted for Web Development Internship

Dear Candidate,

Congratulations! You have been shortlisted for our 3-month remote Web Development Internship at QuickHire Solutions.

Details:
- Role: Web Developer Intern
- Stipend: ₹35,000/month
- Location: Remote / Work From Home

To confirm your seat, you are required to pay a refundable security deposit of ₹1,200 via UPI within 12 hours.
UPI ID: quickhire.verify@okaxis

Best regards,
Talent Acquisition Team
QuickHire Solutions
careers@quickhire-interns.org`,
        receivedAt: new Date().toISOString(),
      }),
    });
    await fetchOffers();
    setIsPolling(false);
  };

  const currentOffer = offers[selectedIndex] || offers[0];

  return (
    <div className="space-y-3">
      {/* Active Pending Offers Dropdown & Card */}
      {offers.length > 0 && currentOffer && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50/90 p-5 shadow-lg shadow-amber-500/10 transition-all animate-in fade-in slide-in-from-top-3">
          {/* Header Controls: Count, Dropdown selector, Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900 shadow-sm">
                <ShieldAlert className="w-3.5 h-3.5" />
                {offers.length} Incoming {offers.length === 1 ? "Offer" : "Offers"} Detected
              </span>
              <span className="text-xs text-amber-800/80 font-medium hidden sm:inline">
                Awaiting your permission to analyze
              </span>
            </div>

            {/* Dropdown Menu for Multiple Emails */}
            <div className="flex items-center gap-2 flex-wrap">
              {offers.length > 1 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="offer-selector" className="text-xs font-semibold text-amber-950">
                      Select Email:
                    </label>
                    <select
                      id="offer-selector"
                      value={selectedIndex}
                      onChange={(e) => setSelectedIndex(Number(e.target.value))}
                      className="text-xs font-medium bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer max-w-[200px] sm:max-w-[260px] truncate"
                    >
                      {offers.map((offer, idx) => (
                        <option key={offer.id} value={idx}>
                          #{idx + 1}: {offer.subject} ({offer.sender})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Previous / Next buttons */}
                  <div className="flex items-center bg-white border border-amber-300 rounded-lg overflow-hidden shadow-sm">
                    <button
                      onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                      disabled={selectedIndex === 0}
                      title="Previous Offer"
                      className="px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-semibold text-amber-800 px-1.5">
                      {selectedIndex + 1}/{offers.length}
                    </span>
                    <button
                      onClick={() => setSelectedIndex((prev) => Math.min(offers.length - 1, prev + 1))}
                      disabled={selectedIndex === offers.length - 1}
                      title="Next Offer"
                      className="px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}

              {/* Dismiss All Button */}
              {offers.length > 1 && (
                <button
                  onClick={handleDismissAll}
                  title="Dismiss all incoming offers"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-amber-800 hover:text-red-700 bg-amber-100/60 hover:bg-red-50 rounded-lg border border-amber-200 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Dismiss All
                </button>
              )}
            </div>
          </div>

          {/* Active Selected Offer Details Card */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <Mail className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base font-bold text-foreground tracking-tight break-words">
                    {currentOffer.subject}
                  </h4>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 font-medium">
                    {new Date(currentOffer.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <p className="text-xs text-muted break-all">
                  From: <strong className="text-foreground">{currentOffer.sender}</strong>
                </p>

                <div className="text-xs text-amber-950/90 italic bg-amber-100/70 p-2.5 rounded-lg line-clamp-3 border border-amber-200/50">
                  &ldquo;{currentOffer.snippet}&rdquo;
                </div>
              </div>
            </div>

            {/* Actions for this specific offer */}
            <div className="flex items-center gap-2 sm:self-center shrink-0">
              <button
                onClick={() => handleApprove(currentOffer)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Analyze Offer
              </button>
              <button
                onClick={() => handleDismiss(currentOffer.id)}
                className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-medium transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* n8n Status Bar with Quick Demo Trigger */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-card rounded-xl border border-border text-xs text-muted shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            n8n Automation Webhook: <code className="text-foreground font-mono bg-muted/20 px-1 py-0.5 rounded">/api/n8n/incoming</code>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchOffers}
            title="Refresh pending queue"
            className="hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check Queue
          </button>
          <button
            onClick={handleSimulateDemo}
            disabled={isPolling}
            className="flex items-center gap-1 text-amber-600 hover:text-amber-700 font-medium cursor-pointer transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Simulate Incoming Email (Demo)
          </button>
        </div>
      </div>
    </div>
  );
}
