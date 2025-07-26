const API_BASE_URL = process.env.NEXT_PUBLIC_CRUX_API_URL ?? "/api/v1";

export interface TaskResult {
  output: string;
  iterations: number;
  total_tokens: number;
  processing_time: number;
  converged: boolean;
  stop_reason: string;
  metadata: Record<string, any>;
}

export interface AsyncJobResponse {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: string;
  message: string;
}

export interface JobResponse {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  progress: number;
  current_phase?: string;
  result?: TaskResult;
  error?: string;
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const apiClient = {
  async solveBasic(payload: {
    question: string;
    context?: string;
    constraints?: string;
    n_iters?: number;
    async_mode?: boolean;
  }): Promise<TaskResult | AsyncJobResponse> {
    const res = await fetch(`${API_BASE_URL}/solve/basic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async solveEnhanced(payload: {
    question: string;
    context?: string;
    constraints?: string;
    professor_max_iters?: number;
    specialist_max_iters?: number;
    async_mode?: boolean;
    suggested_specializations?: string[];
  }): Promise<TaskResult | AsyncJobResponse> {
    const res = await fetch(`${API_BASE_URL}/solve/enhanced`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async getJob(
    jobId: string,
    params?: {
      include_partial_results?: boolean;
      include_evolution_history?: boolean;
      include_specialist_details?: boolean;
    }
  ): Promise<JobResponse> {
    const search = new URLSearchParams();
    if (params?.include_partial_results)
      search.append("include_partial_results", "true");
    if (params?.include_evolution_history)
      search.append("include_evolution_history", "true");
    if (params?.include_specialist_details)
      search.append("include_specialist_details", "true");
    const res = await fetch(
      `${API_BASE_URL}/jobs/${jobId}${search.size ? `?${search.toString()}` : ""}`
    );
    return handleResponse(res);
  },

  async cancelJob(jobId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/jobs/${jobId}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
  },
};

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatTokens(tokens: number): string {
  return `${tokens.toLocaleString()} tokens`;
}
