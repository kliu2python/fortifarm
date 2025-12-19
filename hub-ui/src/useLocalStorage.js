import { useEffect, useState } from 'react';

export function useLocalStorage(key, initialValue) {
  const [stored, setStored] = useState(() => {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to parse localStorage value', error);
      }
    }
    return initialValue;
  });

  useEffect(() => {
    if (stored === undefined) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(stored));
  }, [key, stored]);

  return [stored, setStored];
}
