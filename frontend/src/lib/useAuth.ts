'use client';
import { useState } from 'react';
import { cognito } from './cognito';
import { api } from './api';

const KEY = 'ccbda_auth';

interface AuthData {
    userId: string;
    email: string;
    idToken: string;
    accessToken: string;
    refreshToken: string;
}

interface UseAuthReturn {
    userId: string | null;
    email: string | null;
    loading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string) => Promise<void>;
    confirmSignUp: (email: string, code: string) => Promise<void>;
    logout: () => void;
}

function parseJwt(token: string) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            window
                .atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

export function useAuth(): UseAuthReturn {
    const [auth, setAuth] = useState<AuthData | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const stored = localStorage.getItem(KEY);
            return stored ? (JSON.parse(stored) as AuthData) : null;
        } catch {
            localStorage.removeItem(KEY);
            return null;
        }
    });
    const [loading, setLoading] = useState(false);

    async function login(email: string, password: string) {
        setLoading(true);
        try {
            const res = await cognito.signIn(email, password);
            const claims = parseJwt(res.IdToken);
            const userId = claims?.sub ?? '';
            
            const data: AuthData = {
                userId,
                email: claims?.email ?? email,
                idToken: res.IdToken,
                accessToken: res.AccessToken,
                refreshToken: res.RefreshToken,
            };
            
            localStorage.setItem(KEY, JSON.stringify(data));
            setAuth(data);

            // Auto-create/sync user in the database on login
            try {
                await api.getCurrentUser();
            } catch (err) {
                console.error("Failed to sync/create user in DB:", err);
            }
        } finally {
            setLoading(false);
        }
    }

    async function signUp(email: string, password: string) {
        setLoading(true);
        try {
            await cognito.signUp(email, password);
        } finally {
            setLoading(false);
        }
    }

    async function confirmSignUp(email: string, code: string) {
        setLoading(true);
        try {
            await cognito.confirmSignUp(email, code);
        } finally {
            setLoading(false);
        }
    }

    function logout() {
        localStorage.removeItem(KEY);
        setAuth(null);
    }

    return {
        userId: auth?.userId ?? null,
        email: auth?.email ?? null,
        loading,
        isAuthenticated: auth !== null,
        login,
        signUp,
        confirmSignUp,
        logout,
    };
}
