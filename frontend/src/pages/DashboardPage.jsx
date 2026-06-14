import { useState, useEffect } from 'react';
import { getSessionId } from '../services/api';

const ACTION_CONFIG = {
  resell: { color: '#3b82f6', badge: 'bg-blue-100 text-blue-800', icon: '🏷️', label: 'Resell' },
  refurbish: { color: '#f59e0b', badge: 'bg-amber-100 text-amber-800', icon: '🔧', label: 'Refurbish' },
  donate: { color: '#a855f7', badge: 'bg-purple-100 text-purple-800', icon: '🎁', label: 'Donate' },
  recycle: { color: '#22c55e', badge: 'bg-emerald-100 text-emerald-800', icon: '♻️', label: 'Recycle' },
  exchange: { color: '#6366f1', badge: 'bg-indigo-100 text-indigo-800', icon: '🔄', label: 'Exchange' },
  exchange_pending: { color: '#6366f1', badge: 'bg-indigo-50 text-indigo-600 border border-indigo-200', icon: '🔄', label: 'Exchange (Pending)' },
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

  // Weighted Circularity Score
  // Each action contributes differently to sustainability impact:
  //   Resell     = 1.0 (full lifecycle extension, product stays in commerce)
  //   Refurbish  = 0.85 (high impact — restores value and extends life)
  //   Donate     = 0.70 (good impact — extends use but no value recovery)
  //   Recycle    = 0.30 (minimal — materials recovered but product destroyed)
  //
  // Formula: sum(action_count × weight) / sum(action_count × max_weight) × 100
  // This produces a 0-100% score where 100% = all products resold
  // Circularity Score — ALL circular actions are valid sustainability outcomes
  // Weights reflect lifecycle extension value, but ALL are positive contributions
  const CIRC_WEIGHTS = { resell: 1.0, refurbish: 0.90, exchange: 1.0, donate: 0.80, recycle: 0.60 };
  const weightedSum = Object.entries(actionDist).reduce((sum, [action, count]) => sum + count * (CIRC_WEIGHTS[action] || 0.5), 0);
  const maxPossible = totalActions * 1.0;
  const circRate = totalActions > 0 ? Math.round((weightedSum / maxPossible) * 100) : 0;

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
        <ExecCard icon="🔄" value={`${circRate}%`} label="CIRCULARITY RATE" sub="Weighted impact score" color="border-l-orange-500" />
      </div>

      {/* My Circular Actions */}
      {totalActions > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">My Circular Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <CircularActionCard icon="🏷️" label="Resold" count={actionDist.resell || 0} color="bg-blue-50 border-blue-200 text-blue-800" />
            <CircularActionCard icon="🔧" label="Refurbished" count={actionDist.refurbish || 0} color="bg-amber-50 border-amber-200 text-amber-800" />
            <CircularActionCard icon="🎁" label="Donated" count={actionDist.donate || 0} color="bg-pink-50 border-pink-200 text-pink-800" />
            <CircularActionCard icon="🔄" label="Exchanged" count={actionDist.exchange || 0} color="bg-indigo-50 border-indigo-200 text-indigo-800" />
            <CircularActionCard icon="♻️" label="Recycled" count={actionDist.recycle || 0} color="bg-emerald-50 border-emerald-200 text-emerald-800" />
          </div>
        </div>
      )}

      {/* Sustainability Profile */}
      {data.total_assessments > 0 && (
        <SustainabilityProfile
          credits={data.total_green_credits}
          assessments={data.total_assessments}
          circRate={circRate}
          actionDist={actionDist}
          categoryDist={categoryDist}
        />
      )}

      {/* AI Pipeline Impact */}
      {data.total_assessments > 0 && (
        <div className="bg-gradient-to-br from-[#0f1b2d] to-[#1a2d47] rounded-2xl p-6 shadow-lg text-white">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">🤖 AI Pipeline Impact</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <PipelineImpactStat value={data.total_assessments} label="Analyzed" />
            <PipelineImpactStat value={data.total_green_credits} label="Credits" />
            <PipelineImpactStat value={`${data.total_co2_saved_kg.toFixed(1)}`} label="kg CO₂" />
            <PipelineImpactStat value={actionDist.resell || 0} label="Resell" />
            <PipelineImpactStat value={actionDist.refurbish || 0} label="Refurbish" />
            <PipelineImpactStat value={actionDist.donate || 0} label="Donate" />
            <PipelineImpactStat value={actionDist.exchange || 0} label="Exchange" />
            <PipelineImpactStat value={actionDist.recycle || 0} label="Recycle" />
          </div>
        </div>
      )}

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
                  // action_recommendation = final action (backend applies fallback: final_action || action_recommendation)
                  // recommended_action = always the original AI recommendation
                  const displayAction = item.action_recommendation;
                  const aiRecommended = item.recommended_action || item.action_recommendation;
                  const fCfg = ACTION_CONFIG[displayAction] || ACTION_CONFIG.recycle;
                  const rCfg = ACTION_CONFIG[aiRecommended] || ACTION_CONFIG.recycle;
                  const gCfg = GRADE_CONFIG[item.condition_grade] || GRADE_CONFIG.C;
                  const differs = displayAction !== aiRecommended;
                  return (
                    <div key={item.assessment_id} className="px-5 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">📦</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.product_category}</p>
                        <p className="text-[10px] text-gray-400">{item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gCfg.badge}`}>{item.condition_grade}</span>
                      <div className="flex flex-col items-end gap-0.5">
                        {differs && (
                          <span className="text-[9px] text-gray-400 line-through">{rCfg.icon} {rCfg.label}</span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${fCfg.badge}`}>{fCfg.icon} {fCfg.label}</span>
                      </div>
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

function CircularActionCard({ icon, label, count, color }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${color}`}>
      <span className="text-2xl block">{icon}</span>
      <p className="text-2xl font-bold mt-1">{count}</p>
      <p className="text-[10px] font-medium mt-0.5">{label}</p>
    </div>
  );
}

function PipelineImpactStat({ value, label }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-[#f59e0b]">{value}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

function SustainabilityProfile({ credits, assessments, circRate, actionDist, categoryDist }) {
  // Tier calculation
  const tier = credits > 600
    ? { name: 'Circularity Leader', icon: '🏆', color: 'from-yellow-400 to-amber-500', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300' }
    : credits > 300
    ? { name: 'Eco Champion', icon: '🥇', color: 'from-green-400 to-emerald-500', badge: 'bg-green-100 text-green-800 border-green-300' }
    : credits > 100
    ? { name: 'Eco Advocate', icon: '🌿', color: 'from-teal-400 to-cyan-500', badge: 'bg-teal-100 text-teal-800 border-teal-300' }
    : { name: 'Eco Starter', icon: '🌱', color: 'from-gray-400 to-gray-500', badge: 'bg-gray-100 text-gray-700 border-gray-300' };

  // Most frequent action
  const topAction = Object.entries(actionDist).sort(([,a],[,b]) => b - a)[0];
  const topActionLabel = topAction ? topAction[0] : 'None';

  // Most assessed category
  const topCategory = Object.entries(categoryDist).sort(([,a],[,b]) => b - a)[0];
  const topCategoryLabel = topCategory ? topCategory[0] : 'N/A';

  // Progress to next tier
  const nextTierCredits = credits > 600 ? null : credits > 300 ? 600 : credits > 100 ? 300 : 100;
  const remaining = nextTierCredits ? nextTierCredits - credits : 0;
  const progressPct = nextTierCredits ? Math.min(100, (credits / nextTierCredits) * 100) : 100;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header with gradient */}
      <div className={`bg-gradient-to-r ${tier.color} p-5 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Your Sustainability Profile</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-3xl">{tier.icon}</span>
              <p className="text-xl font-bold">{tier.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{credits}</p>
            <p className="text-xs opacity-80">Green Credits</p>
          </div>
        </div>
        {/* Progress bar to next tier */}
        {nextTierCredits && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] opacity-80 mb-1">
              <span>{credits} credits</span>
              <span>{remaining} credits to next tier</span>
            </div>
            <div className="w-full bg-white/30 rounded-full h-2">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Profile Stats */}
      <div className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <ProfileStat label="Products Assessed" value={assessments} />
          <ProfileStat label="Circularity Score" value={`${circRate}%`} />
          <ProfileStat label="Top Category" value={topCategoryLabel} />
          <ProfileStat label="Top Action" value={topActionLabel} />
        </div>

        {/* Explanation */}
        <p className="text-[10px] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
          This profile is generated from your assessment activity and is used to personalize marketplace recommendations.
        </p>
      </div>
    </div>
  );
}

function ProfileStat({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-gray-800 capitalize">{value}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
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
