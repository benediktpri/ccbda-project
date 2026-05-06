'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useUser } from '@/lib/useUser';
import type { JobListItem, AnalysisResult, AnalysisState, MissingSkill, MatchedSkill } from '@/lib/types';

export default function AnalysisPage() {
    const { userId, loading: userLoading } = useUser();
    const [jobs, setJobs] = useState<JobListItem[]>([]);
    const [results, setResults] = useState<Record<string, AnalysisState>>({});
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async (uid: string) => {
        try {
            const [jobItems, resultItems] = await Promise.all([
                api.listJobs(uid),
                api.listResults(uid).catch((): AnalysisResult[] => []),
            ]);
            setJobs(jobItems);
            const map: Record<string, AnalysisState> = {};
            for (const r of resultItems) map[r.job_id] = r;
            setResults(map);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoadingJobs(false);
        }
    }, []);

    useEffect(() => {
        if (!userId) return;
        loadData(userId);
    }, [userId, loadData]);

    async function handleAnalyze(jobId: string) {
        if (!userId) return;
        setResults((prev) => ({ ...prev, [jobId]: 'loading' }));
        try {
            await api.analyzeJob(userId, jobId);
            const result = await api.getResult(userId, jobId).catch((): null => null);
            setResults((prev) => ({ ...prev, [jobId]: result ?? 'not_implemented' }));
        } catch (err) {
            // 501 Not Implemented — try fetching existing result
            try {
                const result = await api.getResult(userId, jobId);
                setResults((prev) => ({ ...prev, [jobId]: result }));
            } catch {
                setResults((prev) => ({ ...prev, [jobId]: `error:${(err as Error).message}` as const }));
            }
        }
    }

    if (userLoading) return <p className="text-slate-500">Loading…</p>;
    if (error) return <p className="text-red-500">Error: {error}</p>;

    if (!loadingJobs && jobs.length === 0) {
        return (
            <div className="text-center py-16">
                <p className="text-slate-500">No jobs yet. Add job descriptions first.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-800">Skills Gap Analysis</h1>

            {loadingJobs ? (
                <p className="text-slate-500">Loading jobs…</p>
            ) : (
                <div className="space-y-4">
                    {jobs.map((job) => (
                        <JobAnalysisCard
                            key={job.job_id}
                            job={job}
                            result={results[job.job_id]}
                            onAnalyze={() => handleAnalyze(job.job_id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function JobAnalysisCard({
    job,
    result,
    onAnalyze,
}: {
    job: JobListItem;
    result: AnalysisState | undefined;
    onAnalyze: () => void;
}) {
    const analyzing = result === 'loading';
    const notImplemented = result === 'not_implemented';
    const isError = typeof result === 'string' && result.startsWith('error:');
    const hasResult = result !== undefined && result !== null && typeof result === 'object';

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="font-semibold text-slate-800">{job.title ?? job.job_id}</p>
                    {job.company && <p className="text-sm text-slate-500">{job.company}</p>}
                </div>
                <button
                    onClick={onAnalyze}
                    disabled={analyzing}
                    className="shrink-0 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg
            hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {analyzing ? 'Analysing…' : result ? 'Re-analyse' : 'Analyse'}
                </button>
            </div>

            {analyzing && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Spinner /> Running analysis…
                </div>
            )}

            {notImplemented && (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                    Bedrock integration is pending — analysis not yet available.
                </p>
            )}

            {isError && (
                <p className="text-sm text-red-500">
                    {(result as string).slice('error:'.length)}
                </p>
            )}

            {hasResult && <AnalysisResultView result={result as AnalysisResult} />}
        </div>
    );
}

function AnalysisResultView({ result }: { result: AnalysisResult }) {
    const score = Math.round((result.match_score ?? 0) * 100);
    const scoreColor =
        score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-red-600';
    const barColor =
        score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div className="space-y-4">
            <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Match score</span>
                    <span className={`font-bold ${scoreColor}`}>{score}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
                {result.matched_skills?.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2">
                            Matched ({result.matched_skills.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {result.matched_skills.map((s, i) => (
                                <SkillChip
                                    key={i}
                                    name={typeof s === 'string' ? s : (s as MatchedSkill).name}
                                    variant="matched"
                                />
                            ))}
                        </div>
                    </div>
                )}

                {result.missing_skills?.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-2">
                            Missing ({result.missing_skills.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {result.missing_skills.map((s, i) => (
                                <SkillChip
                                    key={i}
                                    name={typeof s === 'string' ? s : (s as MissingSkill).name}
                                    variant="missing"
                                    badge={typeof s === 'object' && (s as MissingSkill).importance ? (s as MissingSkill).importance ?? undefined : undefined}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {result.recommendations && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-600 mb-1">Recommendations</p>
                    <p className="whitespace-pre-line">{result.recommendations}</p>
                </div>
            )}
        </div>
    );
}

function SkillChip({
    name,
    variant,
    badge,
}: {
    name: string;
    variant: 'matched' | 'missing';
    badge?: string;
}) {
    const colors =
        variant === 'matched' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors}`}>
            {name}
            {badge && <span className="ml-1 opacity-60">· {badge}</span>}
        </span>
    );
}

function Spinner() {
    return (
        <svg
            className="animate-spin h-4 w-4 text-indigo-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    );
}
