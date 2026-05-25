'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import type {
    ProfileResponse,
    Skill,
    Experience,
    Education,
    Language,
    Compensation,
} from '@/lib/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function emptySkill(): Skill {
    return { name: '', level: null, years: null, last_used: null };
}
function emptyExp(): Experience {
    return { title: '', company: null, start: null, end: null, description: null, achievements: [] };
}
function emptyEdu(): Education {
    return { degree: '', field: null, institution: null, graduation_year: null };
}
function emptyLang(): Language {
    return { language: '', level: null };
}

const inputCls =
    'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const addBtnCls = 'text-sm text-indigo-400 hover:text-indigo-300 transition-colors';

const AI_QUESTIONS = [
    'What industries are you most interested in working in?',
    'Do you have any certifications or courses not listed on your CV?',
    "What's your preferred work arrangement — remote, hybrid, or in-office?",
    'Are there any skills you are currently learning or planning to learn?',
    'Is there anything else you would like potential employers to know about you?',
];

// ─── main component ───────────────────────────────────────────────────────────

export default function ProfilePage() {
    const router = useRouter();
    const { userId, loading: authLoading, isAuthenticated } = useAuth();
    const [profile, setProfile] = useState<ProfileResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<ProfileResponse | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [uploadMsg, setUploadMsg] = useState('');
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollCount = useRef(0);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.replace('/login');
    }, [authLoading, isAuthenticated, router]);

    useEffect(() => {
        if (!userId) return;
        api
            .getProfile(userId)
            .then(setProfile)
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
    }, [userId]);

    const poll = useCallback(async (uid: string) => {
        pollCount.current += 1;
        if (pollCount.current > 40) {
            if (pollTimer.current) clearInterval(pollTimer.current);
            setUploading(false);
            setUploadMsg('Processing timed out.');
            return;
        }
        try {
            const s = await api.getProfileStatus(uid);
            if (s.structured_status === 'ready' || s.raw_status === 'ready') {
                if (pollTimer.current) clearInterval(pollTimer.current);
                const updated = await api.getProfile(uid);
                setProfile(updated);
                setUploading(false);
                setUploadMsg('');
            }
        } catch {
            // keep polling
        }
    }, []);

    async function handleCVUpload(file: File) {
        if (!userId) return;
        setUploading(true);
        setUploadMsg('Uploading…');
        pollCount.current = 0;
        try {
            await api.uploadCV(userId, file);
            setUploadMsg('Processing CV…');
            pollTimer.current = setInterval(() => poll(userId), 3000);
            poll(userId);
        } catch (err) {
            setUploading(false);
            setUploadMsg(`Upload failed: ${(err as Error).message}`);
        }
    }

    if (authLoading || loading) return <p className="text-slate-400">Loading profile…</p>;

    if (!profile) {
        return (
            <div className="text-center py-16">
                <p className="text-slate-400 mb-4">No profile found. Upload your CV to get started.</p>
                <button
                    onClick={() => router.replace('/onboarding')}
                    className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500"
                >
                    Start Onboarding
                </button>
            </div>
        );
    }

    if (error && !profile) return <p className="text-red-400">Error: {error}</p>;

    const statusColor =
        profile.status === 'ready'
            ? 'bg-green-900/50 text-green-400 border border-green-800'
            : 'bg-yellow-900/50 text-yellow-400 border border-yellow-800';

    const startEditing = () => { setDraft(JSON.parse(JSON.stringify(profile))); setSaveError(null); setEditing(true); };
    const cancelEditing = () => { setEditing(false); setDraft(null); setSaveError(null); };
    const saveEditing = async () => {
        if (!userId || !draft) return;
        setSaving(true); setSaveError(null);
        try {
            const updated = await api.updateProfile(userId, draft);
            setProfile(updated); setEditing(false); setDraft(null);
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : 'Save failed');
        } finally { setSaving(false); }
    };

    // ── read-only view ──────────────────────────────────────────────────────

    if (!editing) {
        return (
            <>
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-100">
                                    {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Your Profile'}
                                </h1>
                                {profile.email && <p className="text-slate-400 text-sm mt-0.5">{profile.email}</p>}
                                {profile.location && <p className="text-slate-500 text-sm">{profile.location}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor}`}>{profile.status}</span>
                                <button onClick={startEditing} className="text-sm px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors">
                                    Edit profile
                                </button>
                                <label className={`text-sm px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {uploading ? uploadMsg : 'Upload New CV'}
                                    <input type="file" accept="application/pdf" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) handleCVUpload(f); }} />
                                </label>
                            </div>
                        </div>
                        {uploading && (
                            <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                                <Spinner /> {uploadMsg}
                            </div>
                        )}
                    </div>

                    <div className="bg-gradient-to-r from-indigo-950/50 to-slate-900 rounded-2xl border border-indigo-800/50 p-5 flex items-center justify-between gap-4">
                        <div>
                            <p className="font-semibold text-slate-100">Improve your Profile</p>
                            <p className="text-sm text-slate-400 mt-0.5">Let us know more about you to find the best opportunities.</p>
                        </div>
                        <button onClick={() => setChatOpen(true)} className="shrink-0 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors">
                            Start Chat
                        </button>
                    </div>

                    <Section title="Personal Info">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <Field label="Name" value={[profile.first_name, profile.last_name].filter(Boolean).join(' ') || null} />
                            <Field label="Email" value={profile.email ?? null} />
                            <Field label="Location" value={profile.location ?? null} />
                            <Field label="Open to relocate" value={profile.willingness_to_relocate == null ? null : profile.willingness_to_relocate ? 'Yes' : 'No'} />
                            {profile.target_compensation && (
                                <Field label="Target compensation" value={`${profile.target_compensation.min ?? '?'} – ${profile.target_compensation.max ?? '?'} ${profile.target_compensation.currency ?? ''}`} />
                            )}
                        </dl>
                    </Section>

                    {profile.skills?.length > 0 && (
                        <Section title="Skills">
                            <div className="flex flex-wrap gap-2">
                                {profile.skills.map((s, i) => <SkillBadge key={i} skill={s} />)}
                            </div>
                        </Section>
                    )}

                    {profile.experience?.length > 0 && (
                        <Section title="Experience">
                            <div className="space-y-4">
                                {profile.experience.map((exp, i) => <ExperienceItem key={i} exp={exp} />)}
                            </div>
                        </Section>
                    )}

                    {profile.education?.length > 0 && (
                        <Section title="Education">
                            <div className="space-y-2">
                                {profile.education.map((edu, i) => <EducationItem key={i} edu={edu} />)}
                            </div>
                        </Section>
                    )}

                    {profile.languages?.length > 0 && (
                        <Section title="Languages">
                            <div className="flex flex-wrap gap-2">
                                {profile.languages.map((l, i) => (
                                    <span key={i} className="text-sm bg-slate-800 text-slate-300 px-3 py-0.5 rounded-full border border-slate-700">
                                        {l.language}{l.level ? ` · ${l.level}` : ''}
                                    </span>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>

                {chatOpen && <ChatModal profile={profile} onClose={() => setChatOpen(false)} />}
            </>
        );
    }

    // ── edit view ───────────────────────────────────────────────────────────

    const d = draft!;
    const setAbout = (key: keyof ProfileResponse, value: unknown) => setDraft(prev => prev ? { ...prev, [key]: value } : prev);
    const setComp = (key: keyof Compensation, value: string) => setDraft(prev => prev ? { ...prev, target_compensation: { ...(prev.target_compensation ?? {}), [key]: value || null } } : prev);
    const setSkill = (i: number, key: keyof Skill, value: unknown) => setDraft(prev => { if (!prev) return prev; const skills = [...prev.skills]; skills[i] = { ...skills[i], [key]: value }; return { ...prev, skills }; });
    const addSkill = () => setDraft(prev => prev ? { ...prev, skills: [...prev.skills, emptySkill()] } : prev);
    const removeSkill = (i: number) => setDraft(prev => prev ? { ...prev, skills: prev.skills.filter((_, j) => j !== i) } : prev);
    const setExp = (i: number, key: keyof Experience, value: unknown) => setDraft(prev => { if (!prev) return prev; const experience = [...prev.experience]; experience[i] = { ...experience[i], [key]: value }; return { ...prev, experience }; });
    const setExpAchievement = (ei: number, ai: number, value: string) => setDraft(prev => { if (!prev) return prev; const experience = [...prev.experience]; const achievements = [...experience[ei].achievements]; achievements[ai] = value; experience[ei] = { ...experience[ei], achievements }; return { ...prev, experience }; });
    const addExpAchievement = (ei: number) => setDraft(prev => { if (!prev) return prev; const experience = [...prev.experience]; experience[ei] = { ...experience[ei], achievements: [...experience[ei].achievements, ''] }; return { ...prev, experience }; });
    const removeExpAchievement = (ei: number, ai: number) => setDraft(prev => { if (!prev) return prev; const experience = [...prev.experience]; experience[ei] = { ...experience[ei], achievements: experience[ei].achievements.filter((_, j) => j !== ai) }; return { ...prev, experience }; });
    const addExp = () => setDraft(prev => prev ? { ...prev, experience: [...prev.experience, emptyExp()] } : prev);
    const removeExp = (i: number) => setDraft(prev => prev ? { ...prev, experience: prev.experience.filter((_, j) => j !== i) } : prev);
    const setEdu = (i: number, key: keyof Education, value: unknown) => setDraft(prev => { if (!prev) return prev; const education = [...prev.education]; education[i] = { ...education[i], [key]: value }; return { ...prev, education }; });
    const addEdu = () => setDraft(prev => prev ? { ...prev, education: [...prev.education, emptyEdu()] } : prev);
    const removeEdu = (i: number) => setDraft(prev => prev ? { ...prev, education: prev.education.filter((_, j) => j !== i) } : prev);
    const setLang = (i: number, key: keyof Language, value: unknown) => setDraft(prev => { if (!prev) return prev; const languages = [...prev.languages]; languages[i] = { ...languages[i], [key]: value }; return { ...prev, languages }; });
    const addLang = () => setDraft(prev => prev ? { ...prev, languages: [...prev.languages, emptyLang()] } : prev);
    const removeLang = (i: number) => setDraft(prev => prev ? { ...prev, languages: prev.languages.filter((_, j) => j !== i) } : prev);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-100">Edit Profile</h1>
                <div className="flex gap-2">
                    <button onClick={cancelEditing} className="text-sm px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800">Cancel</button>
                    <button onClick={saveEditing} disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </div>

            {saveError && <p className="text-sm text-red-400">Error: {saveError}</p>}

            <Section title="About">
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <LabeledInput label="First name" value={d.first_name ?? ''} onChange={v => setAbout('first_name', v || null)} />
                    <LabeledInput label="Last name" value={d.last_name ?? ''} onChange={v => setAbout('last_name', v || null)} />
                    <LabeledInput label="Email" type="email" value={d.email ?? ''} onChange={v => setAbout('email', v || null)} />
                    <LabeledInput label="Location" value={d.location ?? ''} onChange={v => setAbout('location', v || null)} />
                    <div className="col-span-2 flex items-center gap-2">
                        <input type="checkbox" id="relocate" checked={d.willingness_to_relocate ?? false} onChange={e => setAbout('willingness_to_relocate', e.target.checked)} className="rounded border-slate-600 bg-slate-800 accent-indigo-600" />
                        <label htmlFor="relocate" className="text-slate-300">Open to relocate</label>
                    </div>
                    <div className="col-span-2">
                        <p className="text-slate-400 mb-1 text-xs">Target compensation</p>
                        <div className="flex gap-2">
                            <input type="number" placeholder="Min" value={d.target_compensation?.min ?? ''} onChange={e => setComp('min', e.target.value)} className={inputCls} />
                            <input type="number" placeholder="Max" value={d.target_compensation?.max ?? ''} onChange={e => setComp('max', e.target.value)} className={inputCls} />
                            <input type="text" placeholder="Currency" value={d.target_compensation?.currency ?? ''} onChange={e => setComp('currency', e.target.value)} className={inputCls} />
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Skills">
                <div className="space-y-2">
                    {d.skills.map((s, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <input placeholder="Skill name" value={s.name} onChange={e => setSkill(i, 'name', e.target.value)} className={`${inputCls} flex-1 min-w-0`} />
                            <select value={s.level ?? ''} onChange={e => setSkill(i, 'level', e.target.value || null)} className={`${inputCls} !w-32 shrink-0`}>
                                <option value="">Level</option>
                                {['beginner', 'intermediate', 'advanced', 'expert'].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <input placeholder="Yrs" type="number" value={s.years ?? ''} onChange={e => setSkill(i, 'years', e.target.value ? Number(e.target.value) : null)} className={`${inputCls} !w-20 shrink-0`} />
                            <button onClick={() => removeSkill(i)} className="text-slate-500 hover:text-red-400 px-1">✕</button>
                        </div>
                    ))}
                    <button onClick={addSkill} className={addBtnCls}>+ Add skill</button>
                </div>
            </Section>

            <Section title="Experience">
                <div className="space-y-6">
                    {d.experience.map((exp, i) => (
                        <div key={i} className="border border-slate-700 rounded-xl p-4 space-y-2 bg-slate-800/50">
                            <div className="flex justify-between items-center">
                                <p className="text-xs font-semibold text-slate-500 uppercase">Entry {i + 1}</p>
                                <button onClick={() => removeExp(i)} className="text-slate-500 hover:text-red-400 text-sm">Remove</button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <LabeledInput label="Title" value={exp.title} onChange={v => setExp(i, 'title', v)} />
                                <LabeledInput label="Company" value={exp.company ?? ''} onChange={v => setExp(i, 'company', v || null)} />
                                <LabeledInput label="Start (YYYY-MM)" value={exp.start ?? ''} onChange={v => setExp(i, 'start', v || null)} />
                                <LabeledInput label="End (YYYY-MM)" value={exp.end ?? ''} onChange={v => setExp(i, 'end', v || null)} />
                                <div className="col-span-2">
                                    <p className="text-slate-400 mb-1 text-xs">Description</p>
                                    <textarea value={exp.description ?? ''} onChange={e => setExp(i, 'description', e.target.value || null)} rows={2} className={`${inputCls} w-full resize-y`} />
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase mb-1">Achievements</p>
                                {exp.achievements.map((a, j) => (
                                    <div key={j} className="flex gap-2 mb-1">
                                        <input value={a} onChange={e => setExpAchievement(i, j, e.target.value)} className={`${inputCls} flex-1`} placeholder="Achievement" />
                                        <button onClick={() => removeExpAchievement(i, j)} className="text-slate-500 hover:text-red-400 px-1">✕</button>
                                    </div>
                                ))}
                                <button onClick={() => addExpAchievement(i)} className={addBtnCls}>+ Add achievement</button>
                            </div>
                        </div>
                    ))}
                    <button onClick={addExp} className={addBtnCls}>+ Add experience</button>
                </div>
            </Section>

            <Section title="Education">
                <div className="space-y-3">
                    {d.education.map((edu, i) => (
                        <div key={i} className="flex gap-2 items-start flex-wrap">
                            <input placeholder="Degree" value={edu.degree} onChange={e => setEdu(i, 'degree', e.target.value)} className={`${inputCls} w-28`} />
                            <input placeholder="Field" value={edu.field ?? ''} onChange={e => setEdu(i, 'field', e.target.value || null)} className={`${inputCls} flex-1`} />
                            <input placeholder="Institution" value={edu.institution ?? ''} onChange={e => setEdu(i, 'institution', e.target.value || null)} className={`${inputCls} flex-1`} />
                            <input placeholder="Year" value={edu.graduation_year ?? ''} onChange={e => setEdu(i, 'graduation_year', e.target.value || null)} className={`${inputCls} w-20`} />
                            <button onClick={() => removeEdu(i)} className="text-slate-500 hover:text-red-400 px-1 mt-2">✕</button>
                        </div>
                    ))}
                    <button onClick={addEdu} className={addBtnCls}>+ Add education</button>
                </div>
            </Section>

            <Section title="Languages">
                <div className="space-y-2">
                    {d.languages.map((l, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <input placeholder="Language" value={l.language} onChange={e => setLang(i, 'language', e.target.value)} className={`${inputCls} flex-1`} />
                            <input placeholder="Level (B2, Native…)" value={l.level ?? ''} onChange={e => setLang(i, 'level', e.target.value || null)} className={`${inputCls} flex-1`} />
                            <button onClick={() => removeLang(i)} className="text-slate-500 hover:text-red-400 px-1">✕</button>
                        </div>
                    ))}
                    <button onClick={addLang} className={addBtnCls}>+ Add language</button>
                </div>
            </Section>
        </div>
    );
}

// ─── AI Chat Modal ────────────────────────────────────────────────────────────

function ChatModal({ profile, onClose }: { profile: ProfileResponse; onClose: () => void }) {
    const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([
        { role: 'ai', text: `Hi ${profile.first_name ?? 'there'}! I'll ask you a few questions to help strengthen your profile. Ready?` },
    ]);
    const [input, setInput] = useState('');
    const [qIndex, setQIndex] = useState(0);
    const [done, setDone] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    useEffect(() => {
        const t = setTimeout(() => setMessages(prev => [...prev, { role: 'ai', text: AI_QUESTIONS[0] }]), 600);
        return () => clearTimeout(t);
    }, []);

    function send() {
        const trimmed = input.trim();
        if (!trimmed) return;
        const updated = [...messages, { role: 'user' as const, text: trimmed }];
        const nextQ = qIndex + 1;
        if (nextQ < AI_QUESTIONS.length) {
            updated.push({ role: 'ai', text: AI_QUESTIONS[nextQ] });
            setQIndex(nextQ);
        } else {
            updated.push({ role: 'ai', text: "Great, thanks! I've noted your answers. Your profile is looking strong 🚀" });
            setDone(true);
        }
        setMessages(updated);
        setInput('');
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 flex flex-col" style={{ maxHeight: '80vh' }}>
                <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
                    <div>
                        <p className="font-semibold text-slate-100">AI Profile Assistant</p>
                        <p className="text-xs text-slate-400">Simulated · answers stay local</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 rounded-bl-sm'}`}>
                                {m.text}
                            </div>
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>

                {!done ? (
                    <div className="p-4 border-t border-slate-700 flex gap-2 shrink-0">
                        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type your answer…" className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={send} disabled={!input.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors">Send</button>
                    </div>
                ) : (
                    <div className="p-4 border-t border-slate-700 shrink-0">
                        <button onClick={onClose} className="w-full py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors">Done</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">{title}</h2>
            {children}
        </div>
    );
}

function Field({ label, value }: { label: string; value: string | null }) {
    return (
        <div>
            <dt className="text-slate-500 text-xs">{label}</dt>
            <dd className="text-slate-100 font-medium mt-0.5">{value ?? <span className="text-slate-600 font-normal">—</span>}</dd>
        </div>
    );
}

function SkillBadge({ skill }: { skill: Skill }) {
    const levelColor: Record<string, string> = {
        beginner: 'bg-slate-800 text-slate-300 border-slate-700',
        intermediate: 'bg-blue-950/50 text-blue-300 border-blue-800/50',
        advanced: 'bg-indigo-950/50 text-indigo-300 border-indigo-800/50',
        expert: 'bg-violet-950/50 text-violet-300 border-violet-800/50',
    };
    const cls = levelColor[skill.level ?? ''] ?? 'bg-slate-800 text-slate-300 border-slate-700';
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${cls}`}>
            {skill.name}
            {skill.level && <span className="opacity-60">{skill.level}</span>}
        </span>
    );
}

function ExperienceItem({ exp }: { exp: Experience }) {
    return (
        <div className="border-l-2 border-indigo-700 pl-4">
            <p className="font-semibold text-slate-100">{exp.title}</p>
            {exp.company && <p className="text-sm text-slate-400">{exp.company}</p>}
            {(exp.start || exp.end) && <p className="text-xs text-slate-500">{exp.start ?? '?'} – {exp.end ?? 'Present'}</p>}
            {exp.description && <p className="text-sm text-slate-300 mt-1">{exp.description}</p>}
            {exp.achievements?.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                    {exp.achievements.map((a, i) => <li key={i} className="text-sm text-slate-400">• {a}</li>)}
                </ul>
            )}
        </div>
    );
}

function EducationItem({ edu }: { edu: Education }) {
    return (
        <div>
            <p className="font-semibold text-slate-100">{edu.degree}{edu.field ? ` in ${edu.field}` : ''}</p>
            {edu.institution && <p className="text-sm text-slate-400">{edu.institution}</p>}
            {edu.graduation_year && <p className="text-xs text-slate-500">{edu.graduation_year}</p>}
        </div>
    );
}

function LabeledInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
    return (
        <div>
            <p className="text-slate-400 mb-1 text-xs">{label}</p>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
    );
}

function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    );
}
