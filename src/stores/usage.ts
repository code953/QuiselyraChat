import { create } from "zustand";
import { authHeaders } from "@/lib/api-helpers";

export interface UsageSummary {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
}

export interface UsageByModel {
  modelId: string | null;
  provider: string | null;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface UsageByDay {
  date: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface UsageData {
  days: number;
  summary: UsageSummary;
  byModel: UsageByModel[];
  byDay: UsageByDay[];
}

interface UsageState {
  data: UsageData | null;
  days: number;
  loading: boolean;
  fetchUsage: (days?: number) => Promise<void>;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  data: null,
  days: 7,
  loading: false,

  fetchUsage: async (days) => {
    const targetDays = days ?? get().days;
    set({ loading: true, days: targetDays });
    try {
      const res = await fetch(`/api/usage?days=${targetDays}`, { headers: authHeaders() });
      if (res.ok) {
        const data = (await res.json()) as UsageData;
        set({ data });
      }
    } finally {
      set({ loading: false });
    }
  },
}));
