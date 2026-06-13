import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { uploadImage, assessProduct, getSessionId } from '../services/api';

const CATEGORIES = ['Electronics', 'Clothing', 'Furniture', 'Books', 'Toys', 'Appliances', 'Sports Equipment'];

const GRADE_COLORS = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-orange-100 text-orange-800 border-orange-300',
  D: 'bg-red-100 text-red-800 border-red-300',
};
const GRADE_LABELS = { A: 'Like New', B: 'Good', C: 'Fair', D: 'Poor' };

export default function UploadPage({ dashData, onAssessmentComplete }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [category, setCategory] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [imageKey, setImageKey] = useState(null);
  const [listingStatus, setListingStatus] = useState(null); // null | 'publishing' | 'success' | 'error'
  const navigate = useNavigate();

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setError(null); }
  }
  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setError(null); }
  }
  function resetForm() {
    setFile(null); setPreview(null); setCategory(''); setAgeMonths(''); setPrice('');
    setResult(null); setError(null); setShowForm(false); setImageKey(null); setListingStatus(null);
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setResult(null);
    if (!file) return setError('Please select an image file.');
    if (!category) return setError('Please select a product category.');
    if (!ageMonths || Number(ageMonths) < 0 || Number(ageMonths) > 240) return setError('Product age must be 0-240 months.');
    if (!price || Number(price) <= 0) return setError('Original price must be greater than 0.');
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) return setError('File must be JPEG, PNG, or WebP.');
    if (file.size > 10 * 1024 * 1024) return setError('File size must be under 10 MB.');
    setLoading(true);
    try {
      const uploadRes = await uploadImage(file);
      setImageKey(uploadRes.image_key);
      const assessment = await assessProduct({ image_key: uploadRes.image_key, product_category: category, product_age_months: Number(ageMonths), original_price: Number(price) });
      setResult(assessment);
      if (onAssessmentComplete) onAssessmentComplete();
    } catch (err) { setError(err.message || 'Something went wrong.'); }
    finally { setLoading(false); }
  }

  async function handlePublishListing() {
    if (!result || !imageKey) return;
    const listingType = result.action_recommendation === 'resell' ? 'resale'
      : result.action_recommendation === 'refurbish' ? 'refurbished'
      : 'donation';
    setListingStatus('publishing');
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({
          assessment_id: result.assessment_id,
          image_key: imageKey,
          product_category: category,
          listing_type: listingType,
          assessment_snapshot: {
            condition_grade: result.condition_grade,
            confidence_score: result.confidence_score,
            grade_explanation: result.grade_explanation,
            action_recommendation: result.action_recommendation,
            action_reasoning: result.action_reasoning,
            resale_value: result.resale_value,
            green_credits: result.green_credits,
            co2_savings_kg: result.co2_savings_kg,
            buyer_personas: result.buyer_personas || [],
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to publish listing');
      setListingStatus('success');
    } catch { setListingStatus('error'); }
  }

  // Compute circularity rate from dashData
  const totalActions = dashData ? Object.values(dashData.action_distribution || {}).reduce((a, b) => a + b, 0) : 0;
  const circRate = totalActions > 0 ? Math.round(((dashData.action_distribution?.resell || 0) + (dashData.action_distribution?.refurbish || 0)) / totalActions * 100) : 0;

  return (
    <div>
      {/* ========== HERO / LANDING ========== */}
      {!showForm && !result && (
        <>
          {/* Hero Section */}
          <section className="relative bg-gradient-to-br from-[#0f1b2d] via-[#1a2d47] to-[#0f1b2d] rounded-3xl overflow-hidden p-8 md:p-12 mb-8">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
              {/* Left Content */}
              <div className="lg:col-span-3">
                <p className="text-xs font-semibold text-[#f59e0b] uppercase tracking-widest mb-3">✦ AI-Powered Sustainability</p>
                <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
                  Turn Waste Into <span className="text-[#22c55e]">Impact</span>
                </h1>
                <p className="mt-4 text-gray-300 text-base max-w-lg">
                  AI analyzes your products, estimates value, and recommends the most sustainable next step.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={() => setShowForm(true)} className="bg-[#f59e0b] hover:bg-[#d97706] text-[#0f1b2d] font-bold px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2">
                    🌱 Assess a Product
                  </button>
                  <Link to="/dashboard" className="bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3 rounded-xl transition-all border border-white/20 flex items-center gap-2">
                    📊 View My Impact
                  </Link>
                </div>
              </div>

              {/* Right — Impact Snapshot Card */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl p-6 shadow-2xl">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Your Impact So Far</p>
                  <div className="grid grid-cols-2 gap-4">
                    <MiniStat icon="🌱" value={dashData?.total_green_credits || 0} label="Green Credits Earned" />
                    <MiniStat icon="🌍" value={`${(dashData?.total_co2_saved_kg || 0).toFixed(1)} kg`} label="CO₂ Prevented" />
                    <MiniStat icon="📦" value={dashData?.total_assessments || 0} label="Products Assessed" />
                    <MiniStat icon="🔄" value={`${circRate}%`} label="Circularity Rate" />
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative gradient circles */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />
          </section>

          {/* Summary Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <SummaryCard icon="🌱" value={dashData?.total_green_credits || 0} label="GREEN CREDITS" sub="Total earned" color="border-l-green-500" trend="↑ 18%" />
            <SummaryCard icon="📦" value={dashData?.total_assessments || 0} label="PRODUCTS ASSESSED" sub="Total scanned" color="border-l-blue-500" trend="↑ 27%" />
            <SummaryCard icon="🌍" value={`${(dashData?.total_co2_saved_kg || 0).toFixed(1)} kg`} label="CO₂ PREVENTED" sub="Carbon saved" color="border-l-emerald-500" trend="↑ 22%" />
            <SummaryCard icon="🔄" value={`${circRate}%`} label="CIRCULARITY RATE" sub="Resell + Refurbish" color="border-l-orange-500" trend="↑ 16%" />
          </div>

          {/* AI Pipeline Visualization */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-sm mb-8">
            <h2 className="text-lg font-bold text-gray-800 mb-6 text-center">🤖 AI Agentic Pipeline</h2>
            <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-0">
              <PipelineStep icon="👁️" label="Vision Agent" desc="Image Analysis" color="bg-blue-50 border-blue-200 text-blue-800" />
              <PipelineArrow />
              <PipelineStep icon="💰" label="Valuation Agent" desc="Price Estimation" color="bg-amber-50 border-amber-200 text-amber-800" />
              <PipelineArrow />
              <PipelineStep icon="🧠" label="Decision Agent" desc="Action Selection" color="bg-purple-50 border-purple-200 text-purple-800" />
              <PipelineArrow />
              <PipelineStep icon="🌱" label="Sustainability Agent" desc="Impact Scoring" color="bg-green-50 border-green-200 text-green-800" />
              <PipelineArrow />
              <PipelineStep icon="🎯" label="Buyer Matching" desc="Persona Generation" color="bg-rose-50 border-rose-200 text-rose-800" />
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FeatureCard icon="📸" title="Smart Upload" desc="Drag & drop product photos for instant AI analysis" />
            <FeatureCard icon="🤖" title="Multi-Agent AI" desc="5 specialized agents collaborate for accurate assessment" />
            <FeatureCard icon="💰" title="Value Estimation" desc="Category-specific depreciation models estimate resale value" />
            <FeatureCard icon="🌱" title="Green Impact" desc="Earn credits, track CO₂ savings, find sustainable outcomes" />
          </div>
        </>
      )}

      {/* ========== ASSESSMENT FORM ========== */}
      {showForm && !result && (
        <div className="max-w-3xl mx-auto">
          <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-[#f59e0b] mb-4 flex items-center gap-1 transition-colors">
            ← Back to Home
          </button>
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Assess Your Product</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-[#f59e0b] transition-colors cursor-pointer bg-gray-50"
                onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById('file-input').click()}
              >
                {preview ? (
                  <img src={preview} alt="Preview" className="max-h-56 mx-auto rounded-lg shadow" />
                ) : (
                  <div className="text-gray-400">
                    <svg className="mx-auto h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <p className="font-medium text-gray-600">Drop your product image here</p>
                    <p className="text-sm mt-1">JPEG, PNG, WebP — max 10MB</p>
                  </div>
                )}
                <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden" />
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent">
                    <option value="">Select...</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age (months)</label>
                  <input type="number" min="0" max="240" value={ageMonths} onChange={(e) => setAgeMonths(e.target.value)} placeholder="e.g. 18" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Original Price (₹)</label>
                  <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 599.99" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent" />
                </div>
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}

              <button type="submit" disabled={loading} className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-[#0f1b2d] font-bold py-3 rounded-xl transition-all disabled:bg-gray-300 disabled:cursor-not-allowed shadow-md">
                {loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Analyzing...</span> : '🌱 Run Assessment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========== RESULTS ========== */}
      {result && (
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">Assessment Results</h2>
            <button onClick={resetForm} className="text-sm text-[#f59e0b] hover:text-[#d97706] font-medium">← New Assessment</button>
          </div>

          {/* Grade Card */}
          <div className={`border rounded-2xl p-6 ${GRADE_COLORS[result.condition_grade]}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Condition Grade</p>
                <p className="text-3xl font-bold mt-1">{result.condition_grade} — {GRADE_LABELS[result.condition_grade]}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Confidence</p>
                <p className="text-2xl font-bold mt-1">{result.confidence_score}%</p>
              </div>
            </div>
            <p className="mt-3 text-sm opacity-75">{result.grade_explanation}</p>
          </div>

          {/* Metrics Row — conditional based on action */}
          {result.action_recommendation === 'donate' ? (
            /* DONATE: Show Donation Impact Card instead of pricing */
            <div className="bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 border border-pink-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">❤️</span>
                <h3 className="text-lg font-bold text-gray-800">Donation Impact</h3>
                <span className="text-[10px] bg-pink-100 text-pink-700 font-bold px-2 py-0.5 rounded-full ml-auto">Donation Eligible</span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This item will be routed through EcoLoop partner NGOs, schools, community organizations, and donation networks to maximize social and environmental impact.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/70 rounded-xl p-4 text-center border border-green-100">
                  <p className="text-2xl font-bold text-green-700">🌱 {result.green_credits}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Green Credits Earned</p>
                </div>
                <div className="bg-white/70 rounded-xl p-4 text-center border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">🌍 {result.co2_savings_kg} kg</p>
                  <p className="text-[10px] text-gray-500 mt-1">CO₂ Prevented</p>
                </div>
                <div className="bg-white/70 rounded-xl p-4 text-center border border-orange-100">
                  <p className="text-2xl font-bold text-orange-700">🎁</p>
                  <p className="text-[10px] text-gray-500 mt-1">Community Benefit</p>
                </div>
              </div>
            </div>
          ) : (
            /* RESELL / REFURBISH / RECYCLE: Show standard metrics */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase">Recommended Action</p>
                <p className="text-xl font-bold text-gray-800 capitalize mt-2">
                  {result.action_recommendation === 'resell' && '🏷️ '}{result.action_recommendation === 'refurbish' && '🔧 '}{result.action_recommendation === 'recycle' && '♻️ '}{result.action_recommendation}
                </p>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">{result.action_reasoning}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase">Resale Value</p>
                <p className="text-xl font-bold text-gray-800 mt-2">{result.resale_value.display}</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-green-600 uppercase">Sustainability Impact</p>
                <p className="text-xl font-bold text-green-800 mt-2">🌱 {result.green_credits} credits</p>
                <p className="text-sm text-green-600 mt-1">🌍 {result.co2_savings_kg} kg CO₂ saved</p>
              </div>
            </div>
          )}

          {/* Buyer Personas — only for resell/refurbish */}
          {result.action_recommendation !== 'donate' && result.buyer_personas?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Buyer Personas</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {result.buyer_personas.map((p, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-semibold text-gray-800 text-sm">{p.label}</p>
                      <span className="text-xs bg-[#f59e0b]/10 text-[#d97706] font-bold px-2 py-0.5 rounded-full">{p.relevance_score}/10</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{p.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Marketplace Listing Section — Resell / Refurbish */}
          {(result.action_recommendation === 'resell' || result.action_recommendation === 'refurbish') && (
            <div className="bg-gradient-to-r from-[#0f1b2d] to-[#1a2d47] rounded-2xl p-6 shadow-lg">
              {listingStatus === 'success' ? (
                <div className="text-center py-4">
                  <span className="text-4xl block mb-3">✅</span>
                  <p className="text-white font-bold text-lg">Item Listed Successfully!</p>
                  <p className="text-gray-400 text-sm mt-1">Your product is now live on the EcoLoop Marketplace</p>
                  <div className="flex items-center justify-center gap-3 mt-5">
                    <button onClick={() => navigate('/marketplace')} className="bg-[#f59e0b] hover:bg-[#d97706] text-[#0f1b2d] font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
                      View Marketplace
                    </button>
                    <button onClick={resetForm} className="bg-white/10 hover:bg-white/20 text-white font-medium px-5 py-2.5 rounded-xl text-sm border border-white/20 transition-all">
                      Continue Assessing
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">
                      {result.action_recommendation === 'resell' ? '🏷️ Ready for Resale' : '🔧 Ready for Refurbishment'}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">Publish to the EcoLoop Marketplace with one click</p>
                  </div>
                  <button
                    onClick={handlePublishListing}
                    disabled={listingStatus === 'publishing'}
                    className="bg-[#f59e0b] hover:bg-[#d97706] text-[#0f1b2d] font-bold px-5 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {listingStatus === 'publishing' ? (
                      <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Publishing...</>
                    ) : (
                      <>{result.action_recommendation === 'resell' ? 'List for Resale' : 'List for Refurbishment'}</>
                    )}
                  </button>
                </div>
              )}
              {listingStatus === 'error' && (
                <p className="text-red-400 text-xs mt-3">Failed to publish. Please try again.</p>
              )}
            </div>
          )}

          {/* Donate Listing Section */}
          {result.action_recommendation === 'donate' && (
            <div className="bg-gradient-to-r from-pink-600 to-rose-700 rounded-2xl p-6 shadow-lg">
              {listingStatus === 'success' ? (
                <div className="text-center py-4">
                  <span className="text-4xl block mb-3">❤️</span>
                  <p className="text-white font-bold text-lg">Donation Listed Successfully!</p>
                  <p className="text-pink-200 text-sm mt-1">Your item is ready to be matched with community partners</p>
                  <div className="flex items-center justify-center gap-3 mt-5">
                    <button onClick={() => navigate('/marketplace')} className="bg-white hover:bg-gray-100 text-pink-700 font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
                      View Marketplace
                    </button>
                    <button onClick={resetForm} className="bg-white/10 hover:bg-white/20 text-white font-medium px-5 py-2.5 rounded-xl text-sm border border-white/20 transition-all">
                      Continue Assessing
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">❤️ Ready for Donation</p>
                    <p className="text-pink-200 text-xs mt-1">List for community partners, NGOs, and schools</p>
                  </div>
                  <button
                    onClick={handlePublishListing}
                    disabled={listingStatus === 'publishing'}
                    className="bg-white hover:bg-gray-100 text-pink-700 font-bold px-5 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {listingStatus === 'publishing' ? (
                      <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Publishing...</>
                    ) : '❤️ Donate Item'}
                  </button>
                </div>
              )}
              {listingStatus === 'error' && (
                <p className="text-red-200 text-xs mt-3">Failed to publish. Please try again.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =============== Helper Components =============== */

function MiniStat({ icon, value, label }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-xl mt-0.5">{icon}</span>
      <div>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
      </div>
    </div>
  );
}

function SummaryCard({ icon, value, label, sub, color, trend }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-5 shadow-sm border-l-4 ${color} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-xs text-green-600 font-medium mt-2">{trend} vs last 30 days</p>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group cursor-default">
      <span className="text-3xl group-hover:scale-110 transition-transform inline-block">{icon}</span>
      <h3 className="mt-3 font-bold text-gray-800 text-sm">{title}</h3>
      <p className="mt-1 text-xs text-gray-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function PipelineStep({ icon, label, desc, color }) {
  return (
    <div className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border ${color} min-w-[110px]`}>
      <span className="text-xl">{icon}</span>
      <p className="text-xs font-bold">{label}</p>
      <p className="text-[10px] opacity-70">{desc}</p>
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="hidden md:flex items-center px-1 text-gray-300">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    </div>
  );
}
