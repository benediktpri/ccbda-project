// ─── Domain types (mirror backend Pydantic schemas) ──────────────────────────

export interface Language {
  language: string;
  level?: string | null;
}

export interface Skill {
  name: string;
  level?: string | null;
  years?: number | null;
  last_used?: string | null;
}

export interface Experience {
  title: string;
  company?: string | null;
  start?: string | null;
  end?: string | null;
  description?: string | null;
  achievements: string[];
}

export interface Education {
  degree: string;
  field?: string | null;
  institution?: string | null;
  graduation_year?: string | null;
}

export interface Compensation {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
}

export interface MatchedSkill {
  name: string;
  user_level?: string | null;
  job_requirement?: string | null;
}

export interface MissingSkill {
  name: string;
  importance?: string | null;
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface UserResponse {
  user_id: string;
  created_at: string;
}

export interface ProfileStatusResponse {
  raw_status: string | null;
  structured_status: string | null;
}

export interface ProfileResponse {
  status: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  location?: string | null;
  willingness_to_relocate?: boolean | null;
  target_compensation?: Compensation | null;
  languages: Language[];
  skills: Skill[];
  experience: Experience[];
  education: Education[];
}

export interface JobListItem {
  job_id: string;
  title?: string | null;
  company?: string | null;
  status: string;
  source_type: string;
  seniority?: string | null;
  location?: JobLocation | null;
  created_at?: string | null;
}

export interface RequiredSkill {
  name: string;
  importance?: string | null;
}

export interface JobLocation {
  office_locations?: string[] | null;
  remote_policy?: string | null;
  regions?: string[] | null;
}

export interface JobResponse extends JobListItem {
  raw_text?: string | null;
  location?: JobLocation | null;
  seniority?: string | null;
  required_skills: (RequiredSkill | string)[];
  updated_at?: string | null;
}

export interface AnalysisResult {
  job_id: string;
  match_score: number;
  matched_skills: (MatchedSkill | string)[];
  missing_skills: (MissingSkill | string)[];
  recommendations?: string | null;
  created_at?: string | null;
}

// ─── Analysis result state (includes sentinel strings) ───────────────────────

export type AnalysisState = AnalysisResult | 'loading' | 'not_implemented' | `error:${string}`;
