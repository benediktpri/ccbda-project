'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/lib/useUser';
import type { ProfileResponse, Skill, Experience, Education } from '@/lib/types';

export default function ProfilePage() {
    const { userId, loading: userLoading } = useUser();
    const [profile, setProfile] = useState<ProfileResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) return;
        api
            .getProfile(userId)
            .then(setProfile)
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
    }, [userId]);

    if (userLoading || loading) return <p className="text-slate-500">Loading profile…</p>;

    if (error === 'Profile not found' || !profile) {
        return (
            <div className="text-center py-16">
                <p className="text-slate-500 mb-4">No profile found. Upload your CV first.</p>
                <Link
                    href="/upload"
                    className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                    Upload CV
                </Link>
            </div>
        );
    }

    if (error) return <p className="text-red-500">Error: {error}</p>;

    const statusColor =
        profile.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800">Profile</h1>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor}`}>
                    {profile.status}
                </span>
            </div>

            {/* Identity */}
            <Section title="About">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Field
                        label="Name"
                        value={[profile.first_name, profile.last_name].filter(Boolean).join(' ') || null}
                    />
                    <Field label="Email" value={profile.email ?? null} />
                    <Field label="Location" value={profile.location ?? null} />
                    <Field
                        label="Open to relocate"
                        value={
                            profile.willingness_to_relocate == null
                                ? null
                                : profile.willingness_to_relocate
                                    ? 'Yes'
                                    : 'No'
                        }
                    />
                    {profile.target_compensation && (
                        <Field
                            label="Target compensation"
                            value={`${profile.target_compensation.min ?? '?'} – ${profile.target_compensation.max ?? '?'} ${profile.target_compensation.currency ?? ''}`}
                        />
                    )}
                </dl>
            </Section>

            {/* Skills */}
            {profile.skills?.length > 0 && (
                <Section title="Skills">
                    <div className="flex flex-wrap gap-2">
                        {profile.skills.map((s, i) => (
                            <SkillBadge key={i} skill={s} />
                        ))}
                    </div>
                </Section>
            )}

            {/* Experience */}
            {profile.experience?.length > 0 && (
                <Section title="Experience">
                    <div className="space-y-4">
                        {profile.experience.map((exp, i) => (
                            <ExperienceItem key={i} exp={exp} />
                        ))}
                    </div>
                </Section>
            )}

            {/* Education */}
            {profile.education?.length > 0 && (
                <Section title="Education">
                    <div className="space-y-2">
                        {profile.education.map((edu, i) => (
                            <EducationItem key={i} edu={edu} />
                        ))}
                    </div>
                </Section>
            )}

            {/* Languages */}
            {profile.languages?.length > 0 && (
                <Section title="Languages">
                    <div className="flex flex-wrap gap-2">
                        {profile.languages.map((l, i) => (
                            <span key={i} className="text-sm bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                {l.language}
                                {l.level ? ` (${l.level})` : ''}
                            </span>
                        ))}
                    </div>
                </Section>
            )}

            <div className="pt-2">
                <Link href="/upload" className="text-sm text-indigo-600 hover:underline">
                    ↑ Re-upload CV
                </Link>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-4">{title}</h2>
            {children}
        </div>
    );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null;
    return (
        <>
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium text-slate-800">{value}</dd>
        </>
    );
}

function SkillBadge({ skill }: { skill: Skill }) {
    const levelColor: Record<string, string> = {
        expert: 'bg-indigo-100 text-indigo-800',
        advanced: 'bg-blue-100 text-blue-800',
        intermediate: 'bg-sky-100 text-sky-800',
        beginner: 'bg-slate-100 text-slate-700',
    };
    const color = skill.level ? (levelColor[skill.level.toLowerCase()] ?? 'bg-slate-100 text-slate-700') : 'bg-slate-100 text-slate-700';

    return (
        <span className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${color}`}>
            {skill.name}
            {skill.level && <span className="ml-1 opacity-60 text-xs">· {skill.level}</span>}
        </span>
    );
}

function ExperienceItem({ exp }: { exp: Experience }) {
    return (
        <div className="border-l-2 border-indigo-200 pl-4">
            <p className="font-medium text-slate-800">{exp.title}</p>
            <p className="text-sm text-slate-500">
                {exp.company}
                {(exp.start || exp.end) && (
                    <span className="ml-2">
                        · {exp.start ?? '?'} – {exp.end ?? 'present'}
                    </span>
                )}
            </p>
            {exp.description && <p className="text-sm text-slate-600 mt-1">{exp.description}</p>}
            {exp.achievements?.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-sm text-slate-600 space-y-0.5">
                    {exp.achievements.map((a, j) => (
                        <li key={j}>{a}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function EducationItem({ edu }: { edu: Education }) {
    return (
        <div>
            <p className="font-medium text-slate-800">
                {edu.degree}
                {edu.field ? ` in ${edu.field}` : ''}
            </p>
            <p className="text-sm text-slate-500">
                {edu.institution}
                {edu.graduation_year ? ` · ${edu.graduation_year}` : ''}
            </p>
        </div>
    );
}
