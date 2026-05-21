'use client';
import { useState, useEffect } from 'react';
import { api } from './api';

const KEY = 'ccbda_user_id';

interface UseUserReturn {
  userId: string | null;
  loading: boolean;
  error: string | null;
  resetUser: () => void;
}

export function useUser(): UseUserReturn {
  const [userId, setUserId] = useState<string | null>(() => typeof window === 'undefined' ? null : localStorage.getItem(KEY));
  const [loading, setLoading] = useState(() => typeof window === 'undefined' ? true : localStorage.getItem(KEY) === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(KEY) !== null) return;
    api
      .createUser()
      .then((user) => {
        localStorage.setItem(KEY, user.user_id);
        setUserId(user.user_id);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function resetUser() {
    localStorage.removeItem(KEY);
    setUserId(null);
    setLoading(true);
    api
      .createUser()
      .then((user) => {
        localStorage.setItem(KEY, user.user_id);
        setUserId(user.user_id);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  return { userId, loading, error, resetUser };
}
