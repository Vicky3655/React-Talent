const AVATAR_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#16A34A',
  '#EA580C',
  '#0891B2',
  '#DB2777',
  '#D97706',
  '#059669',
];

export function sanitizeUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'https://talentflow.app');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return '';
  } catch {
    return '';
  }
}

export function sanitizeImageSrc(url?: string | null, fallback = ''): string {
  if (!url) return fallback;
  const trimmed = String(url).trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) return trimmed;
  const safe = sanitizeUrl(trimmed);
  return safe || fallback;
}

export function initials(name?: string | null): string {
  const parts = String(name || 'T').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'TF';
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function avatarColor(name?: string | null): string {
  const str = String(name || '');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initialsAvatar(name?: string | null): string {
  const label = initials(name || 'TF');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">` +
    `<rect width="80" height="80" fill="#2563EB"/>` +
    `<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ` +
    `font-family="Inter,system-ui,sans-serif" font-size="30" font-weight="700" fill="#FFFFFF">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function capitalize(s?: string | null): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDate(str?: string | null): string {
  if (!str) return '—';
  const d = str.includes('T') ? new Date(str) : new Date(str + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return 'Just now';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function detectFileType(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (['mp4', 'mov', 'avi'].includes(ext)) return 'vid';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'img';
  if (ext === 'zip') return 'zip';
  return 'other';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function gradeColor(g: number): string {
  if (g >= 85) return '#16A34A';
  if (g >= 70) return '#2563EB';
  if (g >= 55) return '#D97706';
  return '#DC2626';
}

export function evaluatePasswordStrength(val: string): {
  score: number;
  width: string;
  color: string;
  label: string;
} {
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const map = [
    { width: '0%', color: 'transparent', label: '' },
    { width: '25%', color: '#EF4444', label: 'Weak' },
    { width: '50%', color: '#F59E0B', label: 'Fair' },
    { width: '75%', color: '#3B82F6', label: 'Good' },
    { width: '100%', color: '#22C55E', label: 'Strong' },
  ];
  return { score, ...map[score] };
}

export function getRegisterPasswordWarning(password: string): string | null {
  if (!password) return null;
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Must contain both letters and numbers';
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return 'Must contain at least one special character (!@#$%^&*)';
  }
  return null;
}

export const COURSE_THUMB_FALLBACK =
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&q=80';
