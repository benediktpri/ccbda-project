'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useUser } from '@/lib/useUser';
import type { JobListItem } from '@/lib/types';

export default function JobsPage() {
  const { userId, loading: userLoading } = useUser();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadJobs = useCallback(async (uid: string) => {
    try {
      const items = await api.listJobs(uid);
      setJobs(items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadJobs(userId);
  }, [userId, loadJobs]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !userId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createJob(userId, trimmed);
      setText('');
      await loadJobs(userId);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(jobId: string) {
    if (!userId) return;
    setDeletingId(jobId);
    try {
      await api.deleteJob(userId, jobId);
      setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  if (userLoading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Job Descriptions</h1>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-4">Add Job</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste job description here…"
            rows={6}
            disabled={submitting}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800
              placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400
              disabled:opacity-50 resize-y"
          />
          {submitError && <p className="text-red-500 text-sm">{submitError}</p>}
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium
              hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Adding…' : 'Add Job'}
          </button>
        </form>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-slate-500">Loading jobs…</p>
      ) : error ? (
        <p className="text-red-500">Error: {error}</p>
      ) : jobs.length === 0 ? (
        <p className="text-slate-500 text-center py-8">No jobs yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard
              key={job.job_id}
              job={job}
              onDelete={() => handleDelete(job.job_id)}
              deleting={deletingId === job.job_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  onDelete,
  deleting,
}: {
  job: JobListItem;
  onDelete: () => void;
  deleting: boolean;
}) {
  const statusColor: Record<string, string> = {
    done: 'bg-green-100 text-green-700',
    processing: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-slate-100 text-slate-600',
    error: 'bg-red-100 text-red-700',
  };
  const color = statusColor[job.status] ?? 'bg-slate-100 text-slate-600';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-slate-800 truncate">{job.title ?? job.job_id}</p>
          {job.company && <span className="text-sm text-slate-500">@ {job.company}</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
            {job.status}
          </span>
        </div>
        {job.created_at && (
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(job.created_at).toLocaleString()}
          </p>
        )}
      </div>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40 shrink-0 transition-colors"
      >
        {deleting ? '…' : 'Delete'}
      </button>
    </div>
  );
}
