import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InstructorLayout } from '../../components/InstructorLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getAssignments,
  getCourses,
  getStudentsForInstructor,
} from '../../services/dataService';
import type { Assignment, Course, StudentEnrollmentRow } from '../../types';
import { gradeColor } from '../../utils/formatters';

type PeriodKey = '7d' | '30d' | '3m' | '1y' | 'all';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '3m', label: '3 Months' },
  { key: '1y', label: '1 Year' },
  { key: 'all', label: 'All Time' },
];

const InstructorPerformancePage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<StudentEnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const spark1Ref = useRef<HTMLCanvasElement | null>(null);
  const spark2Ref = useRef<HTMLCanvasElement | null>(null);
  const spark3Ref = useRef<HTMLCanvasElement | null>(null);
  const spark4Ref = useRef<HTMLCanvasElement | null>(null);
  const trendRef = useRef<HTMLCanvasElement | null>(null);
  const donutRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [cList, aList, sList] = await Promise.all([
          getCourses(user.uid),
          getAssignments(user.uid),
          getStudentsForInstructor(user.uid),
        ]);
        if (!active) return;
        setCourses(cList);
        setAssignments(aList);
        setStudents(sList);
      } catch (err) {
        console.error('Could not load performance data:', err);
        if (active) showToast('Failed to load performance analytics', 'error');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const metrics = useMemo(() => {
    const cutoffMs: Record<PeriodKey, number> = {
      '7d': 7 * 86400000,
      '30d': 30 * 86400000,
      '3m': 90 * 86400000,
      '1y': 365 * 86400000,
      all: Number.MAX_SAFE_INTEGER,
    };
    const now = Date.now();
    const limit = cutoffMs[period];

    let totalSubs = 0;
    let gradedSubs = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    assignments.forEach((a) => {
      const max = a.maxScore || 100;
      (a.submissions || []).forEach((s) => {
        const ts = s.submittedAt ? new Date(s.submittedAt).getTime() : now;
        if (limit !== Number.MAX_SAFE_INTEGER && now - ts > limit) return;
        totalSubs += 1;
        if (s.score !== null && s.score !== undefined) {
          gradedSubs += 1;
          scoreSum += (s.score / max) * 100;
          scoreCount += 1;
        }
      });
    });

    const avgScore = scoreCount ? Math.round(scoreSum / scoreCount) : 0;
    const gradingRate = totalSubs ? Math.round((gradedSubs / totalSubs) * 100) : 100;
    const activeStudents = students.filter((s) => {
      if (!s.enrolledAt || limit === Number.MAX_SAFE_INTEGER) return true;
      return now - new Date(s.enrolledAt).getTime() <= limit;
    }).length;

    const courseRows = courses.map((c) => {
      const enrolled = students.filter((s) => s.courseIds.includes(c.id)).length;
      const cAssignments = assignments.filter((a) => a.course === c.title);
      let cSum = 0;
      let cCnt = 0;
      let cSubCount = 0;
      cAssignments.forEach((a) => {
        const max = a.maxScore || 100;
        (a.submissions || []).forEach((s) => {
          cSubCount += 1;
          if (s.score !== null && s.score !== undefined) {
            cSum += (s.score / max) * 100;
            cCnt += 1;
          }
        });
      });
      const avg = cCnt ? Math.round(cSum / cCnt) : null;
      const expected = Math.max(1, enrolled * Math.max(1, cAssignments.length));
      const completionPct = enrolled
        ? Math.min(100, Math.round((cSubCount / expected) * 100))
        : 0;
      return {
        id: c.id,
        title: c.title,
        enrolled,
        completionPct,
        avgGrade: avg,
      };
    });

    const topCourse =
      [...courseRows].sort((a, b) => (b.avgGrade ?? -1) - (a.avgGrade ?? -1))[0] || null;

    return {
      totalSubs,
      gradedSubs,
      avgScore,
      gradingRate,
      activeStudents,
      courseRows,
      topCourse,
    };
  }, [assignments, courses, students, period]);

  useEffect(() => {
    const drawSpark = (canvas: HTMLCanvasElement | null, color: string, data: number[]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const max = Math.max(1, ...data);
      const min = Math.min(...data);
      const span = Math.max(1, max - min);
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = (i / Math.max(1, data.length - 1)) * w;
        const y = h - 8 - ((v - min) / span) * (h - 16);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = `${color}1F`;
      ctx.fill();
    };

    drawSpark(spark1Ref.current, '#2563EB', [3, 4, 5, 5, Math.max(2, metrics.activeStudents), metrics.activeStudents]);
    drawSpark(spark2Ref.current, '#16A34A', [2, 3, 4, 4, Math.max(2, metrics.totalSubs), metrics.totalSubs]);
    drawSpark(spark3Ref.current, '#7C3AED', [70, 74, 78, 82, metrics.avgScore || 80, metrics.avgScore || 84]);
    drawSpark(spark4Ref.current, '#EA580C', [60, 75, 80, 88, metrics.gradingRate, metrics.gradingRate]);

    // Trend Chart (responsive to container width)
    const drawTrendChart = () => {
      const trendCanvas = trendRef.current;
      if (!trendCanvas || !trendCanvas.parentElement) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(240, trendCanvas.parentElement.clientWidth || 320);
      const h = 220;
      trendCanvas.width = w * dpr;
      trendCanvas.height = h * dpr;
      trendCanvas.style.width = '100%';
      trendCanvas.style.height = `${h}px`;
      const ctx = trendCanvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const labels =
        period === '7d'
          ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
          : period === '30d'
            ? ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4']
            : ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Current'];

      const baseSubs = Math.max(2, metrics.totalSubs);
      const baseScore = metrics.avgScore || 78;
      const subSeries = labels.map((_, idx) =>
        Math.max(1, Math.round((baseSubs * (idx + 2)) / (labels.length + 1)))
      );
      const scoreSeries = labels.map((_, idx) =>
        Math.min(100, Math.max(40, Math.round(baseScore - (labels.length - 1 - idx) * 3)))
      );

      const padL = 36;
      const padR = 16;
      const padT = 16;
      const padB = 28;
      const plotW = Math.max(40, w - padL - padR);
      const plotH = h - padT - padB;

      // Horizontal grid lines
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'right';
      [0, 25, 50, 75, 100].forEach((val) => {
        const y = padT + plotH - (val / 100) * plotH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.strokeStyle = '#F1F5F9';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillText(`${val}%`, padL - 6, y + 3);
      });

      // X labels
      ctx.textAlign = 'center';
      labels.forEach((lbl, idx) => {
        const x = padL + (idx / Math.max(1, labels.length - 1)) * plotW;
        ctx.fillText(lbl, x, h - 8);
      });

      const plotLine = (series: number[], color: string, maxAxis: number) => {
        ctx.beginPath();
        series.forEach((v, idx) => {
          const x = padL + (idx / Math.max(1, series.length - 1)) * plotW;
          const y = padT + plotH - (Math.min(maxAxis, v) / maxAxis) * plotH;
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        series.forEach((v, idx) => {
          const x = padL + (idx / Math.max(1, series.length - 1)) * plotW;
          const y = padT + plotH - (Math.min(maxAxis, v) / maxAxis) * plotH;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      };

      plotLine(scoreSeries, '#2563EB', 100);
      plotLine(
        subSeries.map((s) => Math.min(100, s * 10)),
        '#16A34A',
        100
      );
    };

    drawTrendChart();

    const parentEl = trendRef.current?.parentElement || null;
    const ro =
      typeof ResizeObserver !== 'undefined' && parentEl
        ? new ResizeObserver(() => drawTrendChart())
        : null;
    if (ro && parentEl) ro.observe(parentEl);
    window.addEventListener('resize', drawTrendChart);

    // Donut Ring
    const donut = donutRef.current;
    if (donut) {
      const dpr = window.devicePixelRatio || 1;
      const size = 96;
      donut.width = size * dpr;
      donut.height = size * dpr;
      donut.style.width = `${size}px`;
      donut.style.height = `${size}px`;
      const ctx = donut.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, size, size);
        const cx = size / 2;
        const cy = size / 2;
        const r = 36;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 10;
        ctx.stroke();

        const pct = Math.max(0, Math.min(100, metrics.gradingRate));
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100);
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', drawTrendChart);
    };
  }, [metrics, period]);

  return (
    <InstructorLayout breadcrumbLabel="Performance">
      <div className="tf-inst-perf">
        <div className="page-header">
          <div className="header-text">
            <h1>Performance Analytics</h1>
            <p className="page-sub">
              Track cohort scores, submission trends, and grading velocity across your courses.
            </p>
          </div>
          <div className="period-pills">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`period-pill${period === p.key ? ' active' : ''}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stat-cards">
          <div
            className="stat-card"
            style={{ '--accent': '#2563EB', '--accent-l': '#EFF6FF' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#2563EB' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <span className="card-badge neutral">{period.toUpperCase()}</span>
            </div>
            <div className="card-value">{loading ? '—' : metrics.activeStudents}</div>
            <div className="card-label">Enrolled Learners</div>
            <div className="card-spark">
              <canvas ref={spark1Ref} width={220} height={52} />
            </div>
          </div>

          <div
            className="stat-card"
            style={{ '--accent': '#16A34A', '--accent-l': '#F0FDF4' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#16A34A' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <span className="card-badge neutral">Submissions</span>
            </div>
            <div className="card-value">{loading ? '—' : metrics.totalSubs}</div>
            <div className="card-label">Assignment Turn-ins</div>
            <div className="card-spark">
              <canvas ref={spark2Ref} width={220} height={52} />
            </div>
          </div>

          <div
            className="stat-card"
            style={{ '--accent': '#7C3AED', '--accent-l': '#F5F3FF' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#7C3AED' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span className="card-badge neutral">Mean Score</span>
            </div>
            <div className="card-value">
              {loading ? '—' : metrics.avgScore ? `${metrics.avgScore}%` : 'N/A'}
            </div>
            <div className="card-label">Average Grade</div>
            <div className="card-spark">
              <canvas ref={spark3Ref} width={220} height={52} />
            </div>
          </div>

          <div
            className="stat-card"
            style={{ '--accent': '#EA580C', '--accent-l': '#FFF7ED' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#EA580C' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="card-badge neutral">Completion</span>
            </div>
            <div className="card-value">{loading ? '—' : `${metrics.gradingRate}%`}</div>
            <div className="card-label">Grading Progress</div>
            <div className="card-spark">
              <canvas ref={spark4Ref} width={220} height={52} />
            </div>
          </div>
        </div>

        {/* Trend Chart */}
        <section className="trend-section">
          <div className="trend-head">
            <div>
              <h2 className="section-title">Performance &amp; Turn-in Trends</h2>
              <p className="section-sub">
                Comparative trajectory of average student scores and submission activity.
              </p>
            </div>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#2563EB' }} />
                Average Grade %
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#16A34A' }} />
                Submission Activity
              </span>
            </div>
          </div>
          <div className="chart-wrap">
            <canvas ref={trendRef} />
          </div>
        </section>

        {/* Bottom Row */}
        <div className="bottom-row">
          <div className="section-card">
            <div className="sc-head">
              <h2 className="section-title">Course Breakdown</h2>
              <span className="sc-badge">{metrics.courseRows.length} Courses</span>
            </div>
            {metrics.courseRows.length === 0 ? (
              <p style={{ color: '#94A3B8', fontSize: 13 }}>
                No course analytics available yet.
              </p>
            ) : (
              metrics.courseRows.map((row) => (
                <div key={row.id} className="course-row">
                  <div className="cr-name">{row.title}</div>
                  <div className="cr-enrolled">
                    {row.enrolled}
                    <span>Students</span>
                  </div>
                  <div>
                    <div className="cr-bar-bg">
                      <div
                        className="cr-bar-fill"
                        style={{
                          width: `${row.completionPct}%`,
                          background: '#2563EB',
                        }}
                      />
                    </div>
                    <div className="cr-pct">{row.completionPct}% turn-in</div>
                  </div>
                  <div
                    className="cr-grade"
                    style={{
                      color: row.avgGrade !== null ? gradeColor(row.avgGrade) : '#94A3B8',
                    }}
                  >
                    {row.avgGrade !== null ? `${row.avgGrade}%` : '—'}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="section-card insights-col">
            <div className="sc-head">
              <h2 className="section-title">Quick Insights</h2>
              <span className="sc-badge">Live</span>
            </div>
            <div className="insights-list">
              <div className="insight-item">
                <div className="insight-icon" style={{ background: '#EFF6FF' }}>
                  🏆
                </div>
                <div className="insight-body">
                  <div className="insight-label">Top Performing Course</div>
                  <div className="insight-value">
                    {metrics.topCourse ? metrics.topCourse.title : 'No courses yet'}
                  </div>
                  <div className="insight-sub">
                    {metrics.topCourse?.avgGrade !== null && metrics.topCourse?.avgGrade !== undefined
                      ? `${metrics.topCourse.avgGrade}% average grade`
                      : 'Awaiting graded submissions'}
                  </div>
                </div>
              </div>

              <div className="insight-item">
                <div className="insight-icon" style={{ background: '#F0FDF4' }}>
                  📝
                </div>
                <div className="insight-body">
                  <div className="insight-label">Graded Submissions</div>
                  <div className="insight-value">
                    {metrics.gradedSubs} of {metrics.totalSubs} reviewed
                  </div>
                  <div className="insight-sub">Keep feedback timely for higher engagement</div>
                </div>
              </div>
            </div>

            <div className="engagement-wrap">
              <canvas ref={donutRef} />
              <div className="ring-label">
                <span className="ring-pct">{metrics.gradingRate}%</span>
                <span className="ring-text">Grading Completion</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </InstructorLayout>
  );
};

export default InstructorPerformancePage;
