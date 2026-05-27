'use client';
import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import type { JobListItem, JobResponse, RequiredSkill, AnalysisResult } from '@/lib/types';

export default function JobsPage() {
    return (
        <Suspense fallback={<p className="text-slate-400">Loading…</p>}>
            <JobsContent />
        </Suspense>
    );
}

function JobsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const jobId = searchParams.get('id');
    const { userId, loading: authLoading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.replace('/login');
    }, [authLoading, isAuthenticated, router]);

    if (authLoading) return <p className="text-slate-400">Loading…</p>;
    if (!userId) return null;

    if (jobId) {
        return <JobDetail userId={userId} jobId={jobId} onBack={() => router.replace('/jobs')} />;
    }

    return <JobsList userId={userId} />;
}

// ─── Sort / filter types ──────────────────────────────────────────────────────

type SortBy = 'date' | 'title' | 'company' | 'bestMatch';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
    { value: 'date', label: 'Date added' },
    { value: 'title', label: 'Title A–Z' },
    { value: 'company', label: 'Company A–Z' },
    { value: 'bestMatch', label: '⭐ Best match for me' },
];

const REMOTE_OPTIONS = [
    { value: '', label: 'Any remote policy' },
    { value: 'remote', label: 'Remote' },
    { value: 'hybrid', label: 'Hybrid' },
    { value: 'on-site', label: 'On-site' },
];

const SENIORITY_OPTIONS = [
    { value: '', label: 'Any seniority' },
    { value: 'junior', label: 'Junior' },
    { value: 'mid', label: 'Mid' },
    { value: 'senior', label: 'Senior' },
    { value: 'lead', label: 'Lead' },
    { value: 'principal', label: 'Principal' },
    { value: 'director', label: 'Director' },
    { value: 'vp', label: 'VP' },
    { value: 'c-level', label: 'C-level' },
];

// ─── Jobs list ────────────────────────────────────────────────────────────────

function JobsList({ userId }: { userId: string }) {
    const router = useRouter();

    // raw data
    const [jobs, setJobs] = useState<JobListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // modals / actions
    const [pasteOpen, setPasteOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // filters & sort
    const [search, setSearch] = useState('');
    const [remoteFilter, setRemoteFilter] = useState('');
    const [seniorityFilter, setSeniorityFilter] = useState('');
    const [sortBy, setSortBy] = useState<SortBy>('date');

    // best-match scores
    const [scores, setScores] = useState<Record<string, number>>({});
    const [loadingScores, setLoadingScores] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);

    useEffect(() => {
        api.listJobs(userId)
            .then(items => setJobs(items))
            .catch(err => setError((err as Error).message))
            .finally(() => setLoading(false));
    }, [userId]);

    // ── load scores when Best Match selected ──
    useEffect(() => {
        if (sortBy !== 'bestMatch') return;
        api.listResults(userId)
            .then((results: AnalysisResult[]) => {
                const map: Record<string, number> = {};
                for (const r of results) map[r.job_id] = Math.round((r.match_score ?? 0));
                setScores(map);
            })
            .catch(() => { })
            .finally(() => setLoadingScores(false));
    }, [sortBy, userId]);

    // ── analyze single job ──
    async function handleAnalyze(jobId: string) {
        setAnalyzingId(jobId);
        try {
            await api.analyzeJob(userId, jobId);
        } catch {
            // might 4xx if already in progress — still try getResult
        }
        try {
            const result = await api.getResult(userId, jobId);
            setScores(prev => ({ ...prev, [jobId]: Math.round(result.match_score ?? 0) }));
        } catch {
            // leave score undefined — will show analyze button again
        }
        setAnalyzingId(null);
    }

    // ── delete ──
    async function handleDelete(id: string) {
        setDeletingId(id);
        try {
            await api.deleteJob(userId, id);
            setJobs(prev => prev.filter(j => j.job_id !== id));
        } catch (err) {
            alert(`Delete failed: ${(err as Error).message}`);
        } finally {
            setDeletingId(null);
        }
    }

    // ── PDF import ──
    async function handlePDFImport(file: File) {
        setUploading(true);
        try {
            const { job_id } = await api.uploadJobFile(userId, file);
            router.push(`/jobs?id=${job_id}`);
        } catch (err) {
            alert(`Import failed: ${(err as Error).message}`);
        } finally {
            setUploading(false);
        }
    }

    // ── derived: filter + sort ──
    const displayedJobs = useMemo(() => {
        let result = [...jobs];

        // search
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(j =>
                (j.title ?? '').toLowerCase().includes(q) ||
                (j.company ?? '').toLowerCase().includes(q)
            );
        }

        // remote policy
        if (remoteFilter) {
            result = result.filter(j => {
                const policy = typeof j.location === 'object' && j.location
                    ? (j.location.remote_policy ?? '').toLowerCase()
                    : '';
                return policy === remoteFilter;
            });
        }

        // seniority
        if (seniorityFilter) {
            result = result.filter(j =>
                (j.seniority ?? '').toLowerCase() === seniorityFilter
            );
        }

        // sort
        if (sortBy === 'date') {
            result.sort((a, b) => {
                const da = a.created_at ? new Date(a.created_at).getTime() : 0;
                const db = b.created_at ? new Date(b.created_at).getTime() : 0;
                return db - da;
            });
        } else if (sortBy === 'title') {
            result.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
        } else if (sortBy === 'company') {
            result.sort((a, b) => (a.company ?? '').localeCompare(b.company ?? ''));
        } else if (sortBy === 'bestMatch') {
            result.sort((a, b) => {
                const sa = scores[a.job_id] ?? -1;
                const sb = scores[b.job_id] ?? -1;
                return sb - sa;
            });
        }

        return result;
    }, [jobs, search, remoteFilter, seniorityFilter, sortBy, scores]);

    const hasActiveFilters = search.trim() || remoteFilter || seniorityFilter;

    return (
        <div className="space-y-5">
            {/* ─ Header ─ */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-slate-100">Job Listings</h1>
                <div className="flex items-center gap-2">
                    <label className={`text-sm px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? 'Importing…' : '📎 Import PDF'}
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            disabled={uploading}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handlePDFImport(f); e.target.value = ''; }}
                        />
                    </label>
                    <button
                        onClick={() => setPasteOpen(true)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                    >
                        + Paste Text
                    </button>
                </div>
            </div>

            {/* ─ Filter / sort bar ─ */}
            <div className="flex flex-wrap gap-2">
                <input
                    type="text"
                    placeholder="Search title or company…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                    value={remoteFilter}
                    onChange={e => setRemoteFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    {REMOTE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                    value={seniorityFilter}
                    onChange={e => setSeniorityFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    {SENIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                    value={sortBy}
                    onChange={e => { const next = e.target.value as SortBy; if (next === 'bestMatch') setLoadingScores(true); setSortBy(next); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {hasActiveFilters && (
                    <button
                        onClick={() => { setSearch(''); setRemoteFilter(''); setSeniorityFilter(''); }}
                        className="text-xs px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 border border-slate-700 hover:bg-slate-800 transition-colors"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* ─ Best match loading indicator ─ */}
            {sortBy === 'bestMatch' && loadingScores && (
                <p className="text-sm text-slate-400 flex items-center gap-2">
                    <Spinner /> Loading match scores…
                </p>
            )}

            {/* ─ Results ─ */}
            {loading ? (
                <p className="text-slate-400">Loading jobs…</p>
            ) : error ? (
                <p className="text-red-400">Error: {error}</p>
            ) : jobs.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                    <p className="text-4xl mb-3">📋</p>
                    <p className="font-medium text-slate-300">No job listings yet</p>
                    <p className="text-sm mt-1">Paste a job description or import a PDF to get started.</p>
                </div>
            ) : displayedJobs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                    <p className="text-3xl mb-3">🔍</p>
                    <p className="font-medium text-slate-300">No jobs match your filters</p>
                    <button
                        onClick={() => { setSearch(''); setRemoteFilter(''); setSeniorityFilter(''); }}
                        className="text-sm text-indigo-400 hover:text-indigo-300 mt-2"
                    >
                        Clear filters
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {displayedJobs.map(job => (
                        <JobCard
                            key={job.job_id}
                            job={job}
                            onView={() => router.push(`/jobs?id=${job.job_id}`)}
                            onDelete={() => handleDelete(job.job_id)}
                            deleting={deletingId === job.job_id}
                            score={sortBy === 'bestMatch' ? scores[job.job_id] : undefined}
                            showAnalyze={sortBy === 'bestMatch' && !(job.job_id in scores) && !loadingScores}
                            onAnalyze={() => handleAnalyze(job.job_id)}
                            analyzing={analyzingId === job.job_id}
                        />
                    ))}
                </div>
            )}

            {pasteOpen && (
                <PasteModal userId={userId} onClose={() => setPasteOpen(false)} onCreated={(jobId) => router.push(`/jobs?id=${jobId}`)} />
            )}
        </div>
    );
}

// ─── Job detail ───────────────────────────────────────────────────────────────

type GenerateState = 'idle' | 'generating' | 'ready';

function JobDetail({ userId, jobId, onBack }: { userId: string; jobId: string; onBack: () => void }) {
    const [job, setJob] = useState<JobResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // analysis (strengths & weaknesses)
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(true);
    const [analyzingJob, setAnalyzingJob] = useState(false);

    // generate actions
    const [cvState, setCvState] = useState<GenerateState>('idle');
    const [clState, setClState] = useState<GenerateState>('idle');

    useEffect(() => {
        api.getJob(userId, jobId)
            .then(setJob)
            .catch(err => setError((err as Error).message))
            .finally(() => setLoading(false));

        api.getResult(userId, jobId)
            .then(setAnalysis)
            .catch(() => { })
            .finally(() => setLoadingAnalysis(false));
    }, [userId, jobId]);

    // Poll for job processing to complete when still pending/processing
    const jobStatus = job?.status;
    useEffect(() => {
        if (!jobStatus || jobStatus === 'ready' || jobStatus === 'error') return;

        const timer = setInterval(async () => {
            try {
                const s = await api.getJobStatus(userId, jobId);
                if (s.structured_status === 'ready' || s.structured_status === 'error') {
                    const updated = await api.getJob(userId, jobId);
                    setJob(updated);
                    clearInterval(timer);
                }
            } catch {
                // keep polling on transient errors
            }
        }, 3000);

        return () => clearInterval(timer);
    }, [jobStatus, userId, jobId]);

    async function handleAnalyzeJob() {
        setAnalyzingJob(true);
        try {
            await api.analyzeJob(userId, jobId);
        } catch { /* may 4xx if already queued */ }
        try {
            const result = await api.getResult(userId, jobId);
            setAnalysis(result);
        } catch { /* leave null */ }
        setAnalyzingJob(false);
    }

    function handleGenerate(type: 'cv' | 'cl') {
        const set = type === 'cv' ? setCvState : setClState;
        set('generating');
        setTimeout(() => set('ready'), 2000);
    }

    if (loading) return <p className="text-slate-400">Loading job…</p>;
    if (error) return (
        <div>
            <button onClick={onBack} className="text-sm text-indigo-400 hover:text-indigo-300 mb-4">← Back to Jobs</button>
            <p className="text-red-400">Error: {error}</p>
        </div>
    );
    if (!job) return null;

    const statusColor: Record<string, string> = {
        ready: 'bg-green-900/50 text-green-400 border-green-800',
        processing: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
        pending: 'bg-slate-800 text-slate-400 border-slate-700',
        error: 'bg-red-900/50 text-red-400 border-red-800',
    };
    const importanceColor: Record<string, string> = {
        required: 'bg-red-900/30 text-red-400 border-red-800/50',
        preferred: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
        'nice-to-have': 'bg-slate-800 text-slate-400 border-slate-700',
    };

    const skills = job.required_skills ?? [];

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                ← Back to Jobs
            </button>

            {/* Processing banner */}
            {(job.status === 'processing' || job.status === 'pending') && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-900/20 border border-yellow-800/50 text-yellow-300 text-sm">
                    <Spinner />
                    <span>Extracting job details — this usually takes a few seconds…</span>
                </div>
            )}

            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-100">{job.title ?? 'Untitled Job'}</h1>
                        {job.company && <p className="text-slate-400 mt-0.5">{job.company}</p>}
                        {job.seniority && <p className="text-sm text-slate-500 mt-0.5">Seniority: {job.seniority}</p>}
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusColor[job.status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                        {job.status}
                    </span>
                </div>

                {/* ─ Action buttons ─ */}
                <div className="mt-5 pt-5 border-t border-slate-800 flex flex-wrap gap-3">
                    <GenerateButton
                        label="📄 Generate Tailored CV"
                        state={cvState}
                        readyLabel="✓ CV Ready — Download"
                        onClick={() => handleGenerate('cv')}
                    />
                    <GenerateButton
                        label="✉️ Generate Cover Letter"
                        state={clState}
                        readyLabel="✓ Cover Letter Ready — Download"
                        onClick={() => handleGenerate('cl')}
                    />
                </div>
            </div>

            {job.location && typeof job.location === 'object' && (
                <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Location</h2>
                    <div className="text-sm space-y-1 text-slate-300">
                        {job.location.office_locations && job.location.office_locations.length > 0 && (
                            <p>📍 {job.location.office_locations.join(', ')}</p>
                        )}
                        {job.location.remote_policy && <p>🌐 {job.location.remote_policy}</p>}
                        {job.location.regions && job.location.regions.length > 0 && (
                            <p>🗺️ {job.location.regions.join(', ')}</p>
                        )}
                    </div>
                </div>
            )}

            {skills.length > 0 && (
                <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Required Skills</h2>
                    <div className="flex flex-wrap gap-2">
                        {skills.map((s, i) => {
                            const name = typeof s === 'string' ? s : (s as RequiredSkill).name;
                            const importance = typeof s === 'string' ? null : (s as RequiredSkill).importance;
                            return (
                                <span key={i} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${importanceColor[importance ?? ''] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                    {name}
                                    {importance && <span className="opacity-60 font-medium">{importance}</span>}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─ Strengths & Weaknesses ─ */}
            <StrengthsWeaknesses
                analysis={analysis}
                loading={loadingAnalysis}
                analyzing={analyzingJob}
                onAnalyze={handleAnalyzeJob}
            />

            {job.raw_text && (
                <details className="bg-slate-900 rounded-2xl border border-slate-700 p-5">
                    <summary className="text-xs font-semibold uppercase tracking-wide text-slate-400 cursor-pointer select-none">
                        Raw Job Text
                    </summary>
                    <p className="mt-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{job.raw_text}</p>
                </details>
            )}
        </div>
    );
}

// ─── Generate button ──────────────────────────────────────────────────────────

function GenerateButton({ label, state, readyLabel, onClick }: {
    label: string;
    state: GenerateState;
    readyLabel: string;
    onClick: () => void;
}) {
    if (state === 'idle') {
        return (
            <button
                onClick={onClick}
                className="text-sm px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600 transition-colors"
            >
                {label}
            </button>
        );
    }
    if (state === 'generating') {
        return (
            <button disabled className="text-sm px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 flex items-center gap-2 opacity-70">
                <Spinner /> Generating…
            </button>
        );
    }
    // ready
    return (
        <button
            onClick={onClick}
            className="text-sm px-4 py-2 rounded-lg bg-green-900/40 border border-green-700/60 text-green-300 hover:bg-green-900/60 transition-colors"
        >
            {readyLabel}
        </button>
    );
}

// ─── Strengths & Weaknesses ───────────────────────────────────────────────────

function StrengthsWeaknesses({
    analysis,
    loading,
    analyzing,
    onAnalyze,
}: {
    analysis: AnalysisResult | null;
    loading: boolean;
    analyzing: boolean;
    onAnalyze: () => void;
}) {
    return (
        <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Strengths &amp; Weaknesses</h2>
                <button
                    onClick={onAnalyze}
                    disabled={analyzing || loading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-800/60 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                    {analyzing ? <><Spinner /> Analysing…</> : analysis ? '↻ Re-analyse' : '⭐ Analyse with AI'}
                </button>
            </div>

            {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
            ) : !analysis ? (
                <p className="text-sm text-slate-500">
                    Run an AI analysis to see how your profile matches this job.
                </p>
            ) : (
                <>
                    {/* Match score bar */}
                    {analysis.match_score !== undefined && (() => {
                        const score = Math.round(analysis.match_score);
                        const scoreColor = score >= 70 ? 'text-green-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
                        const barColor = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
                        return (
                            <div>
                                <div className="flex justify-between text-sm mb-1.5">
                                    <span className="text-slate-400">Overall match</span>
                                    <span className={`font-bold ${scoreColor}`}>{score}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
                                </div>
                            </div>
                        );
                    })()}

                    <div className="grid sm:grid-cols-2 gap-4">
                        {/* Strengths */}
                        {analysis.matched_skills && analysis.matched_skills.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-green-400 mb-2">
                                    ✅ Strengths ({analysis.matched_skills.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {analysis.matched_skills.map((s, i) => {
                                        const name = typeof s === 'string' ? s : s.name;
                                        return (
                                            <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-900/40 text-green-300 border border-green-800/50">
                                                {name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Weaknesses / gaps */}
                        {analysis.missing_skills && analysis.missing_skills.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">
                                    ❌ Gaps ({analysis.missing_skills.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {analysis.missing_skills.map((s, i) => {
                                        const name = typeof s === 'string' ? s : s.name;
                                        const importance = typeof s === 'string' ? null : s.importance;
                                        return (
                                            <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-900/40 text-red-300 border border-red-800/50">
                                                {name}{importance ? <span className="ml-1 opacity-60">· {importance}</span> : null}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Recommendations */}
                    {analysis.recommendations && (
                        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400 mb-2">💡 Tips & Overview</p>
                            <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{analysis.recommendations}</p>
                        </div>
                    )}

                    {/* CV Improvements */}
                    {analysis.cv_improvements && (
                        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-2">✏️ CV Recommendations</p>
                            <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{analysis.cv_improvements}</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Paste text modal ─────────────────────────────────────────────────────────

function PasteModal({ userId, onClose, onCreated }: { userId: string; onClose: () => void; onCreated: (jobId: string) => void }) {
    const [text, setText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        setSubmitting(true);
        setError(null);
        try {
            const { job_id } = await api.createJob(userId, trimmed);
            onCreated(job_id);
            onClose();
        } catch (err) {
            setError((err as Error).message);
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-slate-100">Paste Job Description</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Paste the full job description here…"
                        rows={10}
                        disabled={submitting}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y disabled:opacity-50"
                    />
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800">Cancel</button>
                        <button type="submit" disabled={!text.trim() || submitting} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
                            {submitting ? 'Adding…' : 'Add Job'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
    job,
    onView,
    onDelete,
    deleting,
    score,
    showAnalyze,
    onAnalyze,
    analyzing,
}: {
    job: JobListItem;
    onView: () => void;
    onDelete: () => void;
    deleting: boolean;
    score?: number;
    showAnalyze?: boolean;
    onAnalyze?: () => void;
    analyzing?: boolean;
}) {
    const statusColor: Record<string, string> = {
        ready: 'bg-green-900/50 text-green-400 border-green-800/50',
        processing: 'bg-yellow-900/50 text-yellow-400 border-yellow-800/50',
        pending: 'bg-slate-800 text-slate-500 border-slate-700',
        error: 'bg-red-900/50 text-red-400 border-red-800/50',
    };
    const color = statusColor[job.status] ?? 'bg-slate-800 text-slate-500 border-slate-700';

    const scoreColor = score !== undefined
        ? score >= 70 ? 'bg-green-900/50 text-green-400 border-green-800/50'
            : score >= 40 ? 'bg-yellow-900/50 text-yellow-400 border-yellow-800/50'
                : 'bg-red-900/50 text-red-400 border-red-800/50'
        : '';

    return (
        <div
            className="bg-slate-900 rounded-xl border border-slate-700 p-4 flex items-start justify-between gap-4 hover:border-slate-600 transition-colors cursor-pointer group"
            onClick={onView}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                        {job.title ?? job.job_id}
                    </p>
                    {job.company && <span className="text-sm text-slate-500">@ {job.company}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${color}`}>{job.status}</span>
                    {job.seniority && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800 text-slate-400 font-medium">
                            {job.seniority}
                        </span>
                    )}
                    {score !== undefined && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${scoreColor}`}>
                            {score}% match
                        </span>
                    )}
                </div>
                {/* remote policy sub-line */}
                {job.location && typeof job.location === 'object' && job.location.remote_policy && (
                    <p className="text-xs text-slate-500 mt-0.5">🌐 {job.location.remote_policy}</p>
                )}
                {job.created_at && (
                    <p className="text-xs text-slate-500 mt-0.5">{new Date(job.created_at).toLocaleString()}</p>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                {showAnalyze && (
                    <button
                        onClick={onAnalyze}
                        disabled={analyzing}
                        className="text-xs px-2.5 py-1 rounded-lg bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-800/60 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                        {analyzing ? <><Spinner /> Analysing…</> : '⭐ Analyze'}
                    </button>
                )}
                <button
                    onClick={onDelete}
                    disabled={deleting}
                    className="text-sm text-slate-600 hover:text-red-400 disabled:opacity-40 transition-colors"
                >
                    {deleting ? '…' : 'Delete'}
                </button>
            </div>
        </div>
    );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <svg className="animate-spin h-3 w-3 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    );
}
