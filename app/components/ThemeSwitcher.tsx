'use client';

import { useEffect, useState } from 'react';

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    setTheme(savedTheme);
    document.body.setAttribute('data-theme', savedTheme);
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.body.setAttribute('data-theme', newTheme);
  };

  return (
    <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, paddingLeft: '0.5rem' }}>主題</span>
      <select
        value={theme}
        onChange={(e) => changeTheme(e.target.value)}
        style={{
          border: 'none',
          backgroundColor: 'transparent',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          padding: '0.2rem 0.5rem'
        }}
      >
        <option value="light">預設 (Cornell)</option>
        <option value="dark">暗色 (Dark)</option>
        <option value="ocean">海洋 (Ocean)</option>
      </select>
    </div>
  );
}
