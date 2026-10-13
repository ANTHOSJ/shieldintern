export interface HighlightedPhrase {
  text: string;
  severity: "safe" | "suspicious" | "danger";
}

export interface FraudIndicator {
  icon: string;
  title: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface AnalysisResult {
  riskScore: number;
  riskLevel: "safe" | "suspicious" | "high-risk";
  summary: string;
  highlights: HighlightedPhrase[];
  indicators: FraudIndicator[];
  verificationSteps: string[];
  extractedEntities?: {
    companyName: string;
    contactEmail: string;
    contactPhone: string;
    amountRequested: string;
    dateReceived: string;
  };
  complaintDraft?: string;
}

export interface MockOffer {
  id: string;
  title: string;
  preview: string;
  text: string;
  tag: "scam" | "suspicious" | "safe";
  extractedEntities?: {
    companyName: string;
    contactEmail: string;
    contactPhone: string;
    amountRequested: string;
    dateReceived: string;
  };
  complaintDraft?: string;
}

export interface IncomingOffer {
  id: string;
  messageId?: string;
  sender: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  timestamp: number;
}

