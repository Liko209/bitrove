// Mirror of electron/setup.ts TIERS but renderer-side. Single source
// of truth for tier labels, sizes, RAM hints, and the recommendation
// rule, so Settings → Models, the onboarding wizard, and the
// switch-tier modal all read the same numbers.

export type Tier = "light" | "standard" | "quality" | "max";

export type TierMeta = {
  id: Tier;
  label: string;
  blurb: string;
  embedName: string;
  embedDim: number;
  embedSizeBytes: number;
  estDocsPerSec: number;
  estRamGB: number; // peak across embed + reranker + Bitrove itself
  recommendedRamGB: number;
};

export const TIER_META: TierMeta[] = [
  {
    id: "light",
    label: "Light",
    blurb: "bge-m3 — multilingual baseline. Best on 8 GB Macs.",
    embedName: "bge-m3",
    embedDim: 1024,
    embedSizeBytes: 437_000_000,
    estDocsPerSec: 10,
    estRamGB: 2,
    recommendedRamGB: 8,
  },
  {
    id: "standard",
    label: "Standard",
    blurb: "Qwen3-Embedding-0.6B — newer arch, 32K context, same footprint.",
    embedName: "Qwen3-Embedding-0.6B",
    embedDim: 1024,
    embedSizeBytes: 600_000_000,
    estDocsPerSec: 8,
    estRamGB: 3,
    recommendedRamGB: 12,
  },
  {
    id: "quality",
    label: "Quality",
    blurb: "Qwen3-Embedding-4B — best balance on 16 GB+ Macs.",
    embedName: "Qwen3-Embedding-4B",
    embedDim: 2560,
    embedSizeBytes: 2_400_000_000,
    estDocsPerSec: 3,
    estRamGB: 6,
    recommendedRamGB: 16,
  },
  {
    id: "max",
    label: "Max",
    blurb: "Qwen3-Embedding-8B — MTEB top scores. Pro/Max RAM only.",
    embedName: "Qwen3-Embedding-8B",
    embedDim: 4096,
    embedSizeBytes: 6_000_000_000,
    estDocsPerSec: 1.5,
    estRamGB: 12,
    recommendedRamGB: 32,
  },
];

export function tierMeta(id: Tier): TierMeta {
  return TIER_META.find((t) => t.id === id) ?? TIER_META[0];
}

export function recommendTier(totalRamGB: number): Tier {
  if (totalRamGB >= 16) return "quality";
  if (totalRamGB >= 12) return "standard";
  return "light";
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
