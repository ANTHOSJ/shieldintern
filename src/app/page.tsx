"use client";

import { Shield } from "lucide-react";
import { useOfferStore } from "@/store/offerStore";
import MockEmailGallery from "@/components/forms/MockEmailGallery";
import IncomingOfferBanner from "@/components/forms/IncomingOfferBanner";
import OfferInput from "@/components/forms/OfferInput";
import ResultsDashboard from "@/components/views/ResultsDashboard";

export default function Home() {
  const { result, error, inputText } = useOfferStore();

  return (
    <main className="flex-1">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                ShieldIntern
              </h1>
              <p className="text-sm text-muted">
                AI-Powered Fake Internship Offer Detector
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Real-time n8n Incoming Offer Permission Banner */}
        <IncomingOfferBanner />

        {/* Mock Email Gallery */}
        <MockEmailGallery />

        {/* Input Form */}
        <OfferInput />

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* Results Dashboard */}
        {result && <ResultsDashboard result={result} originalText={inputText} />}
      </div>
    </main>
  );
}
