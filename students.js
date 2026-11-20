/* ─── STATE (populated from Firebase/Firestore — see init() at the bottom) ─── */
let STUDENTS = [];
let COURSES = [];           // [{id, title}]
let currentInstructorId = null;

/* ─── AVATAR COLOUR PALETTE ───────────── */
const AVATAR_COLORS = [
    '#2563EB','#7C3AED','#16A34A','#EA580C',
    '#0891B2','#DB2777','#D97706','#059669',
];

function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name) {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/* ─── GRADE COLOUR ────────────────────── */
function gradeColor(g) {
    if (g >= 85) return '#16A34A';
    if (g >= 70) return '#2563EB';
    if (g >= 55) return '#D97706';
    return '#DC2626';
}

/* ─── SECURITY & TOAST HELPERS ────────── */
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (!trimmed) return '';
    try {
        const parsed = new URL(trimmed, window.location.origin);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.href;
        }
        return '';
    } catch {
        return '';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `tf-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3600);
}

// auth.js is an ES module fetching an external dependency, so there's
// no hard guarantee window.TalentFlowAuth exists the instant this
// script runs. Poll briefly instead of assuming it's already there.
function waitForTalentFlowAuth(timeoutMs = 8000) {
    if (window.TalentFlowAuth) return Promise.resolve(window.TalentFlowAuth);
    return new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
            if (window.TalentFlowAuth) {
                clearInterval(timer);
                resolve(window.TalentFlowAuth);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(timer);
                resolve(null);
            }
        }, 50);
    });
}

function waitForTalentFlowGoogle(timeoutMs = 8000) {
    if (window.TalentFlowGoogle) return Promise.resolve(window.TalentFlowGoogle);
    return new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
            if (window.TalentFlowGoogle) {
                clearInterval(timer);
                resolve(window.TalentFlowGoogle);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(timer);
                resolve(null);
            }
        }, 50);
    });
}

/* ─── STATE ───────────────────────────── */
let currentView   = 'table';
let searchQuery   = '';
let statusFilter  = 'all';
let courseFilter  = 'all';      // 'all' or a course id
let sortKey       = 'name';
let sortDir       = 1;          // 1 asc, -1 desc
let currentPage   = 1;
const PER_PAGE    = 8;

/* ─── ELEMENTS ────────────────────────── */
const statCardsEl  = document.getElementById('statCards');
const tableBody    = document.getElementById('tableBody');
const gridWrap     = document.getElementById('gridWrap');
const tableWrap    = document.getElementById('tableWrap');
const emptyState   = document.getElementById('emptyState');
const pagination   = document.getElementById('pagination');
const searchInput  = document.getElementById('searchInput');
const statusSel    = document.getElementById('statusFilter');
const courseSel    = document.getElementById('courseFilter');
const viewTableBtn = document.getElementById('viewTable');
const viewGridBtn  = document.getElementById('viewGrid');

/* ─── STAT CARDS ──────────────────────── */
function renderStatCards() {
    const total    = STUDENTS.length;
    const active   = STUDENTS.filter(s => s.status === 'active').length;
    const graded   = STUDENTS.filter(s => s.grade !== null);
    const avgGrade = graded.length ? Math.round(graded.reduce((a, s) => a + s.grade, 0) / graded.length) : 0;
    const atRisk   = STUDENTS.filter(s => s.status === 'at-risk').length;

    const cards = [
        { label: 'Total Students', value: total,    badge: 'neutral', badgeText: 'All time',    accent: '#2563EB', accentL: '#EFF6FF',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#2563EB"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>` },
        { label: 'Active Learners', value: active,   badge: 'up',      badgeText: total ? `${Math.round(active/total*100)}%` : '—',  accent: '#16A34A', accentL: '#F0FDF4',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#16A34A"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>` },
        { label: 'Average Grade', value: `${avgGrade}%`, badge: avgGrade >= 75 ? 'up' : 'warn', badgeText: avgGrade >= 75 ? 'Good' : 'Fair', accent: '#7C3AED', accentL: '#F5F3FF',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#7C3AED"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>` },
        { label: 'At-Risk Students', value: atRisk,  badge: atRisk > 3 ? 'warn' : 'neutral', badgeText: `Need help`, accent: '#EA580C', accentL: '#FFF7ED',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#EA580C"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>` },
    ];

    statCardsEl.innerHTML = cards.map(c => `
        <div class="stat-card" style="--accent:${c.accent};--accent-l:${c.accentL}">
            <div class="card-top">
                <div class="card-icon">${c.icon}</div>
                <span class="card-badge ${c.badge}">${c.badgeText}</span>
            </div>
            <div class="card-value">${c.value}</div>
            <div class="card-label">${c.label}</div>
        </div>
    `).join('');
}

/* ─── COURSE FILTER DROPDOWN ──────────── */
function populateCourseFilter() {
    courseSel.innerHTML = '<option value="all">All Courses</option>';
    COURSES.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.title;
        courseSel.appendChild(opt);
    });
}

/* ─── FILTERED + SORTED STUDENTS ─────── */
function filtered() {
    return STUDENTS
        .filter(s => {
            const q = searchQuery.toLowerCase();
            const matchQ = !q || s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
            const matchS = statusFilter === 'all' || s.status === statusFilter;
            const matchC = courseFilter === 'all' || s.courseIds.includes(courseFilter);
            return matchQ && matchS && matchC;
        })
        .sort((a, b) => {
            let av, bv;
            if (sortKey === 'name')    { av = a.name;              bv = b.name; }
            if (sortKey === 'grade')   { av = a.grade || 0;         bv = b.grade || 0; }
            if (sortKey === 'courses') { av = a.courseIds.length;   bv = b.courseIds.length; }
            if (sortKey === 'status')  { av = a.status;             bv = b.status; }
            if (sortKey === 'last')    { av = a.enrolledAt || '';   bv = b.enrolledAt || ''; }
            if (av < bv) return -1 * sortDir;
            if (av > bv) return 1 * sortDir;
            return 0;
        });
}

/* ─── AVATAR HTML ─────────────────────── */
function avatarHtml(s, size = 38) {
    const safeUrl = sanitizeUrl(s.avatar);
    const safeName = escapeHtml(s.name || 'Student');
    if (safeUrl) {
        return `<img class="sr-avatar" src="${escapeHtml(safeUrl)}" width="${size}" height="${size}"
                     alt="${safeName}" data-fallback-name="${safeName}" data-fallback-size="${size}">`;
    }
    return `<div class="sr-avatar-initials" style="width:${size}px;height:${size}px;background:${avatarColor(s.name || '')}">${escapeHtml(initials(s.name || 'S'))}</div>`;
}

function initialsNode(name, size) {
    const d = document.createElement('div');
    d.className = 'sr-avatar-initials';
    d.style.cssText = `width:${size}px;height:${size}px;background:${avatarColor(name || '')}`;
    d.textContent = initials(name || 'S');
    return d;
}

function formatDateShort(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── TABLE ROW HTML ──────────────────── */
function rowHtml(s, delay) {
    const courseNames = escapeHtml(s.courseTitles.join(', '));
    const safeName = escapeHtml(s.name);
    const safeSub = escapeHtml(s.courseTitles[0] || 'Not enrolled in any course');
    const safeId = escapeHtml(s.id);
    const statusLabel = s.status === 'at-risk' ? 'At Risk' : s.status.charAt(0).toUpperCase() + s.status.slice(1);
    return `
    <div class="student-row" style="animation-delay:${delay}ms">
        <div class="sr-student clickable" data-view-profile="${safeId}" title="View ${safeName}'s profile">
            ${avatarHtml(s)}
            <div>
                <div class="sr-name">${safeName}</div>
                <div class="sr-email">${safeSub}</div>
            </div>
        </div>
        <div class="sr-courses">
            ${s.courseIds.length}
            <span title="${courseNames}">${s.courseIds.length === 1 ? 'course' : 'courses'}</span>
        </div>
        <div class="sr-grade" style="color:${gradeColor(s.grade || 0)}">${s.grade !== null ? s.grade + '%' : '—'}</div>
        <div class="sr-status">
            <span class="status-pill ${escapeHtml(s.status)}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="sr-last">${formatDateShort(s.enrolledAt)}</div>
        <div class="sr-actions">
            <button type="button" class="action-btn btn-view-profile" data-student-id="${safeId}" title="View profile">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                </svg>
            </button>
            <button type="button" class="action-btn btn-schedule-meet" data-student-id="${safeId}" title="Schedule Google Meet class">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/>
                </svg>
            </button>
            <button type="button" class="action-btn btn-message-student" data-student-id="${safeId}" title="Contact student">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/>
                </svg>
            </button>
        </div>
    </div>`;
}

/* ─── GRID CARD HTML ──────────────────── */
function cardHtml(s) {
    const safeName = escapeHtml(s.name);
    const safeSub = escapeHtml(s.courseTitles[0] || 'Not enrolled in any course');
    const safeId = escapeHtml(s.id);
    const statusLabel = s.status === 'at-risk' ? 'At Risk' : s.status.charAt(0).toUpperCase() + s.status.slice(1);
    return `
    <div class="student-card">
        <div class="sc-top clickable" data-view-profile="${safeId}" title="View ${safeName}'s profile">
            ${avatarHtml(s, 44)}
            <div class="sc-info">
                <div class="sc-name">${safeName}</div>
                <div class="sc-email">${safeSub}</div>
            </div>
        </div>
        <div class="sc-stats">
            <div class="sc-stat">
                <div class="sc-stat-val" style="color:${gradeColor(s.grade || 0)}">${s.grade !== null ? s.grade + '%' : '—'}</div>
                <div class="sc-stat-lbl">Grade</div>
            </div>
            <div class="sc-stat">
                <div class="sc-stat-val">${s.courseIds.length}</div>
                <div class="sc-stat-lbl">Courses</div>
            </div>
            <div class="sc-stat">
                <div class="sc-stat-val" style="font-size:13px;color:var(--slate-5)">${formatDateShort(s.enrolledAt)}</div>
                <div class="sc-stat-lbl">Enrolled</div>
            </div>
        </div>
        <div class="sc-footer">
            <span class="status-pill ${escapeHtml(s.status)}">${escapeHtml(statusLabel)}</span>
            <div style="display:flex;gap:6px">
                <button type="button" class="action-btn btn-view-profile" data-student-id="${safeId}" title="View profile">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                    </svg>
                </button>
                <button type="button" class="action-btn btn-schedule-meet" data-student-id="${safeId}" title="Schedule Google Meet class">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/>
                    </svg>
                </button>
                <button type="button" class="action-btn btn-message-student" data-student-id="${safeId}" title="Contact student">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/>
                    </svg>
                </button>
            </div>
        </div>
    </div>`;
}

/* ─── PAGINATION HTML ─────────────────── */
function renderPagination(total) {
    const pages = Math.ceil(total / PER_PAGE);
    if (pages <= 1) { pagination.innerHTML = ''; return; }

    const start = (currentPage - 1) * PER_PAGE + 1;
    const end   = Math.min(currentPage * PER_PAGE, total);

    let btns = `<button class="page-btn" id="prevBtn" ${currentPage === 1 ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/>
        </svg>
    </button>`;

    for (let p = 1; p <= pages; p++) {
        btns += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }

    btns += `<button class="page-btn" id="nextBtn" ${currentPage === pages ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
        </svg>
    </button>`;

    pagination.innerHTML = `
        <span class="page-info">Showing ${start}–${end} of ${total} students</span>
        <div class="page-btns">${btns}</div>`;

    pagination.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => { currentPage = +btn.dataset.page; render(); });
    });
    const prev = pagination.querySelector('#prevBtn');
    const next = pagination.querySelector('#nextBtn');
    if (prev) prev.addEventListener('click', () => { currentPage--; render(); });
    if (next) next.addEventListener('click', () => { currentPage++; render(); });
}

/* ─── MAIN RENDER ─────────────────────── */
function render() {
    const list = filtered();
    const isEmpty = list.length === 0;

    emptyState.classList.toggle('visible', isEmpty);

    if (currentView === 'table') {
        tableWrap.style.display = '';
        gridWrap.classList.remove('visible');

        if (!isEmpty) {
            const start = (currentPage - 1) * PER_PAGE;
            const page  = list.slice(start, start + PER_PAGE);
            tableBody.innerHTML = page.map((s, i) => rowHtml(s, i * 40)).join('');
        } else {
            tableBody.innerHTML = '';
        }
        renderPagination(list.length);
    } else {
        tableWrap.style.display = 'none';
        gridWrap.classList.add('visible');
        gridWrap.innerHTML = isEmpty ? '' : list.map(s => cardHtml(s)).join('');
        pagination.innerHTML = '';
    }

    attachAvatarFallbacks(tableBody);
    attachAvatarFallbacks(gridWrap);
}

function attachAvatarFallbacks(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('img.sr-avatar[data-fallback-name]').forEach((img) => {
        img.addEventListener('error', () => {
            const name = img.dataset.fallbackName || 'Student';
            const size = Number(img.dataset.fallbackSize) || 38;
            img.replaceWith(initialsNode(name, size));
        }, { once: true });
    });
}

function handleStudentListClick(e) {
    const viewBtn = e.target.closest('.btn-view-profile');
    if (viewBtn) {
        openStudentProfile(viewBtn.dataset.studentId);
        return;
    }
    const profileTrigger = e.target.closest('[data-view-profile]');
    if (profileTrigger) {
        openStudentProfile(profileTrigger.dataset.viewProfile);
        return;
    }
    const meetBtn = e.target.closest('.btn-schedule-meet');
    if (meetBtn) {
        openScheduleModal({ prefillStudentId: meetBtn.dataset.studentId });
        return;
    }
    const msgBtn = e.target.closest('.btn-message-student');
    if (msgBtn) {
        const student = STUDENTS.find((st) => st.id === msgBtn.dataset.studentId);
        if (student && student.email) {
            navigator.clipboard.writeText(student.email).catch(() => {});
            showToast(`Copied ${student.name}'s email (${student.email})`, 'success');
        } else if (student) {
            openStudentProfile(student.id);
        }
    }
}

tableBody.addEventListener('click', handleStudentListClick);
gridWrap.addEventListener('click', handleStudentListClick);

/* ─── SORT CLICK ──────────────────────── */
document.querySelectorAll('.th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) sortDir *= -1;
        else { sortKey = key; sortDir = 1; }
        currentPage = 1;
        render();
    });
});

/* ─── SEARCH ──────────────────────────── */
searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    currentPage = 1;
    render();
});

/* ─── FILTERS ─────────────────────────── */
statusSel.addEventListener('change', () => { statusFilter = statusSel.value; currentPage = 1; render(); });
courseSel.addEventListener('change', () => { courseFilter = courseSel.value; currentPage = 1; render(); });

/* ─── VIEW TOGGLE ─────────────────────── */
viewTableBtn.addEventListener('click', () => {
    currentView = 'table';
    viewTableBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    render();
});
viewGridBtn.addEventListener('click', () => {
    currentView = 'grid';
    viewGridBtn.classList.add('active');
    viewTableBtn.classList.remove('active');
    render();
});

// EmailJS — get these from dashboard.emailjs.com:
//   EJS_KEY      → Account → General → Public Key
//   EJS_TEMPLATE → Email Templates → your template's ID
// Until BOTH are filled in (neither left as the placeholder below),
// invites run in demo mode: the UI simulates sending but no real email goes out.
const EJS_KEY      = 'YRtV6OjHqgCt9kEUR';
const EJS_SERVICE  = 'service_f4dl4md';
const EJS_TEMPLATE = 'template_t02zlfa';
const SENDER_NAME  = 'CHIME VICTOR CHINAGOROM';
const SENDER_EMAIL = 'victrends365@gmail.com';

// Registration page invited students land on, resolved against this site's
// own origin so the link always works wherever the app is actually hosted
// (localhost while developing, the real domain once deployed) instead of
// pointing at a domain that doesn't exist.
// ⚠️ Change 'register.html' below if your sign-up page has a different name/path.
// Resolve the registration page relative to the current page so the same
// invite link works on localhost, a deployed subpath, or a local file preview.
const BASE_LINK = new URL('register.html', window.location.href).href;

// Builds one invite link carrying everything the registration page needs to
// recognize the invite: which instructor it's from, which course(s) it
// should enroll into, and — for a personal email invite — which address
// it was sent to. A fresh token is minted per call, so every invite
// (and every recipient in a batch) gets its own distinct link.
// Returns { token, link } — the token is also what gets persisted to
// Supabase (via TalentFlowInvites, see invites-store.js) so the two stay
// in sync without a second round trip.
function buildInviteLink(courseIds, email) {
    const token  = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const params = new URLSearchParams({ invite: `inv_${token}` });
    if (email)               params.set('email', email);
    if (courseIds?.length)   params.set('courses', courseIds.join(','));
    if (currentInstructorId) params.set('instructor', currentInstructorId);
    return { token, link: `${BASE_LINK}?${params.toString()}` };
}

// Best-effort persistence — a Supabase hiccup should never stop an invite
// email from going out. window.TalentFlowInvites is defined by
// invites-store.js; the guard keeps this safe even if that file isn't
// loaded yet on a given page.
function persistInvite(token, email, courseIds, message) {
    if (!window.TalentFlowInvites) return;
    TalentFlowInvites.createInvite({
        token, instructorId: currentInstructorId, email, courseIds, message,
    }).catch(err => console.error('[invite] not persisted to Supabase:', err));
}

/* ─── INVITE MODAL ────────────────────── */
(function () {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const overlay        = document.getElementById('inviteOverlay');
    const btnOpen        = document.getElementById('inviteBtn');
    const btnClose       = document.getElementById('modalClose');
    const btnCancel      = document.getElementById('modalCancel');
    const btnSend        = document.getElementById('sendInviteBtn');
    const sendBtnText    = document.getElementById('sendBtnText');
    const tabs           = document.querySelectorAll('.modal-tab');
    const panelEmail     = document.getElementById('panelEmail');
    const panelLink      = document.getElementById('panelLink');
    const progressPanel  = document.getElementById('progressPanel');
    const progressTitle  = document.getElementById('progressTitle');
    const progressNote   = document.getElementById('progressNote');
    const progressList   = document.getElementById('progressList');
    const sendSpinner    = document.getElementById('sendSpinner');
    const progressCheck  = document.getElementById('progressCheck');
    const demoNotice     = document.getElementById('demoNotice');
    const chipInput      = document.getElementById('chipInput');
    const emailTyping    = document.getElementById('emailTypingInput');
    const emailChecks    = document.getElementById('emailCourseChecks');
    const linkChecks     = document.getElementById('linkCourseChecks');
    const copyLinkBtn    = document.getElementById('copyLinkBtn');
    const copyBtnText    = document.getElementById('copyBtnText');
    const footerWrap     = document.getElementById('modalFooterWrap');
    const successPanel   = document.getElementById('modalSuccess');
    const btnDone        = document.getElementById('btnDone');
    const modalTabsEl    = document.querySelector('.modal-tabs');

    let chips               = [];
    let activeTab           = 'email';
    let emailCourseSelected = [];
    let linkCourseSelected  = [];
    let isSending           = false;

    function openModal() {
        resetModal();
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => emailTyping.focus(), 120);
    }

    function closeModal() {
        if (isSending) return;
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    btnOpen.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);
    btnDone.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });

    function resetModal() {
        chips = []; activeTab = 'email';
        emailCourseSelected = []; linkCourseSelected = [];
        isSending = false;
        emailTyping.value = '';
        document.getElementById('personalMsg').value = '';
        chipInput.querySelectorAll('.chip').forEach(c => c.remove());
        chipInput.classList.add('empty');

        progressPanel.classList.add('hidden');
        successPanel.classList.remove('visible');
        panelEmail.classList.remove('hidden');
        panelLink.classList.add('hidden');
        modalTabsEl.style.display = '';
        footerWrap.style.display  = '';
        btnSend.style.display     = '';
        btnCancel.textContent     = 'Cancel';

        sendSpinner.style.display = '';
        progressCheck.classList.add('hidden');
        progressCheck.classList.remove('error-state');
        progressList.innerHTML = '';
        demoNotice.classList.add('hidden');

        buildCourseChecks(emailChecks, emailCourseSelected);
        buildCourseChecks(linkChecks,  linkCourseSelected);
        document.getElementById('inviteLink').textContent = buildInviteLink([]).link;
        copyBtnText.textContent = 'Copy';
        copyLinkBtn.classList.remove('copied');
        switchTab('email');
        updateSendBtn();
    }

    tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

    function switchTab(name) {
        activeTab = name;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        panelEmail.classList.toggle('hidden', name !== 'email');
        panelLink.classList.toggle('hidden',  name !== 'link');
        updateSendBtn();
    }

    function isValidEmail(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
    }

    function normalizeEmail(raw) {
        return raw.trim().replace(/,+$/, '');
    }

    function addChip(raw) {
        const email = normalizeEmail(raw);
        if (!email) return;
        if (!isValidEmail(email)) { shakeChipInput(); return; }
        if (chips.includes(email)) { emailTyping.value = ''; return; }
        chips.push(email);
        renderChips();
        emailTyping.value = '';
        chipInput.classList.remove('empty');
        updateSendBtn();
    }

    function getDraftEmails() {
        return emailTyping.value
            .split(/[\s,;]+/)
            .map(normalizeEmail)
            .filter(Boolean);
    }

    function commitDraftEmails() {
        const draftEmails = getDraftEmails();
        if (!draftEmails.length) return 0;
        emailTyping.value = '';
        draftEmails.forEach(addChip);
        return draftEmails.length;
    }

    function removeChip(email) {
        chips = chips.filter(c => c !== email);
        renderChips();
        chipInput.classList.toggle('empty', chips.length === 0);
        updateSendBtn();
        emailTyping.focus();
    }

    function renderChips() {
        chipInput.querySelectorAll('.chip').forEach(c => c.remove());
        chips.forEach(email => {
            const safeEmail = escapeHtml(email);
            const div = document.createElement('div');
            div.className = 'chip';
            div.innerHTML = `${safeEmail}<button class="chip-x" type="button" aria-label="Remove ${safeEmail}">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg></button>`;
            div.querySelector('.chip-x').addEventListener('click', () => removeChip(email));
            chipInput.insertBefore(div, emailTyping);
        });
    }

    function shakeChipInput() {
        chipInput.style.borderColor = '#EF4444';
        chipInput.animate(
            [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
             { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
             { transform: 'translateX(0)' }],
            { duration: 300, easing: 'ease' }
        );
        setTimeout(() => { chipInput.style.borderColor = ''; }, 700);
    }

    emailTyping.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitDraftEmails(); }
        if (e.key === 'Backspace' && !emailTyping.value && chips.length) removeChip(chips[chips.length - 1]);
    });
    emailTyping.addEventListener('paste', () => {
        setTimeout(() => { emailTyping.value.split(/[\s,;]+/).forEach(addChip); emailTyping.value = ''; }, 0);
    });
    emailTyping.addEventListener('input', updateSendBtn);
    chipInput.addEventListener('click', () => emailTyping.focus());

    function buildCourseChecks(container, selectedArr) {
        if (!COURSES.length) {
            container.innerHTML = `<p style="grid-column:1/-1;font-size:12.5px;color:var(--slate-4);padding:6px 2px">You don't have any courses yet.</p>`;
            return;
        }
        container.innerHTML = COURSES.map((c, i) => `
            <label class="course-check-item${selectedArr.includes(i) ? ' checked' : ''}" data-idx="${i}">
                <input type="checkbox" ${selectedArr.includes(i) ? 'checked' : ''}>
                <div class="check-box">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                    </svg>
                </div>
                <div class="check-name">${c.title}</div>
            </label>`).join('');

        container.querySelectorAll('.course-check-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = +item.dataset.idx;
                item.classList.toggle('checked');
                item.querySelector('input').checked = item.classList.contains('checked');
                if (item.classList.contains('checked')) {
                    if (!selectedArr.includes(idx)) selectedArr.push(idx);
                } else {
                    const pos = selectedArr.indexOf(idx);
                    if (pos > -1) selectedArr.splice(pos, 1);
                }
            });
        });
    }

    function updateSendBtn() {
        if (activeTab === 'email') {
            const draftEmails = new Set(
                getDraftEmails().filter(email => isValidEmail(email) && !chips.includes(email))
            );
            const n = chips.length + draftEmails.size;
            btnSend.disabled = n === 0 || isSending;
            sendBtnText.textContent = n === 0 ? 'Send invite'
                : n === 1 ? 'Send 1 invite'
                : `Send ${n} invites`;
        } else {
            btnSend.disabled = isSending;
            sendBtnText.textContent = 'Regenerate link';
        }
    }

    function buildProgressList(emailList) {
        progressList.innerHTML = emailList.map(email => `
            <div class="pi-row" data-email="${email.replace(/"/g,'&quot;')}">
                <div class="pi-icon">
                    <div class="pi-spin" style="display:none"></div>
                    <svg class="pi-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" stroke="#CBD5E1" stroke-width="2"/>
                    </svg>
                </div>
                <div class="pi-email">${email}</div>
                <span class="pi-badge pending">Pending</span>
            </div>`).join('');
    }

    function setItemStatus(email, status) {
        const row = progressList.querySelector(`[data-email="${email.replace(/"/g,'&quot;')}"]`);
        if (!row) return;
        const spinner = row.querySelector('.pi-spin');
        const svg     = row.querySelector('.pi-svg');
        const badge   = row.querySelector('.pi-badge');
        badge.className = `pi-badge ${status}`;

        if (status === 'sending') {
            spinner.style.display = '';
            svg.style.display = 'none';
            badge.textContent = 'Sending…';
        } else if (status === 'sent') {
            spinner.style.display = 'none';
            svg.style.display = '';
            svg.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="none" stroke="#16A34A" stroke-width="2"/>`;
            badge.textContent = 'Sent ✓';
        } else if (status === 'failed') {
            spinner.style.display = 'none';
            svg.style.display = '';
            svg.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="none" stroke="#DC2626" stroke-width="2"/>`;
            badge.textContent = 'Failed';
        }
    }

    function setProgressHead(title, note, icon) {
        progressTitle.textContent = title;
        progressNote.textContent  = note;
        if (icon === 'spinner') {
            sendSpinner.style.display = '';
            progressCheck.classList.add('hidden');
        } else {
            sendSpinner.style.display = 'none';
            progressCheck.classList.remove('hidden');
            progressCheck.classList.toggle('error-state', icon === 'error');
            progressCheck.innerHTML = icon === 'error'
                ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`;
        }
    }

    async function doSendEmails() {
        commitDraftEmails();
        if (chips.length === 0) return;

        isSending = true;
        const emailList   = [...chips];
        const courseIds   = emailCourseSelected.map(i => COURSES[i]?.id).filter(Boolean);
        const courseNames = emailCourseSelected.map(i => COURSES[i]?.title).filter(Boolean);
        const message     = document.getElementById('personalMsg').value.trim();
        const isDemo      = /^YOUR_/.test(EJS_KEY) || /^YOUR_/.test(EJS_TEMPLATE);

        panelEmail.classList.add('hidden');
        modalTabsEl.style.display = 'none';
        progressPanel.classList.remove('hidden');
        footerWrap.style.display  = 'none';

        buildProgressList(emailList);
        setProgressHead(
            `Sending ${emailList.length} invite${emailList.length > 1 ? 's' : ''}…`,
            'Please keep this window open',
            'spinner'
        );

        if (isDemo) demoNotice.classList.remove('hidden');
        else        emailjs.init({ publicKey: EJS_KEY });

        let sentCount = 0, failCount = 0;

        for (let i = 0; i < emailList.length; i++) {
            const email = emailList[i];
            const { token, link: inviteLink } = buildInviteLink(courseIds, email); // unique per recipient
            setProgressHead(`Sending ${i + 1} of ${emailList.length}…`, 'Please keep this window open', 'spinner');
            setItemStatus(email, 'sending');
            await persistInvite(token, email, courseIds, message);

            try {
                if (isDemo) {
                    await sleep(800 + Math.random() * 600);
                } else {
                    await emailjs.send(EJS_SERVICE, EJS_TEMPLATE, {
                        to_name:          email.split('@')[0],
                        to_email:         email,
                        from_name:        SENDER_NAME,
                        reply_to:         SENDER_EMAIL,
                        courses:          courseNames.length
                                            ? courseNames.join(', ')
                                            : 'your enrolled courses',
                        personal_message: message || "You've been invited to join Talent Flow.",
                        invite_link:      inviteLink,
                    });
                }
                setItemStatus(email, 'sent');
                sentCount++;
            } catch (err) {
                console.error('EmailJS error for', email, err);
                setItemStatus(email, 'failed');
                failCount++;
            }
        }

        isSending = false;
        if (failCount === 0) {
            setProgressHead(
                sentCount === 1 ? 'Invite sent!' : `${sentCount} invites sent!`,
                isDemo
                    ? 'Demo mode — add your EmailJS credentials to send real emails.'
                    : 'Students will receive their invitation shortly.',
                'check'
            );
        } else if (sentCount === 0) {
            setProgressHead('Failed to send', 'Check your EmailJS credentials and try again.', 'error');
        } else {
            setProgressHead(`${sentCount} sent, ${failCount} failed`, 'Some invites could not be delivered.', 'check');
        }

        footerWrap.style.display = '';
        btnSend.style.display    = 'none';
        btnCancel.textContent    = 'Close';
    }

    btnSend.addEventListener('click', async () => {
        if (activeTab === 'email') {
            await doSendEmails();
        } else {
            const courseIds = linkCourseSelected.map(i => COURSES[i]?.id).filter(Boolean);
            const { token, link } = buildInviteLink(courseIds);
            persistInvite(token, null, courseIds, null); // fire-and-forget — link text updates instantly either way
            document.getElementById('inviteLink').textContent = link;
            copyBtnText.textContent = 'Copy';
            copyLinkBtn.classList.remove('copied');
        }
    });

    copyLinkBtn.addEventListener('click', () => {
        const link = document.getElementById('inviteLink').textContent;
        navigator.clipboard.writeText(link).catch(() => {});
        copyBtnText.textContent = 'Copied!';
        copyLinkBtn.classList.add('copied');
        setTimeout(() => { copyBtnText.textContent = 'Copy'; copyLinkBtn.classList.remove('copied'); }, 2000);
    });
})();

/* ─── CONFIRMATION DIALOG (FOR WORKSPACE MUTATIONS) ─── */
function askConfirmation({ title = 'Confirm Action', message = '', confirmText = 'Confirm', isDanger = true } = {}) {
    const overlay = document.getElementById('confirmActionOverlay');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const proceedBtn = document.getElementById('confirmProceedBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const closeBtn = document.getElementById('confirmCloseBtn');

    titleEl.textContent = title;
    msgEl.textContent = message;
    proceedBtn.textContent = confirmText;
    proceedBtn.className = isDanger ? 'btn-modal-danger' : 'btn-modal-danger primary-confirm';

    overlay.classList.add('open');

    return new Promise((resolve) => {
        const cleanup = (result) => {
            overlay.classList.remove('open');
            proceedBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlay);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };
        const onKey = (e) => { if (e.key === 'Escape') cleanup(false); };

        proceedBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlay);
        document.addEventListener('keydown', onKey);
    });
}

/* ─── STUDENT PROFILE MODAL ───────────── */
let activeProfileStudent = null;

function closeStudentProfile() {
    const overlay = document.getElementById('studentProfileOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    activeProfileStudent = null;
}

async function openStudentProfile(studentId) {
    if (!studentId || !currentInstructorId) return;
    const summary = STUDENTS.find((s) => s.id === studentId);
    const overlay = document.getElementById('studentProfileOverlay');
    const loadingEl = document.getElementById('spLoading');
    const bodyEl = document.getElementById('spBody');

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    loadingEl.hidden = false;
    bodyEl.hidden = true;

    try {
        const detail = await TalentFlowData.getStudentProfileDetail(currentInstructorId, studentId);
        activeProfileStudent = {
            ...detail,
            grade: summary ? summary.grade : null,
            enrolledAt: summary ? summary.enrolledAt : null,
            status: summary ? summary.status : 'active',
        };
        renderStudentProfileModal(activeProfileStudent);
        loadingEl.hidden = true;
        bodyEl.hidden = false;
    } catch (err) {
        console.error('Failed to load student profile:', err);
        loadingEl.hidden = true;
        closeStudentProfile();
        showToast('Could not load student profile. Please try again.', 'error');
    }
}

function renderStudentProfileModal(detail) {
    const avatarWrap = document.getElementById('spAvatarWrap');
    avatarWrap.innerHTML = '';
    const safeAvatar = sanitizeUrl(detail.avatar);
    if (safeAvatar) {
        const img = document.createElement('img');
        img.src = safeAvatar;
        img.alt = detail.fullName || 'Student';
        img.addEventListener('error', () => {
            avatarWrap.innerHTML = '';
            const div = document.createElement('div');
            div.className = 'sp-avatar-initials';
            div.style.background = avatarColor(detail.fullName || '');
            div.textContent = initials(detail.fullName || 'S');
            avatarWrap.appendChild(div);
        }, { once: true });
        avatarWrap.appendChild(img);
    } else {
        const div = document.createElement('div');
        div.className = 'sp-avatar-initials';
        div.style.background = avatarColor(detail.fullName || '');
        div.textContent = initials(detail.fullName || 'S');
        avatarWrap.appendChild(div);
    }

    document.getElementById('spName').textContent = detail.fullName || 'Talent Flow Student';
    const statusPill = document.getElementById('spStatusPill');
    const st = detail.status || 'active';
    statusPill.className = `status-pill ${st}`;
    statusPill.textContent = st === 'at-risk' ? 'At Risk' : st.charAt(0).toUpperCase() + st.slice(1);

    document.getElementById('spEducationLevel').textContent = detail.educationLevel || 'Enrolled Student';
    document.getElementById('spBio').textContent = detail.bio || 'This student has not added a bio yet.';
    document.getElementById('spFieldOfStudy').textContent = detail.fieldOfStudy || '—';
    document.getElementById('spEmail').textContent = detail.email || 'Not shared';
    document.getElementById('spAvgGrade').textContent = detail.grade !== null && detail.grade !== undefined ? `${detail.grade}%` : '—';
    document.getElementById('spEnrolledSince').textContent = formatDateShort(detail.enrolledAt);

    // Topics & Interests
    const interestsSec = document.getElementById('spInterestsSection');
    const interestsEl = document.getElementById('spInterestsTags');
    const tags = (detail.interests || '').split(',').map((t) => t.trim()).filter(Boolean);
    interestsEl.innerHTML = '';
    if (tags.length) {
        tags.forEach((tag) => {
            const span = document.createElement('span');
            span.className = 'sp-tag';
            span.textContent = tag;
            interestsEl.appendChild(span);
        });
        interestsSec.hidden = false;
    } else {
        interestsSec.hidden = true;
    }

    // Learning Goals
    const goalsSec = document.getElementById('spGoalsSection');
    const goalsEl = document.getElementById('spGoalsText');
    if (detail.goals) {
        goalsEl.textContent = detail.goals;
        goalsSec.hidden = false;
    } else {
        goalsSec.hidden = true;
    }

    // Social Links (validated http/https only)
    const linksSec = document.getElementById('spLinksSection');
    const linksEl = document.getElementById('spSocialLinks');
    linksEl.innerHTML = '';
    const linkDefs = [
        { label: 'LinkedIn', url: sanitizeUrl(detail.linkedin) },
        { label: 'GitHub', url: sanitizeUrl(detail.github) },
        { label: 'Website', url: sanitizeUrl(detail.website) },
    ].filter((l) => l.url);

    if (linkDefs.length) {
        linkDefs.forEach(({ label, url }) => {
            const a = document.createElement('a');
            a.className = 'sp-link-btn';
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = label;
            linksEl.appendChild(a);
        });
        linksSec.hidden = false;
    } else {
        linksSec.hidden = true;
    }

    // Enrolled Courses
    const coursesListEl = document.getElementById('spCoursesList');
    if (!detail.enrollments || !detail.enrollments.length) {
        coursesListEl.innerHTML = '<p class="sp-empty-note">Not enrolled in any of your courses yet.</p>';
    } else {
        coursesListEl.innerHTML = detail.enrollments.map((c) => {
            const pct = Math.max(0, Math.min(100, Number(c.progress) || 0));
            return `
            <div class="sp-course-row">
                <div>
                    <div class="sp-course-title">${escapeHtml(c.title)}</div>
                    <div class="sp-course-sub">${c.completedLessons || 0} of ${c.lessons || 0} lessons · Enrolled ${formatDateShort(c.enrolledAt)}</div>
                </div>
                <div class="sp-progress-wrap">
                    <div class="sp-progress-bar"><div class="sp-progress-fill" style="width:${pct}%"></div></div>
                    <span class="sp-progress-pct">${pct}%</span>
                </div>
            </div>`;
        }).join('');
    }

    // Assignments & Grades
    const assignListEl = document.getElementById('spAssignmentsList');
    if (!detail.assignments || !detail.assignments.length) {
        assignListEl.innerHTML = '<p class="sp-empty-note">No assignments assigned in this student\'s courses yet.</p>';
    } else {
        assignListEl.innerHTML = detail.assignments.map((a) => {
            const sub = a.submission;
            let badgeText = 'Pending';
            let badgeCls = 'inactive';
            if (sub && sub.score !== null && sub.score !== undefined) {
                badgeText = `${sub.score} / ${a.maxScore}`;
                badgeCls = 'active';
            } else if (sub) {
                badgeText = 'Submitted';
                badgeCls = 'at-risk';
            }
            return `
            <div class="sp-assign-row">
                <div>
                    <div class="sp-course-title">${escapeHtml(a.title)}</div>
                    <div class="sp-course-sub">${escapeHtml(a.course)}${a.dueDate ? ` · Due ${formatDateShort(a.dueDate)}` : ''}</div>
                </div>
                <span class="status-pill ${badgeCls}">${escapeHtml(badgeText)}</span>
            </div>`;
        }).join('');
    }
}

(function wireStudentProfileModal() {
    const overlay = document.getElementById('studentProfileOverlay');
    document.getElementById('spCloseBtn')?.addEventListener('click', closeStudentProfile);
    document.getElementById('spFooterCloseBtn')?.addEventListener('click', closeStudentProfile);
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeStudentProfile();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay?.classList.contains('open')) closeStudentProfile();
    });
    document.getElementById('spScheduleMeetBtn')?.addEventListener('click', () => {
        if (!activeProfileStudent) return;
        const target = activeProfileStudent;
        closeStudentProfile();
        openScheduleModal({
            prefillStudentId: target.id,
            prefillEmail: target.email,
            prefillCourseTitle: target.enrollments?.[0]?.title || '',
            prefillTitle: `1:1 Class Session with ${target.fullName || 'Student'}`,
        });
    });
})();

/* ─── GOOGLE WORKSPACE (MEET & CALENDAR) ─── */
let googleApi = null;
let googleNeedsAuth = true;
let scheduledClasses = [];
let editingEventId = null;
let meetAttendeeEmails = [];
let selectedStudentIds = new Set();

function extractMeetUrl(event) {
    if (!event) return '';
    if (event.hangoutLink) {
        const clean = sanitizeUrl(event.hangoutLink);
        if (clean) return clean;
    }
    const entryPoints = event.conferenceData && event.conferenceData.entryPoints;
    if (Array.isArray(entryPoints)) {
        const video = entryPoints.find((ep) => ep.entryPointType === 'video' && ep.uri);
        if (video) return sanitizeUrl(video.uri);
    }
    return '';
}

function formatEventTimeRange(event) {
    const startRaw = event?.start?.dateTime || event?.start?.date;
    const endRaw = event?.end?.dateTime || event?.end?.date;
    if (!startRaw) return 'Time TBD';
    const start = new Date(startRaw);
    if (!event?.start?.dateTime) {
        return start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' (All day)';
    }
    const datePart = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = endRaw ? new Date(endRaw).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    return endTime ? `${datePart} · ${startTime} – ${endTime}` : `${datePart} · ${startTime}`;
}

function renderGoogleAuthState(user, hasToken) {
    googleNeedsAuth = !(user && hasToken);

    const authGate = document.getElementById('meetAuthGate');
    const classesWrap = document.getElementById('meetClassesWrap');
    const accountPill = document.getElementById('meetAccountPill');
    const accountEmail = document.getElementById('meetAccountEmail');
    const instantBtn = document.getElementById('instantMeetBtn');
    const refreshBtn = document.getElementById('refreshClassesBtn');
    const sectionSchedBtn = document.getElementById('sectionScheduleBtn');
    const modalAuthBanner = document.getElementById('scheduleAuthBanner');

    if (googleNeedsAuth) {
        if (authGate) authGate.hidden = false;
        if (classesWrap) classesWrap.hidden = true;
        if (accountPill) accountPill.hidden = true;
        if (instantBtn) instantBtn.hidden = true;
        if (refreshBtn) refreshBtn.hidden = true;
        if (sectionSchedBtn) sectionSchedBtn.hidden = true;
        if (modalAuthBanner) modalAuthBanner.hidden = false;
        scheduledClasses = [];
        renderScheduledClassesList();
    } else {
        if (authGate) authGate.hidden = true;
        if (classesWrap) classesWrap.hidden = false;
        if (accountPill) accountPill.hidden = false;
        if (accountEmail) accountEmail.textContent = user.email || user.displayName || 'Google Connected';
        if (instantBtn) instantBtn.hidden = false;
        if (refreshBtn) refreshBtn.hidden = false;
        if (sectionSchedBtn) sectionSchedBtn.hidden = false;
        if (modalAuthBanner) modalAuthBanner.hidden = true;
        refreshUpcomingClasses();
    }
}

async function handleGoogleConnectClick(btnEl) {
    if (!googleApi) {
        showToast('Google Workspace service is still loading. Please try again.', 'error');
        return;
    }
    if (btnEl) btnEl.disabled = true;
    try {
        await googleApi.googleSignIn();
        showToast('Google Calendar & Meet connected!', 'success');
    } catch (err) {
        console.error('Google Sign-In failed:', err);
        showToast(err?.message || 'Google Sign-In was canceled or failed.', 'error');
    } finally {
        if (btnEl) btnEl.disabled = false;
    }
}

async function refreshUpcomingClasses() {
    if (!googleApi || googleNeedsAuth) return;
    const loadingEl = document.getElementById('meetClassesLoading');
    const listEl = document.getElementById('meetClassesList');
    const emptyEl = document.getElementById('meetClassesEmpty');

    if (loadingEl) loadingEl.hidden = false;
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = true;

    try {
        const events = await googleApi.listUpcomingClasses({ maxResults: 18 });
        scheduledClasses = events || [];
        renderScheduledClassesList();
    } catch (err) {
        console.error('Failed to list Google Calendar events:', err);
        if (err.code === 'AUTH_EXPIRED' || err.code === 'AUTH_REQUIRED') {
            renderGoogleAuthState(null, false);
        }
        showToast(err?.message || 'Could not load scheduled classes.', 'error');
    } finally {
        if (loadingEl) loadingEl.hidden = true;
    }
}

function renderScheduledClassesList() {
    const listEl = document.getElementById('meetClassesList');
    const emptyEl = document.getElementById('meetClassesEmpty');
    if (!listEl || !emptyEl) return;

    if (!scheduledClasses.length) {
        listEl.innerHTML = '';
        emptyEl.hidden = googleNeedsAuth;
        return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = scheduledClasses.map((ev) => {
        const meetUrl = extractMeetUrl(ev);
        const safeEventId = escapeHtml(ev.id);
        const safeTitle = escapeHtml(ev.summary || 'Untitled Class');
        const safeTime = escapeHtml(formatEventTimeRange(ev));
        const safeDesc = escapeHtml(ev.description || '');
        const attendeeEmails = (ev.attendees || []).map((a) => a.email).filter(Boolean);
        const attendeeText = attendeeEmails.length
            ? `${attendeeEmails.length} student${attendeeEmails.length === 1 ? '' : 's'} invited (${escapeHtml(attendeeEmails.slice(0, 2).join(', '))}${attendeeEmails.length > 2 ? ` +${attendeeEmails.length - 2}` : ''})`
            : 'No attendees invited yet';

        return `
        <article class="meet-class-card" data-event-id="${safeEventId}">
            <div class="mcc-top">
                <div class="mcc-title">${safeTitle}</div>
                <span class="mcc-badge ${meetUrl ? '' : 'calendar-only'}">${meetUrl ? 'Google Meet' : 'Calendar'}</span>
            </div>
            <div class="mcc-time">${safeTime}</div>
            ${safeDesc ? `<p class="mcc-desc">${safeDesc}</p>` : ''}
            <div class="mcc-meta">${attendeeText}</div>
            <div class="mcc-actions">
                ${meetUrl ? `<a class="btn-sm-primary meet-join" href="${escapeHtml(meetUrl)}" target="_blank" rel="noopener noreferrer">Join Meet</a>` : ''}
                ${meetUrl ? `<button type="button" class="btn-sm-outline btn-copy-meet" data-meet-url="${escapeHtml(meetUrl)}">Copy Link</button>` : ''}
                <button type="button" class="btn-sm-outline btn-edit-class" data-event-id="${safeEventId}">Edit</button>
                <button type="button" class="btn-sm-outline danger btn-cancel-class" data-event-id="${safeEventId}">Cancel</button>
            </div>
        </article>`;
    }).join('');
}

document.getElementById('meetClassesList')?.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.btn-copy-meet');
    if (copyBtn) {
        const url = copyBtn.dataset.meetUrl;
        if (url) {
            navigator.clipboard.writeText(url).catch(() => {});
            showToast('Google Meet link copied to clipboard!', 'success');
        }
        return;
    }

    const editBtn = e.target.closest('.btn-edit-class');
    if (editBtn) {
        const ev = scheduledClasses.find((item) => item.id === editBtn.dataset.eventId);
        if (ev) openScheduleModal({ editEvent: ev });
        return;
    }

    const cancelBtn = e.target.closest('.btn-cancel-class');
    if (cancelBtn) {
        const ev = scheduledClasses.find((item) => item.id === cancelBtn.dataset.eventId);
        if (!ev || !googleApi) return;

        const attendeeCount = (ev.attendees || []).length;
        const confirmed = await askConfirmation({
            title: 'Cancel Scheduled Class',
            message: `Are you sure you want to delete "${ev.summary || 'Untitled Class'}" (${formatEventTimeRange(ev)}) from Google Calendar?${attendeeCount ? ` ${attendeeCount} invited attendee(s) will be notified of the cancellation.` : ''}`,
            confirmText: 'Delete Class',
            isDanger: true,
        });
        if (!confirmed) return;

        try {
            await googleApi.deleteMeetClass(ev.id, { hasAttendees: attendeeCount > 0 });
            showToast('Scheduled class canceled and removed from Google Calendar.', 'success');
            await refreshUpcomingClasses();
        } catch (err) {
            console.error('Failed to cancel class:', err);
            showToast(err?.message || 'Could not cancel class.', 'error');
        }
    }
});

function renderMeetAttendeeChips() {
    const chipInput = document.getElementById('meetChipInput');
    const typingInput = document.getElementById('meetEmailTypingInput');
    if (!chipInput || !typingInput) return;

    chipInput.querySelectorAll('.chip').forEach((c) => c.remove());
    meetAttendeeEmails.forEach((email) => {
        const safeEmail = escapeHtml(email);
        const div = document.createElement('div');
        div.className = 'chip';
        div.innerHTML = `${safeEmail}<button class="chip-x" type="button" aria-label="Remove ${safeEmail}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg></button>`;
        div.querySelector('.chip-x').addEventListener('click', () => {
            meetAttendeeEmails = meetAttendeeEmails.filter((e) => e !== email);
            renderMeetAttendeeChips();
            renderAttendeeStudentPills();
        });
        chipInput.insertBefore(div, typingInput);
    });
    chipInput.classList.toggle('empty', meetAttendeeEmails.length === 0);
}

function addMeetAttendeeEmail(raw) {
    const email = String(raw || '').trim().replace(/,+$/, '');
    if (!email) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    if (!meetAttendeeEmails.includes(email)) {
        meetAttendeeEmails.push(email);
        renderMeetAttendeeChips();
    }
    return true;
}

function renderAttendeeStudentPills() {
    const listEl = document.getElementById('attendeeStudentList');
    if (!listEl) return;

    const selectedCourseId = document.getElementById('classCourseSelect')?.value || '';
    const relevantStudents = selectedCourseId
        ? STUDENTS.filter((s) => s.courseIds.includes(selectedCourseId))
        : STUDENTS;

    if (!relevantStudents.length) {
        listEl.innerHTML = '<span class="sp-empty-note">No enrolled students found for this filter. You can add emails below.</span>';
        return;
    }

    listEl.innerHTML = '';
    relevantStudents.forEach((s) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        const isSelected = selectedStudentIds.has(s.id) || (s.email && meetAttendeeEmails.includes(s.email));
        pill.className = `attendee-pill${isSelected ? ' selected' : ''}${s.email ? '' : ' no-email'}`;
        pill.textContent = s.email ? `${s.name} (${s.email})` : `${s.name} (add email below)`;
        pill.addEventListener('click', () => {
            if (s.email) {
                if (meetAttendeeEmails.includes(s.email)) {
                    meetAttendeeEmails = meetAttendeeEmails.filter((e) => e !== s.email);
                    selectedStudentIds.delete(s.id);
                } else {
                    meetAttendeeEmails.push(s.email);
                    selectedStudentIds.add(s.id);
                }
                renderMeetAttendeeChips();
                renderAttendeeStudentPills();
            } else {
                showToast(`No email shared on ${s.name}'s profile — type their email below to invite them.`, 'info');
                document.getElementById('meetEmailTypingInput')?.focus();
            }
        });
        listEl.appendChild(pill);
    });
}

function openScheduleModal({ prefillStudentId = null, prefillEmail = '', prefillCourseTitle = '', prefillTitle = '', editEvent = null } = {}) {
    const overlay = document.getElementById('scheduleMeetOverlay');
    const modalTitle = document.getElementById('scheduleModalTitle');
    const submitText = document.getElementById('scheduleSubmitText');
    const courseSelect = document.getElementById('classCourseSelect');
    const titleInput = document.getElementById('classTitleInput');
    const dateInput = document.getElementById('classDateInput');
    const timeInput = document.getElementById('classTimeInput');
    const durationSelect = document.getElementById('classDurationSelect');
    const descInput = document.getElementById('classDescInput');
    const includeMeetRow = document.getElementById('includeMeetToggleRow');
    const includeMeetCheck = document.getElementById('includeMeetCheckbox');
    const tzNote = document.getElementById('scheduleTzNote');
    const typingInput = document.getElementById('meetEmailTypingInput');

    // Populate courses dropdown
    courseSelect.innerHTML = '<option value="">All / General Session</option>';
    COURSES.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.title;
        if (prefillCourseTitle && c.title === prefillCourseTitle) opt.selected = true;
        courseSelect.appendChild(opt);
    });

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
    if (tzNote) tzNote.textContent = `Timezone: ${tz}`;

    meetAttendeeEmails = [];
    selectedStudentIds = new Set();
    if (typingInput) typingInput.value = '';

    if (editEvent) {
        editingEventId = editEvent.id;
        modalTitle.textContent = 'Edit Scheduled Class';
        submitText.textContent = 'Save Changes';
        titleInput.value = editEvent.summary || '';
        descInput.value = editEvent.description || '';
        includeMeetRow.style.display = 'none';

        const startDate = new Date(editEvent.start?.dateTime || editEvent.start?.date || Date.now());
        const endDate = new Date(editEvent.end?.dateTime || editEvent.end?.date || startDate.getTime() + 3600000);
        const yyyy = startDate.getFullYear();
        const mm = String(startDate.getMonth() + 1).padStart(2, '0');
        const dd = String(startDate.getDate()).padStart(2, '0');
        const hh = String(startDate.getHours()).padStart(2, '0');
        const min = String(startDate.getMinutes()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        timeInput.value = `${hh}:${min}`;

        const diffMins = Math.max(30, Math.round((endDate - startDate) / 60000));
        const closest = ['30', '45', '60', '90', '120'].reduce((prev, curr) =>
            Math.abs(Number(curr) - diffMins) < Math.abs(Number(prev) - diffMins) ? curr : prev
        );
        durationSelect.value = closest;

        (editEvent.attendees || []).forEach((a) => {
            if (a.email) addMeetAttendeeEmail(a.email);
        });
    } else {
        editingEventId = null;
        modalTitle.textContent = 'Schedule Class with Google Meet';
        submitText.textContent = 'Schedule Google Meet Class';
        includeMeetRow.style.display = '';
        includeMeetCheck.checked = true;

        const defaultStart = new Date(Date.now() + 3600000);
        defaultStart.setMinutes(0, 0, 0);
        const yyyy = defaultStart.getFullYear();
        const mm = String(defaultStart.getMonth() + 1).padStart(2, '0');
        const dd = String(defaultStart.getDate()).padStart(2, '0');
        const hh = String(defaultStart.getHours()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        timeInput.value = `${hh}:00`;
        durationSelect.value = '60';
        descInput.value = '';
        titleInput.value = prefillTitle || (prefillCourseTitle ? `${prefillCourseTitle} — Live Class` : '');

        if (prefillStudentId) {
            selectedStudentIds.add(prefillStudentId);
            const st = STUDENTS.find((s) => s.id === prefillStudentId);
            const email = prefillEmail || st?.email || '';
            if (email) addMeetAttendeeEmail(email);
        }
    }

    const modalAuthBanner = document.getElementById('scheduleAuthBanner');
    if (modalAuthBanner) modalAuthBanner.hidden = !googleNeedsAuth;

    renderMeetAttendeeChips();
    renderAttendeeStudentPills();

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => titleInput.focus(), 100);
}

function closeScheduleModal() {
    const overlay = document.getElementById('scheduleMeetOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    editingEventId = null;
}

(function wireScheduleModal() {
    const overlay = document.getElementById('scheduleMeetOverlay');
    const typingInput = document.getElementById('meetEmailTypingInput');
    const chipInput = document.getElementById('meetChipInput');
    const submitBtn = document.getElementById('scheduleSubmitBtn');

    document.getElementById('openScheduleClassBtn')?.addEventListener('click', () => openScheduleModal());
    document.getElementById('sectionScheduleBtn')?.addEventListener('click', () => openScheduleModal());
    document.getElementById('emptyScheduleClassBtn')?.addEventListener('click', () => openScheduleModal());
    document.getElementById('scheduleModalClose')?.addEventListener('click', closeScheduleModal);
    document.getElementById('scheduleCancelBtn')?.addEventListener('click', closeScheduleModal);
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeScheduleModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay?.classList.contains('open')) closeScheduleModal();
    });

    document.getElementById('classCourseSelect')?.addEventListener('change', (e) => {
        const courseId = e.target.value;
        const courseObj = COURSES.find((c) => c.id === courseId);
        const titleInput = document.getElementById('classTitleInput');
        if (courseObj && titleInput && !titleInput.value.trim()) {
            titleInput.value = `${courseObj.title} — Live Class`;
        }
        renderAttendeeStudentPills();
    });

    typingInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const raw = typingInput.value;
            raw.split(/[\s,;]+/).forEach(addMeetAttendeeEmail);
            typingInput.value = '';
            renderAttendeeStudentPills();
        } else if (e.key === 'Backspace' && !typingInput.value && meetAttendeeEmails.length) {
            meetAttendeeEmails.pop();
            renderMeetAttendeeChips();
            renderAttendeeStudentPills();
        }
    });
    chipInput?.addEventListener('click', () => typingInput?.focus());

    document.getElementById('googleConnectSectionBtn')?.addEventListener('click', (e) => {
        handleGoogleConnectClick(e.currentTarget);
    });
    document.getElementById('googleConnectModalBtn')?.addEventListener('click', (e) => {
        handleGoogleConnectClick(e.currentTarget);
    });
    document.getElementById('meetDisconnectBtn')?.addEventListener('click', async () => {
        if (!googleApi) return;
        await googleApi.logout();
        showToast('Signed out of Google account.', 'info');
    });
    document.getElementById('refreshClassesBtn')?.addEventListener('click', refreshUpcomingClasses);

    document.getElementById('instantMeetBtn')?.addEventListener('click', async (e) => {
        if (!googleApi || googleNeedsAuth) return;
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const space = await googleApi.createInstantMeetSpace();
            const meetUrl = sanitizeUrl(space && space.meetingUri);
            if (!meetUrl) throw new Error('Google Meet link was not returned.');
            const banner = document.getElementById('instantMeetBanner');
            const urlEl = document.getElementById('instantMeetUrl');
            const joinEl = document.getElementById('joinInstantMeetLink');
            urlEl.textContent = meetUrl;
            joinEl.href = meetUrl;
            banner.hidden = false;
            showToast('Instant Google Meet link created!', 'success');
        } catch (err) {
            console.error('Instant Meet error:', err);
            showToast(err?.message || 'Could not create instant Meet space.', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('copyInstantMeetBtn')?.addEventListener('click', () => {
        const url = document.getElementById('instantMeetUrl')?.textContent || '';
        if (!url) return;
        navigator.clipboard.writeText(url).catch(() => {});
        showToast('Instant Meet link copied!', 'success');
    });

    submitBtn?.addEventListener('click', async () => {
        if (!googleApi || googleNeedsAuth) {
            showToast('Please sign in with Google first to schedule classes.', 'error');
            return;
        }

        if (typingInput && typingInput.value.trim()) {
            typingInput.value.split(/[\s,;]+/).forEach(addMeetAttendeeEmail);
            typingInput.value = '';
        }

        const title = document.getElementById('classTitleInput').value.trim();
        const dateVal = document.getElementById('classDateInput').value;
        const timeVal = document.getElementById('classTimeInput').value;
        const durationMin = Number(document.getElementById('classDurationSelect').value) || 60;
        const desc = document.getElementById('classDescInput').value.trim();
        const courseSelect = document.getElementById('classCourseSelect');
        const courseTitle = courseSelect.value
            ? (COURSES.find((c) => c.id === courseSelect.value)?.title || '')
            : '';
        const includeMeet = document.getElementById('includeMeetCheckbox').checked;

        if (!title || !dateVal || !timeVal) {
            showToast('Please enter a class title, date, and start time.', 'error');
            return;
        }

        const startDate = new Date(`${dateVal}T${timeVal}`);
        if (Number.isNaN(startDate.getTime())) {
            showToast('Please enter a valid date and start time.', 'error');
            return;
        }
        const endDate = new Date(startDate.getTime() + durationMin * 60000);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        if (editingEventId) {
            const confirmed = await askConfirmation({
                title: 'Update Scheduled Class',
                message: `Save changes to "${title}" on Google Calendar for ${startDate.toLocaleString()}?${meetAttendeeEmails.length ? ` ${meetAttendeeEmails.length} invited attendee(s) will receive updated calendar notifications.` : ''}`,
                confirmText: 'Save Changes',
                isDanger: false,
            });
            if (!confirmed) return;
        }

        submitBtn.disabled = true;
        try {
            if (editingEventId) {
                await googleApi.updateMeetClass(editingEventId, {
                    title,
                    description: desc,
                    startIso: startDate.toISOString(),
                    endIso: endDate.toISOString(),
                    timeZone: tz,
                    attendees: meetAttendeeEmails,
                    courseTitle,
                });
                showToast('Class schedule updated on Google Calendar!', 'success');
            } else {
                const created = await googleApi.createMeetClass({
                    title,
                    description: desc,
                    startIso: startDate.toISOString(),
                    endIso: endDate.toISOString(),
                    timeZone: tz,
                    attendees: meetAttendeeEmails,
                    includeMeet,
                    courseTitle,
                });
                const createdMeetUrl = extractMeetUrl(created);
                showToast(
                    createdMeetUrl
                        ? 'Class scheduled with Google Meet link!'
                        : 'Class scheduled on Google Calendar!',
                    'success'
                );
            }
            closeScheduleModal();
            await refreshUpcomingClasses();
        } catch (err) {
            console.error('Schedule class failed:', err);
            if (err.code === 'AUTH_EXPIRED' || err.code === 'AUTH_REQUIRED') {
                renderGoogleAuthState(null, false);
            }
            showToast(err?.message || 'Could not schedule class.', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });
})();

async function initGoogleWorkspaceSection() {
    googleApi = await waitForTalentFlowGoogle();
    if (!googleApi) return;
    try {
        await googleApi.initAuth(
            (user, token) => renderGoogleAuthState(user, Boolean(token)),
            (user) => renderGoogleAuthState(user, false)
        );
    } catch (err) {
        console.error('Could not initialize Google Workspace integration:', err);
    }
}

/* ─── INIT ────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    const auth = await waitForTalentFlowAuth();
    if (!auth) {
        emptyState.classList.add('visible');
        emptyState.querySelector('p').textContent = "Couldn't connect — please refresh the page.";
        return;
    }

    let user;
    try {
        user = await auth.requireAuth(); // redirects to login.html if signed out
    } catch (err) {
        console.error('Auth check failed:', err);
        return;
    }
    if (!user) return;
    currentInstructorId = user.uid;

    initGoogleWorkspaceSection();

    try {
        const [courses, students] = await Promise.all([
            TalentFlowData.getCourses(currentInstructorId),
            TalentFlowData.getStudentsForInstructor(currentInstructorId),
        ]);
        COURSES = courses.map(c => ({ id: c.id, title: c.title }));
        STUDENTS = students;
    } catch (err) {
        console.error('Loading students failed:', err);
    }

    renderStatCards();
    populateCourseFilter();
    render();
});
