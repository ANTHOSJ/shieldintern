"use client";

import { useMemo } from "react";
import { HighlightedPhrase } from "@/lib/types";

interface XRayTextViewProps {
  originalText: string;
  highlights: HighlightedPhrase[];
}

const severityColors = {
  danger: "bg-red-500/20 text-red-950 dark:text-red-100 border-b-2 border-red-500 font-semibold px-1 py-0.5 rounded shadow-sm",
  suspicious: "bg-amber-500/20 text-amber-950 dark:text-amber-100 border-b-2 border-amber-500 px-1 py-0.5 rounded",
  safe: "bg-emerald-500/20 text-emerald-950 dark:text-emerald-100 border-b-2 border-emerald-500 px-1 py-0.5 rounded",
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPhraseMatches(original: string, phrase: string): { start: number; end: number }[] {
  const matches: { start: number; end: number }[] = [];
  if (!phrase || !phrase.trim()) return matches;

  const lowerOriginal = original.toLowerCase();
  const lowerPhrase = phrase.toLowerCase().trim();

  // 1. Direct substring match
  let idx = lowerOriginal.indexOf(lowerPhrase);
  if (idx !== -1) {
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + lowerPhrase.length });
      idx = lowerOriginal.indexOf(lowerPhrase, idx + 1);
    }
    return matches;
  }

  // 2. Whitespace-flexible regex (handles line breaks \n, \r\n, and multiple spaces)
  const words = lowerPhrase.split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const pattern = words.map(escapeRegex).join("[\\s\\r\\n]+");
    try {
      const reg = new RegExp(pattern, "gi");
      let m: RegExpExecArray | null;
      while ((m = reg.exec(original)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length });
      }
      if (matches.length > 0) return matches;
    } catch {
      // fallback to next step
    }
  }

  // 3. Punctuation-tolerant fallback (strip trailing/leading punctuation)
  const cleanPhrase = lowerPhrase.replace(/^[.,:;!?'"“”‘’]+|[.,:;!?'"“”‘’]+$/g, "").trim();
  if (cleanPhrase !== lowerPhrase && cleanPhrase.length > 3) {
    const cleanWords = cleanPhrase.split(/\s+/).filter(Boolean);
    if (cleanWords.length > 0) {
      const pattern = cleanWords.map(escapeRegex).join("[\\s\\r\\n]+");
      try {
        const reg = new RegExp(pattern, "gi");
        let m: RegExpExecArray | null;
        while ((m = reg.exec(original)) !== null) {
          matches.push({ start: m.index, end: m.index + m[0].length });
        }
      } catch {
        // fallback
      }
    }
  }

  return matches;
}

export default function XRayTextView({ originalText, highlights }: XRayTextViewProps) {
  // Compute positions
  const { parts, counts } = useMemo(() => {
    const counts = { danger: 0, suspicious: 0, safe: 0 };

    if (!highlights || highlights.length === 0 || !originalText) {
      return { parts: [<span key="raw">{originalText}</span>], counts };
    }

    // Sort highlights: DANGER takes top priority, then suspicious, then safe, then longest first
    const severityWeight: Record<string, number> = { danger: 3, suspicious: 2, safe: 1 };
    const sortedHighlights = [...highlights].sort((a, b) => {
      const weightDiff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
      if (weightDiff !== 0) return weightDiff;
      return b.text.length - a.text.length;
    });

    const positions: {
      start: number;
      end: number;
      severity: "safe" | "suspicious" | "danger";
      text: string;
    }[] = [];

    for (const highlight of sortedHighlights) {
      const matches = findPhraseMatches(originalText, highlight.text);

      for (const match of matches) {
        // Check if this position overlaps with existing higher-priority positions
        const overlaps = positions.some(
          (p) => match.start < p.end && match.end > p.start
        );

        if (!overlaps) {
          positions.push({
            start: match.start,
            end: match.end,
            severity: highlight.severity,
            text: originalText.slice(match.start, match.end),
          });
        }
      }
    }

    // Count severities
    for (const p of positions) {
      if (p.severity in counts) {
        counts[p.severity]++;
      }
    }

    // Sort positions by start index
    positions.sort((a, b) => a.start - b.start);

    // Build parts
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    positions.forEach((pos, idx) => {
      // Add text before this highlight
      if (pos.start > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {originalText.slice(lastIndex, pos.start)}
          </span>
        );
      }

      // Add highlighted text
      parts.push(
        <mark
          key={`highlight-${idx}`}
          className={`${severityColors[pos.severity]} inline`}
          title={`${pos.severity.toUpperCase()} Indicator: "${pos.text.trim().replace(/\s+/g, " ").slice(0, 80)}"`}
        >
          {pos.text}
        </mark>
      );

      lastIndex = pos.end;
    });

    // Add remaining text
    if (lastIndex < originalText.length) {
      parts.push(
        <span key="text-end">{originalText.slice(lastIndex)}</span>
      );
    }

    return { parts, counts };
  }, [originalText, highlights]);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      {/* Header and Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <h3 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
            <span>🔍</span>
            <span>X-Ray Forensic Analysis</span>
          </h3>
          <span className="text-xs text-muted-foreground font-normal">
            (Interactive Word-Level Indicators)
          </span>
        </div>

        {/* Legend with active counts */}
        <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span>Danger ({counts.danger})</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Suspicious ({counts.suspicious})</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Safe ({counts.safe})</span>
          </span>
        </div>
      </div>

      {/* Highlighted text container */}
      <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90 p-3 bg-muted/20 rounded-lg border border-border/40 select-text overflow-x-auto">
        {parts}
      </div>
    </div>
  );
}
