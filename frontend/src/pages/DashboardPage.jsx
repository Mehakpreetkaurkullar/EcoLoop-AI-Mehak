import { useState, useEffect } from 'react';
import { getSessionId } from '../services/api';

const ACTION_CONFIG = {
  resell: { color: '#3b82f6', badge: 'bg-blue-100 text-blue-800', icon: '🏷️', label: 'Resell' },
  refurbish: { color: '#f59e0b', badge: 'bg-amber-100 text-amber-800', icon: '🔧', label: 'Refurbish' },
  donate: { color: '#a855f7', badge: 'bg-purple-100 text-purple-800', icon: '🎁', label: 'Donate' },
  recycle: { color: '#22c55e', badge: 'bg-emerald-100 text-emerald-800', icon: '♻️', label: 'Recycle' },
};

const GRADE_CONFIG = {
  A: { badge: 'bg-green-100 text-green-800', label: 'Like New' },
  B: { badge: 'bg-blue-100 text-blue-800', label: 'Good' },
  C: { badge: 'bg-orange-100 text-orange-800', label: 'Fair' },
  D: { badge: 'bg-red-100 text-red-800', label: 'Poor' },
};

// CO₂ base rates per action (mirrors SustainabilityAgent constants)
const CO2_PER_ACTION = { resell: 2.5, refurbish: 1.8, donate: 1.5, recycle: 0.8 };

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchDashboard(); }, []);

  async function fetchDashboard() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/dashboard', { headers: { 'x-session-id': getSessionId() } });
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={fetchDashboard} />;
  if (!data) return null;

  // =========================================================================
  // DATA CALCULATIONS — all derived from the same backend response
  // =========================================================================

  // Action Distribution: from UserMetrics.action_counts (all-time aggregated)
  const actionDist = data.action_distribution || {};
  const totalActions = Object.values(actionDist).reduce((a, b) => a + b, 0);

  // Circularity Rate: (resell + refurbish) / total_actions
  // Source: UserMetrics.action_counts — same dataset as total_assessments
  const circRate = totalActions > 0
    ? Math.round(((actionDist.resell || 0) + (actionDist.refurbish || 0)) / totalActions * 100)
    : 0;

  // Category Breakdown: derived from recent_assessments (max 10 items)
  // NOTE: This represents a SAMPLE of the most recent assessments, not the full history.
  // The backend does not provide all-time category aggregation in UserMetrics.
  const categoryDist = {};
  const recentAssessments = data.recent_assessments || [];
  recentAssessments.forEach((a) => {
    if (a.product_category) categoryDist[a.product_category] = (categoryDist[a.product_category] || 0) + 1;
  });
  const totalCatSample = Object.values(categoryDist).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Executive Summary — Source: UserMetrics table (all-time totals) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ExecCard icon="🌱" value={data.total_green_credits} label="GREEN CREDITS" sub="Total earned (all time)" color="border-l-green-500" />
        <ExecCard icon="📦" value={data.total_assessments} label="PRODUCTS ASSESSED" sub="Total scanned (all time)" color="border-l-blue-500" />
        <ExecCard icon="🌍" value={`${data.total_co2_saved_kg.toFixed(1)} kg`} label="CO₂ PREVENTED" sub="Carbon saved (all time)" color="border-l-emerald-500" />
        <ExecCard icon="🔄" value={`${circRate}%`} label="CIRCULARITY RATE" sub="Resell + Refurbish" color="border-l-orange-500" />
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Action Distribution — Source: UserMetrics.action_counts */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">Action Distribution</h3>
          {totalActions > 0 ? (
            <>
              <div className="flex items-center gap-6">
                <div className="relative w-28 h-28 flex-shrink-0">
                  <DonutChart distribution={actionDist} total={totalActions} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">{totalActions}</span>
                    <span className="text-[10px] text-gray-400">Total</span>
                  </div>
                </div>
                <div className="space-y-2.5 flex-1">
                  {Object.entries(actionDist).sort(([,a],[,b]) => b - a).map(([action, count]) => {
                    const cfg = ACTION_CONFIG[action] || ACTION_CONFIG.recycle;
                    return (
                      <div key={action} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                        <span className="text-xs text-gray-600 flex-1">{cfg.label}</span>
                        <span className="text-xs font-bold text-gray-800">{count}</span>
                        <span className="text-[10px] text-gray-400">({Math.round(count/totalActions*100)}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-green-600 mt-4 font-medium">🌱 Most recommended: {getTopAction(actionDist)}</p>
            </>
          ) : <EmptyMini />}
        </div>

        {/* CO₂ Trend — Source: recent_assessments timestamps + action CO2 rates */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">CO₂ Saved Over Time</h3>
            <span className="text-[10px] text-gray-400">Last {recentAssessments.length} assessments</span>
          </div>
          {recentAssessments.length >= 2 ? (
            <CO2LineChart assessments={recentAssessments} />
          ) : recentAssessments.length === 1 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <span className="text-3xl mb-2">🌍</span>
              <p className="text-sm font-bold text-green-700">{(CO2_PER_ACTION[recentAssessments[0].action_recommendation] || 0.8).toFixed(1)} kg saved</p>
              <p className="text-[10px] text-gray-400 mt-1">Complete more assessments to see trends</p>
            </div>
          ) : <EmptyMini />}
        </div>

        {/* Recent Assessments — Source: Assessments table (10 most recent) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recent Assessments</h3>
            <span className="text-[10px] text-gray-400">Last {recentAssessments.length} of {data.total_assessments}</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {recentAssessments.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {recentAssessments.map((item) => {
                  const aCfg = ACTION_CONFIG[item.action_recommendation] || ACTION_CONFIG.recycle;
                  const gCfg = GRADE_CONFIG[item.condition_grade] || GRADE_CONFIG.C;
                  return (
                    <div key={item.assessment_id} className="px-5 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">📦</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.product_category}</p>
                        <p className="text-[10px] text-gray-400">{item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gCfg.badge}`}>{item.condition_grade}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${aCfg.badge}`}>{aCfg.icon} {aCfg.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyMini />}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Breakdown — Source: recent_assessments (sample) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Category Breakdown</h3>
            <span className="text-[10px] text-gray-400">From {totalCatSample} recent</span>
          </div>
          {totalCatSample > 0 ? (
            <div className="space-y-3">
              {Object.entries(categoryDist).sort(([,a],[,b]) => b - a).map(([cat, count]) => {
                const pct = (count / totalCatSample) * 100;
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-medium text-gray-600 truncate">{cat}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div className="h-full rounded-full bg-[#0f1b2d] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-12 text-right">{count} ({Math.round(pct)}%)</span>
                  </div>
                );
              })}
            </div>
          ) : <EmptyMini />}
        </div>

        {/* Sustainability Metrics — Source: computed from action_distribution + known rates */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">Sustainability Metrics</h3>
          {data.total_assessments > 0 ? (
            <div className="space-y-4">
              <MetricRow label="Avg Credits per Product" value={(data.total_green_credits / data.total_assessments).toFixed(1)} unit="credits" />
              <MetricRow label="Avg CO₂ per Product" value={(data.total_co2_saved_kg / data.total_assessments).toFixed(1)} unit="kg" />
              <MetricRow label="Products Diverted from Waste" value={totalActions - (actionDist.recycle || 0)} unit="items" />
              <MetricRow label="Diversion Rate" value={totalActions > 0 ? `${Math.round((totalActions - (actionDist.recycle || 0)) / totalActions * 100)}` : '0'} unit="%" />
            </div>
          ) : <EmptyMini />}
        </div>

        {/* AI Insights — Source: derived from action_distribution + aggregates */}
        <div className="bg-gradient-to-br from-[#0f1b2d] to-[#1a2d47] rounded-2xl p-6 shadow-lg text-white">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">🤖 AI Insights</h3>
          <div className="space-y-4">
            <InsightRow label="Most Recommended" value={getTopAction(actionDist)} />
            <InsightRow label="Avg Credits/Product" value={data.total_assessments > 0 ? (data.total_green_credits / data.total_assessments).toFixed(1) : '0'} />
            <InsightRow label="Avg CO₂ Saved" value={data.total_assessments > 0 ? `${(data.total_co2_saved_kg / data.total_assessments).toFixed(1)} kg` : '0 kg'} />
            <InsightRow label="Top Category" value={Object.entries(categoryDist).sort(([,a],[,b]) => b - a)[0]?.[0] || 'N/A (from recent)'} />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {data.total_assessments === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-5xl mb-4 block">📦</span>
          <p className="text-lg font-bold text-gray-700">No assessments yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">Upload a product to start tracking your sustainability impact.</p>
          <a href="/" className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-[#0f1b2d] font-bold px-6 py-3 rounded-xl transition-all shadow-md">
            🚀 Start First Assessment
          </a>
        </div>
      )}
    </div>
  );
}

/* =============== Components =============== */

function ExecCard({ icon, value, label, sub, color }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-5 shadow-sm border-l-4 ${color} hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-xs text-gray-400">{sub}</p>
        </div>
        <span className="text-2xl opacity-80">{icon}</span>
      </div>
    </div>
  );
}

function DonutChart({ distribution, total }) {
  const entries = Object.entries(distribution).sort(([,a],[,b]) => b - a);
  let cumulativeAngle = 0;
  const segments = entries.map(([action, count]) => {
    const angle = (count / total) * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const cfg = ACTION_CONFIG[action] || ACTION_CONFIG.recycle;
    return { startAngle, angle, color: cfg.color };
  });

  let gradient = '';
  segments.forEach((seg, i) => {
    const start = seg.startAngle;
    const end = start + seg.angle;
    gradient += `${seg.color} ${start}deg ${end}deg`;
    if (i < segments.length - 1) gradient += ', ';
  });

  return (
    <div className="w-full h-full rounded-full" style={{
      background: `conic-gradient(${gradient})`,
      mask: 'radial-gradient(circle at center, transparent 55%, black 56%)',
      WebkitMask: 'radial-gradient(circle at center, transparent 55%, black 56%)',
    }} />
  );
}

function MetricRow({ label, value, unit }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-bold text-gray-800">{value} <span className="text-xs font-normal text-gray-400">{unit}</span></span>
    </div>
  );
}

function InsightRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-bold text-[#f59e0b]">{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_,i) => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}</div>
      <div className="grid grid-cols-3 gap-6">{[...Array(3)].map((_,i) => <div key={i} className="h-64 bg-gray-200 rounded-2xl" />)}</div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
      <p className="text-red-700 font-medium">{message}</p>
      <button onClick={onRetry} className="mt-3 text-sm text-[#f59e0b] font-bold underline">Try again</button>
    </div>
  );
}

function EmptyMini() {
  return <p className="text-xs text-gray-300 text-center py-8">No data yet</p>;
}

/**
 * CO2LineChart — SVG line chart showing cumulative CO₂ saved over recent assessments.
 *
 * Data source: recent_assessments[].action_recommendation + created_at
 * Calculation: cumulative sum of CO2_PER_ACTION[action] for each assessment, ordered by time
 * No random values. No fabrication. Every point is a real assessment.
 */
function CO2LineChart({ assessments }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  // Sort by created_at ascending (oldest first for cumulative)
  const sorted = [...assessments]
    .filter((a) => a.created_at && a.action_recommendation)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (sorted.length < 2) return <EmptyMini />;

  // Build cumulative CO₂ data points
  let cumulative = 0;
  const points = sorted.map((a) => {
    const co2 = CO2_PER_ACTION[a.action_recommendation] || 0.8;
    cumulative += co2;
    return {
      date: new Date(a.created_at),
      co2: cumulative,
      action: a.action_recommendation,
      category: a.product_category,
      added: co2,
    };
  });

  // Chart dimensions
  const W = 320;
  const H = 160;
  const PAD = { top: 20, right: 15, bottom: 30, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Scales
  const maxCO2 = Math.max(...points.map((p) => p.co2));
  const minTime = points[0].date.getTime();
  const maxTime = points[points.length - 1].date.getTime();
  const timeRange = maxTime - minTime || 1;

  const xScale = (date) => PAD.left + ((date.getTime() - minTime) / timeRange) * plotW;
  const yScale = (val) => PAD.top + plotH - (val / (maxCO2 * 1.1)) * plotH;

  // Build SVG path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.date).toFixed(1)} ${yScale(p.co2).toFixed(1)}`).join(' ');

  // Area fill path
  const areaD = pathD + ` L ${xScale(points[points.length - 1].date).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L ${xScale(points[0].date).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`;

  // Y-axis labels
  const yTicks = [0, Math.round(maxCO2 * 0.5 * 10) / 10, Math.round(maxCO2 * 10) / 10];

  // X-axis labels (first and last date)
  const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yScale(tick)} y2={yScale(tick)} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PAD.left - 5} y={yScale(tick)} textAnchor="end" dominantBaseline="middle" className="text-[9px]" fill="#9ca3af">{tick}</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="url(#co2Gradient)" opacity="0.3" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" style={{ transition: 'all 0.3s ease' }} />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.date)}
            cy={yScale(p.co2)}
            r={hoverIdx === i ? 5 : 3}
            fill={hoverIdx === i ? '#16a34a' : '#fff'}
            stroke="#16a34a"
            strokeWidth="2"
            className="cursor-pointer transition-all"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}

        {/* X-axis labels */}
        <text x={PAD.left} y={H - 5} textAnchor="start" className="text-[9px]" fill="#9ca3af">{formatDate(points[0].date)}</text>
        <text x={W - PAD.right} y={H - 5} textAnchor="end" className="text-[9px]" fill="#9ca3af">{formatDate(points[points.length - 1].date)}</text>

        {/* Y-axis label */}
        <text x={5} y={PAD.top - 8} textAnchor="start" className="text-[8px]" fill="#9ca3af">kg CO₂</text>

        {/* Gradient definition */}
        <defs>
          <linearGradient id="co2Gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
      </svg>

      {/* Tooltip */}
      {hoverIdx !== null && points[hoverIdx] && (
        <div className="absolute top-2 right-2 bg-gray-900 text-white text-[10px] px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10">
          <p className="font-bold text-green-400">{points[hoverIdx].co2.toFixed(1)} kg CO₂</p>
          <p className="text-gray-300">+{points[hoverIdx].added.toFixed(1)} kg ({points[hoverIdx].action})</p>
          <p className="text-gray-400">{points[hoverIdx].category} • {formatDate(points[hoverIdx].date)}</p>
        </div>
      )}

      {/* Summary below chart */}
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[10px] text-gray-400">Cumulative from {sorted.length} assessments</span>
        <span className="text-xs font-bold text-green-700">↑ {cumulative.toFixed(1)} kg total</span>
      </div>
    </div>
  );
}

function getTopAction(distribution) {
  const entries = Object.entries(distribution || {});
  if (!entries.length) return 'None';
  entries.sort(([,a],[,b]) => b - a);
  const cfg = ACTION_CONFIG[entries[0][0]];
  return cfg ? `${cfg.icon} ${cfg.label}` : entries[0][0];
}
