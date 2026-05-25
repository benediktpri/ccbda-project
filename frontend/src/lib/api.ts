import type {
  UserResponse,
  ProfileStatusResponse,
  ProfileResponse,
  JobListItem,
  JobResponse,
  AnalysisResult,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('ccbda_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        token = parsed.idToken || null;
      } catch {}
    }
  }

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({ detail: res.statusText }));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? 'Request failed');
  return data as T;
}

export const api = {
  // Users
  getCurrentUser: (): Promise<UserResponse> =>
    request<UserResponse>('/users/me'),

  getUser: (userId: string): Promise<UserResponse> =>
    request<UserResponse>(`/users/${userId}`),

  // CV Upload
  uploadCV: (userId: string, file: File): Promise<void> => {
    const fd = new FormData();
    fd.append('file', file);
    return request<void>(`/users/${userId}/profile/upload-file`, {
      method: 'POST',
      body: fd,
    });
  },

  // Profile
  getProfileStatus: (userId: string): Promise<ProfileStatusResponse> =>
    request<ProfileStatusResponse>(`/users/${userId}/profile/status`),

  getProfile: (userId: string): Promise<ProfileResponse> =>
    request<ProfileResponse>(`/users/${userId}/profile`),

  updateProfile: (userId: string, data: Partial<ProfileResponse>): Promise<ProfileResponse> =>
    request<ProfileResponse>(`/users/${userId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // Job PDF upload
  uploadJobFile: (userId: string, file: File): Promise<{ job_id: string; s3_key: string; message: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    return request(`/users/${userId}/jobs/upload-file`, {
      method: 'POST',
      body: fd,
    });
  },

  // Jobs
  createJob: (userId: string, rawText: string): Promise<{ job_id: string; status: string }> =>
    request(`/users/${userId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, source_type: 'text' }),
    }),

  listJobs: (userId: string): Promise<JobListItem[]> =>
    request<JobListItem[]>(`/users/${userId}/jobs`),

  getJob: (userId: string, jobId: string): Promise<JobResponse> =>
    request<JobResponse>(`/users/${userId}/jobs/${jobId}`),

  deleteJob: (userId: string, jobId: string): Promise<null> =>
    request<null>(`/users/${userId}/jobs/${jobId}`, { method: 'DELETE' }),

  // Analysis
  analyzeJob: (userId: string, jobId: string): Promise<unknown> =>
    request(`/users/${userId}/jobs/${jobId}/analyze`, { method: 'POST' }),

  listResults: (userId: string): Promise<AnalysisResult[]> =>
    request<AnalysisResult[]>(`/users/${userId}/results`),

  getResult: (userId: string, jobId: string): Promise<AnalysisResult> =>
    request<AnalysisResult>(`/users/${userId}/results/${jobId}`),
};
