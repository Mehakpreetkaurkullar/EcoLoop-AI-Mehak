import { useState, useEffect } from 'react';
import { getSessionId } from '../services/api';

const GRADE_BADGE = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-orange-100 text-orange-800',
  D: 'bg-red-100 text-red-800',
};
const GRADE_LABEL = { A: 'Like New', B: 'Good', C: 'Fair', D: 'Poor' };

export default function MarketplacePage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const [interestSent, setInterestSent] = useState(false);
  const [profile, setProfile] = useState(null);
  const [showCreateExchange, setShowCreateExchange] = useState(false); // sustainability profile data

  useEffect(() => { fetchListings(); fetchProfile(); }, [activeTab]);

  async function fetchListings() {
    setLoading(true);
    try {
      const query = activeTab !== 'all' ? `?listing_type=${activeTab}` : '';
      const res = await fetch(`/api/listings${query}`);
      if (res.ok) { const data = await res.json(); setListings(data.listings || []); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function fetchProfile() {
    try {
      const res = await fetch('/api/dashboard', { headers: { 'x-session-id': getSessionId() } });
      if (res.ok) setProfile(await res.json());
    } catch { /* silent */ }
  }

  function openDetail(listing) { setSelected(listing); setInterestSent(false); }
  function closeDetail() { setSelected(null); setInterestSent(false); }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏪 EcoLoop Marketplace</h1>
          <p className="text-sm text-gray-500 mt-1">AI-verified second-life products ready for new owners</p>
        </div>
        <span className="text-xs bg-green-100 text-green-700 font-semibold px-3 py-1.5 rounded-full">
          {listings.length} Active Listings
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>All</TabButton>
        <TabButton active={activeTab === 'resale'} onClick={() => setActiveTab('resale')}>🏷️ Resale</TabButton>
        <TabButton active={activeTab === 'refurbished'} onClick={() => setActiveTab('refurbished')}>🔧 Refurbished</TabButton>
        <TabButton active={activeTab === 'donation'} onClick={() => setActiveTab('donation')}>❤️ Donations</TabButton>
        <TabButton active={activeTab === 'exchange'} onClick={() => setActiveTab('exchange')}>🔄 Exchange</TabButton>
        <TabButton active={activeTab === 'recycling'} onClick={() => setActiveTab('recycling')}>♻️ Recycling</TabButton>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-200 rounded-2xl h-72 animate-pulse" />)}
        </div>
      )}

      {/* Create Exchange Button (only on exchange tab) */}
      {activeTab === 'exchange' && !loading && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreateExchange(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md flex items-center gap-2">
            🔄 Create Exchange Listing
          </button>
        </div>
      )}

      {/* Listings Grid */}
      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {listings.map((listing) => (
            <ListingCard key={listing.listing_id} listing={listing} onClick={() => openDetail(listing)} allListings={listings} onOpenMatch={openDetail} />
          ))}
        </div>
      )}

      {/* Recommended For You — shows refurbished listings from matching categories */}
      {!loading && listings.length > 1 && (
        <RecommendedSection listings={listings} onSelect={openDetail} profile={profile} />
      )}

      {/* Empty State */}
      {!loading && listings.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-5xl block mb-4">🏪</span>
          <p className="text-lg font-bold text-gray-700">No listings yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">Assess a product and list it for resale or refurbishment.</p>
          <a href="/" className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-[#0f1b2d] font-bold px-6 py-3 rounded-xl transition-all shadow-md">
            🌱 Assess a Product
          </a>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <ListingDetailModal
          listing={selected}
          onClose={closeDetail}
          interestSent={interestSent}
          onInterest={() => setInterestSent(true)}
          profile={profile}
          allListings={listings}
          onSelectMatch={(match) => { setSelected(match); setInterestSent(false); }}
        />
      )}

      {/* Direct Exchange Creation Modal */}
      {showCreateExchange && (
        <DirectExchangeModal
          onClose={() => { setShowCreateExchange(false); setExStatus(null); }}
          onSuccess={() => { setShowCreateExchange(false); setExStatus(null); fetchListings(); }}
        />
      )}
    </div>
  );
}

/* =============== Components =============== */

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
      {children}
    </button>
  );
}

function ListingCard({ listing, onClick, allListings, onOpenMatch }) {
  const snapshot = listing.assessment_snapshot || {};
  const personas = listing.buyer_personas || [];
  const gradeBadge = GRADE_BADGE[listing.condition_grade] || GRADE_BADGE.C;

  return (
    <div onClick={onClick} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all group cursor-pointer">
      {/* Image */}
      <div className="relative h-44 bg-gray-200 overflow-hidden">
        {listing.image_url ? (
          <img src={listing.image_url} alt={listing.title} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📦</div>
        )}
        {listing.ai_verified && (
          <span className="absolute top-3 left-3 bg-[#0f1b2d]/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">✓ AI Verified</span>
        )}
        <span className={`absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full ${
          listing.listing_type === 'resale' ? 'bg-blue-500 text-white'
          : listing.listing_type === 'donation' ? 'bg-pink-500 text-white'
          : listing.listing_type === 'exchange' ? 'bg-indigo-500 text-white'
          : listing.listing_type === 'recycling' ? 'bg-teal-500 text-white'
          : 'bg-amber-500 text-white'
        }`}>
          {listing.listing_type === 'resale' ? '🏷️ Resale' : listing.listing_type === 'donation' ? '❤️ Donation' : listing.listing_type === 'exchange' ? '🔄 Exchange' : listing.listing_type === 'recycling' ? '♻️ Recycling' : '🔧 Refurbished'}
        </span>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">{listing.title}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{listing.product_category}</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${gradeBadge}`}>
            Grade {listing.condition_grade}
          </span>
        </div>

        <div className="mt-3">
          {listing.listing_type === 'donation' ? (
            <p className="text-sm font-semibold text-pink-700">❤️ Free — Community Donation</p>
          ) : listing.listing_type === 'recycling' ? (
            <p className="text-sm font-semibold text-teal-700">♻️ Material Recovery: {getRecoveryPct(listing)}%</p>
          ) : listing.listing_type === 'exchange' ? (
            <p className="text-sm font-semibold text-indigo-700">🔄 Seeking: {listing.assessment_snapshot?.wanted_category || 'Not specified'}</p>
          ) : (
            <>
              <p className="text-xl font-bold text-gray-900">₹{listing.suggested_price?.toFixed(0)}</p>
              <p className="text-[10px] text-gray-400">Range: ₹{listing.price_min?.toFixed(0)} - ₹{listing.price_max?.toFixed(0)}</p>
            </>
          )}
        </div>

        {snapshot.green_credits && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-[10px] bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded-full">🌱 {snapshot.green_credits} credits</span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">🌍 {snapshot.co2_savings_kg} kg CO₂</span>
          </div>
        )}

        {listing.listing_type !== 'donation' && listing.listing_type !== 'recycling' && listing.listing_type !== 'exchange' && personas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {personas.slice(0, 3).map((p, i) => (
              <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">✓ {p.label}</span>
            ))}
          </div>
        )}

        {listing.listing_type === 'donation' && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-semibold text-pink-700">Donation Impact:</p>
            <p className="text-[10px] text-pink-600">• Partner NGOs, Schools, Community Orgs</p>
            <p className="text-[10px] text-pink-600">• Est. 3-5 beneficiaries reached</p>
          </div>
        )}

        {listing.listing_type === 'recycling' && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-semibold text-teal-700">Recoverable Materials:</p>
            <p className="text-[10px] text-teal-600">{getMaterials(listing.product_category)}</p>
          </div>
        )}

        {listing.listing_type === 'exchange' && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-indigo-700">Match Potential: {getMatchPotential(listing.condition_grade)}</p>
            </div>
            {/* Inline potential matches (max 2, clickable, scored) */}
            {(() => {
              const myWanted = snapshot.wanted_category || '';
              const myOffered = listing.product_category;
              const scored = (allListings || [])
                .filter((o) => {
                  if (o.listing_id === listing.listing_id) return false;
                  if (o.listing_type !== 'exchange') return false;
                  if (myWanted && o.product_category !== myWanted) return false;
                  return true;
                })
                .map((o) => {
                  let s = 0;
                  if (myWanted && o.product_category === myWanted) s += 10;
                  if ((o.assessment_snapshot?.wanted_category || '') === myOffered) s += 10;
                  if (o.condition_grade === 'A') s += 3; else if (o.condition_grade === 'B') s += 2; else if (o.condition_grade === 'C') s += 1;
                  return { ...o, _s: s };
                })
                .filter((o) => o._s > 0)
                .sort((a, b) => b._s - a._s)
                .slice(0, 2);
              if (scored.length === 0) return null;
              return (
                <div className="space-y-1 mt-1">
                  <p className="text-[9px] text-gray-400 font-medium">Potential Matches:</p>
                  {scored.map((m) => (
                    <p
                      key={m.listing_id}
                      onClick={(e) => { e.stopPropagation(); onOpenMatch && onOpenMatch(m); }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                    >
                      {m._s >= 20 ? '✓✓' : '✓'} {m.title || m.product_category}
                    </p>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        <p className="text-[10px] text-gray-300 mt-3">
          Listed {listing.created_at ? new Date(listing.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
        </p>

        {/* View Details CTA */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs font-semibold text-[#f59e0b] group-hover:text-[#d97706] transition-colors">
            View Details →
          </span>
        </div>
      </div>
    </div>
  );
}

function ListingDetailModal({ listing, onClose, interestSent, onInterest, profile, allListings, onSelectMatch }) {
  const snapshot = listing.assessment_snapshot || {};
  const personas = listing.buyer_personas || [];
  const gradeBadge = GRADE_BADGE[listing.condition_grade] || GRADE_BADGE.C;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-500 transition-colors">
          ✕
        </button>

        {/* Image */}
        <div className="relative h-64 bg-gray-200 rounded-t-3xl overflow-hidden">
          {listing.image_url ? (
            <img src={listing.image_url} alt={listing.title} className="w-full h-full object-contain p-3" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300">📦</div>
          )}
          {/* Badges overlay */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            {listing.ai_verified && (
              <span className="bg-[#0f1b2d]/90 text-white text-xs font-bold px-3 py-1.5 rounded-full">✓ AI Verified</span>
            )}
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              listing.listing_type === 'resale' ? 'bg-blue-500 text-white'
              : listing.listing_type === 'donation' ? 'bg-pink-500 text-white'
              : listing.listing_type === 'exchange' ? 'bg-indigo-500 text-white'
              : listing.listing_type === 'recycling' ? 'bg-teal-500 text-white'
              : 'bg-amber-500 text-white'
            }`}>
              {listing.listing_type === 'resale' ? '🏷️ Resale' : listing.listing_type === 'donation' ? '❤️ Donation' : listing.listing_type === 'exchange' ? '🔄 Exchange' : listing.listing_type === 'recycling' ? '♻️ Recycling' : '🔧 Refurbished'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-7">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{listing.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{listing.product_category}</p>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${gradeBadge}`}>
              Grade {listing.condition_grade} — {GRADE_LABEL[listing.condition_grade] || ''}
            </span>
          </div>

          {/* AI Description */}
          <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI-Generated Description</p>
            <p className="text-sm text-gray-700 leading-relaxed">{listing.description}</p>
          </div>

          {/* Price/Value Section — context-appropriate for each listing type */}
          {listing.listing_type === 'resale' || listing.listing_type === 'refurbished' ? (
            <div className="flex items-end gap-4 mb-5">
              <div>
                <p className="text-xs text-gray-400">Suggested Price</p>
                <p className="text-3xl font-bold text-gray-900">₹{listing.suggested_price?.toFixed(0)}</p>
              </div>
              <div className="pb-1">
                <p className="text-xs text-gray-400">Price Range</p>
                <p className="text-sm font-medium text-gray-600">₹{listing.price_min?.toFixed(0)} — ₹{listing.price_max?.toFixed(0)}</p>
              </div>
            </div>
          ) : listing.listing_type === 'exchange' ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-indigo-500 font-medium">Offering</p>
                  <p className="text-sm font-bold text-indigo-900">{listing.product_category}</p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-500 font-medium">Seeking</p>
                  <p className="text-sm font-bold text-indigo-900">{snapshot.wanted_category || 'Not specified'}</p>
                </div>
              </div>
              {snapshot.wanted_description && (
                <p className="text-xs text-indigo-600 mt-2 italic">"{snapshot.wanted_description}"</p>
              )}
              <p className="text-[10px] text-indigo-500 mt-2">Match Potential: <span className="font-bold">{getMatchPotential(listing.condition_grade)}</span></p>
            </div>
          ) : listing.listing_type === 'recycling' ? (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-5">
              <p className="text-sm font-bold text-teal-800">♻️ Recycling Impact</p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-white/70 rounded-lg p-3 text-center border border-teal-100">
                  <p className="text-lg font-bold text-teal-900">{getRecoveryPct(listing)}%</p>
                  <p className="text-[9px] text-teal-600">Material Recovery</p>
                </div>
                <div className="bg-white/70 rounded-lg p-3 text-center border border-teal-100">
                  <p className="text-lg font-bold text-teal-900">🌍 {snapshot.co2_savings_kg || 0} kg</p>
                  <p className="text-[9px] text-teal-600">CO₂ Saved</p>
                </div>
              </div>
              <p className="text-[10px] text-teal-600 mt-3">{getMaterials(listing.product_category)}</p>
            </div>
          ) : (
            <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 mb-5">
              <p className="text-sm font-bold text-pink-800">❤️ Community Donation</p>
              <p className="text-xs text-pink-600 mt-1">
                This item will be routed through EcoLoop partner NGOs, schools, community organizations, and donation networks to maximize social and environmental impact.
              </p>
            </div>
          )}

          {/* Impact Destination — for donations */}
          {listing.listing_type === 'donation' && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Impact Destinations</p>
              <div className="grid grid-cols-2 gap-3">
                <DestinationCard icon="🏫" label="Schools" desc="Educational institutions in need" />
                <DestinationCard icon="🤝" label="NGOs" desc="Non-profit community organizations" />
                <DestinationCard icon="🏘️" label="Community Centers" desc="Local neighborhood centers" />
                <DestinationCard icon="👨‍👩‍👧‍👦" label="Low-income Families" desc="Families in underserved areas" />
              </div>
            </div>
          )}

          {/* Sustainability Impact */}
          {(snapshot.green_credits || snapshot.co2_savings_kg) && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-5 border border-green-100">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Sustainability Impact</p>
              <div className="flex items-center gap-4">
                <span className="text-sm bg-white text-green-800 font-semibold px-3 py-1.5 rounded-full border border-green-200">
                  🌱 {snapshot.green_credits} Green Credits
                </span>
                <span className="text-sm bg-white text-emerald-800 font-semibold px-3 py-1.5 rounded-full border border-emerald-200">
                  🌍 {snapshot.co2_savings_kg} kg CO₂ Saved
                </span>
              </div>
            </div>
          )}

          {/* Buyer Personas — only for resale/refurbished */}
          {listing.listing_type !== 'donation' && listing.listing_type !== 'recycling' && listing.listing_type !== 'exchange' && personas.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recommended For</p>
              <div className="flex flex-wrap gap-2">
                {personas.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-[#0f1b2d]/5 text-gray-700 font-medium px-3 py-1.5 rounded-full border border-gray-200">
                    <span className="text-green-600">✓</span> {p.label}
                    {p.relevance_score && <span className="text-[10px] text-gray-400 ml-1">{p.relevance_score}/10</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Date */}
          <p className="text-xs text-gray-400 mb-4">
            Listed {listing.created_at ? new Date(listing.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''}
          </p>

          {/* Exchange Potential Matches */}
          {listing.listing_type === 'exchange' && (
            <ExchangeMatches listing={listing} allListings={allListings || []} onSelectMatch={onSelectMatch} />
          )}

          {/* Purchase Confidence — only for resale/refurbished (not donations or recycling) */}
          {listing.listing_type !== 'donation' && listing.listing_type !== 'recycling' && listing.listing_type !== 'exchange' && (
            <PurchaseConfidenceCard listing={listing} snapshot={snapshot} profile={profile} />
          )}

          {/* Donation Impact — only for donation listings */}
          {listing.listing_type === 'donation' && (
            <div className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200 rounded-xl p-5 mb-5">
              <h4 className="text-xs font-bold text-pink-800 uppercase tracking-wide mb-3">❤️ Donation Impact</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white/70 rounded-lg p-3 text-center border border-pink-100">
                  <p className="text-lg font-bold text-pink-900">3-5</p>
                  <p className="text-[9px] text-pink-600">Est. Beneficiaries</p>
                </div>
                <div className="bg-white/70 rounded-lg p-3 text-center border border-pink-100">
                  <p className="text-lg font-bold text-pink-900">4+</p>
                  <p className="text-[9px] text-pink-600">Partner Organizations</p>
                </div>
                <div className="bg-white/70 rounded-lg p-3 text-center border border-pink-100">
                  <p className="text-lg font-bold text-pink-900">🌱 {snapshot.green_credits || 0}</p>
                  <p className="text-[9px] text-pink-600">Green Credits</p>
                </div>
                <div className="bg-white/70 rounded-lg p-3 text-center border border-pink-100">
                  <p className="text-lg font-bold text-pink-900">🌍 {snapshot.co2_savings_kg || 0} kg</p>
                  <p className="text-[9px] text-pink-600">CO₂ Saved</p>
                </div>
              </div>
              <p className="text-[10px] text-pink-600 leading-relaxed">
                This donation will be matched with schools, NGOs, community centers, and families in need through EcoLoop's partner network.
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="border-t border-gray-100 pt-5">
            {interestSent ? (
              <div className="text-center py-3 bg-green-50 rounded-xl border border-green-200">
                <span className="text-2xl block mb-1">✅</span>
                <p className="text-sm font-bold text-green-800">
                  {listing.listing_type === 'donation' ? 'Donation Interest Registered!' : 'Interest Registered!'}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {listing.listing_type === 'donation'
                    ? 'A community partner will be matched with this item.'
                    : 'The seller will be notified of your interest.'}
                </p>
              </div>
            ) : (
              <button
                onClick={onInterest}
                className={`w-full font-bold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg text-sm flex items-center justify-center gap-2 ${
                  listing.listing_type === 'donation'
                    ? 'bg-pink-600 hover:bg-pink-700 text-white'
                    : 'bg-[#f59e0b] hover:bg-[#d97706] text-[#0f1b2d]'
                }`}
              >
                {listing.listing_type === 'donation' ? '❤️ Request Donation' : '💬 Interested in this Product'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DestinationCard({ icon, label, desc }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-100">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        <p className="text-[10px] text-gray-400">{desc}</p>
      </div>
    </div>
  );
}

function RecommendedSection({ listings, onSelect, profile }) {
  // Derive user preferences from profile
  const actionDist = profile?.action_distribution || {};
  const recentAssessments = profile?.recent_assessments || [];

  // Compute top category from recent assessments
  const catCounts = {};
  recentAssessments.forEach((a) => { if (a.product_category) catCounts[a.product_category] = (catCounts[a.product_category] || 0) + 1; });
  const topCategory = Object.entries(catCounts).sort(([,a],[,b]) => b - a)[0]?.[0] || '';

  // Compute top action
  const topAction = Object.entries(actionDist).sort(([,a],[,b]) => b - a)[0]?.[0] || '';

  // Score each listing based on profile match
  // Priority: 1. Category match (+10) 2. Action match (+5) 3. Refurbished boost (+3) 4. Higher sustainability (+1) 5. Newer (+0.5)
  const scored = listings.map((item) => {
    let score = 0;
    const snapshot = item.assessment_snapshot || {};

    // 1. Category match with user's most assessed category
    if (item.product_category === topCategory) score += 10;

    // 2. Listing type match with user's most frequent action
    const listingAction = item.listing_type === 'resale' ? 'resell' : item.listing_type === 'refurbished' ? 'refurbish' : 'donate';
    if (listingAction === topAction) score += 5;

    // 3. Refurbished boost
    if (item.listing_type === 'refurbished') score += 3;

    // 4. Higher sustainability impact
    score += (snapshot.green_credits || 0) * 0.1;

    // 5. More recent
    if (item.created_at) score += 0.5;

    // Determine recommendation reason
    let reason = '';
    if (item.product_category === topCategory) {
      reason = `Recommended because you frequently assess ${topCategory} products`;
    } else if (listingAction === topAction) {
      reason = `Recommended because you often choose ${topAction} actions`;
    } else if (item.listing_type === 'refurbished') {
      reason = 'Recommended: refurbished products have high sustainability impact';
    } else {
      reason = 'Recommended based on your sustainability profile';
    }

    return { ...item, _score: score, _reason: reason };
  });

  // Sort by score descending and take top 3
  scored.sort((a, b) => b._score - a._score);
  const recommended = scored.slice(0, 3);

  if (recommended.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">✨</span>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Recommended For You</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {recommended.map((item) => (
          <div
            key={item.listing_id}
            onClick={() => onSelect(item)}
            className="flex flex-col gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl text-gray-300">📦</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
                <p className="text-xs text-gray-500">{item.listing_type === 'donation' ? '❤️ Free' : `₹${item.suggested_price?.toFixed(0)}`}</p>
                <p className="text-[10px] text-[#f59e0b] font-medium mt-0.5">View Details →</p>
              </div>
            </div>
            {/* Recommendation reason */}
            <p className="text-[9px] text-gray-400 italic leading-tight">{item._reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PurchaseConfidenceCard({ listing, snapshot, profile }) {
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // === Purchase Confidence Formula (DETERMINISTIC) ===
  // Revised: base scaled to 0-70, grade has stronger swing, type penalty for refurbished
  const GRADE_MOD = { A: 15, B: 5, C: -15, D: -30 };
  const rawConfidence = snapshot.confidence_score || 70;
  const baseConfidence = Math.round(rawConfidence * 0.7); // 90→63, 80→56, 70→49
  const gradeMod = GRADE_MOD[listing.condition_grade] || 0;
  const aiVerifiedMod = listing.ai_verified ? 5 : 0;
  const typePenalty = listing.listing_type === 'refurbished' ? -5 : 0;

  // Profile-based personalization
  const recentAssessments = profile?.recent_assessments || [];
  const catCounts = {};
  recentAssessments.forEach((a) => { if (a.product_category) catCounts[a.product_category] = (catCounts[a.product_category] || 0) + 1; });
  const topCategory = Object.entries(catCounts).sort(([,a],[,b]) => b - a)[0]?.[0] || '';
  const topAction = Object.entries(profile?.action_distribution || {}).sort(([,a],[,b]) => b - a)[0]?.[0] || '';

  const categoryMatchMod = listing.product_category === topCategory ? 5 : 0;
  const listingAction = listing.listing_type === 'resale' ? 'resell' : 'refurbish';
  const actionMatchMod = listingAction === topAction ? 3 : 0;

  const rawScore = baseConfidence + gradeMod + aiVerifiedMod + typePenalty + categoryMatchMod + actionMatchMod;
  const purchaseConfidence = Math.max(0, Math.min(100, rawScore));

  // === Return Risk (DETERMINISTIC) ===
  const returnRisk = purchaseConfidence >= 90 ? { level: 'Very Low', color: 'bg-green-100 text-green-800' }
    : purchaseConfidence >= 75 ? { level: 'Low', color: 'bg-emerald-100 text-emerald-800' }
    : purchaseConfidence >= 60 ? { level: 'Medium', color: 'bg-amber-100 text-amber-800' }
    : purchaseConfidence >= 40 ? { level: 'High', color: 'bg-orange-100 text-orange-800' }
    : { level: 'Very High', color: 'bg-red-100 text-red-800' };

  // Fetch AI explanation on mount
  useEffect(() => {
    if (!aiExplanation && !aiLoading) {
      setAiLoading(true);
      fetch('/api/listings/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.listing_id,
          condition_grade: listing.condition_grade,
          confidence_score: baseConfidence,
          purchase_confidence: purchaseConfidence,
          return_risk: returnRisk.level,
          listing_type: listing.listing_type,
          product_category: listing.product_category,
          green_credits: snapshot.green_credits || 0,
          co2_saved: snapshot.co2_savings_kg || 0,
          top_category: topCategory,
          top_action: topAction,
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.explanation) setAiExplanation(data.explanation); })
        .catch(() => {})
        .finally(() => setAiLoading(false));
    }
  }, [listing.listing_id]);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide">🛡️ Purchase Confidence</h4>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${returnRisk.color}`}>
          {returnRisk.level} Return Risk
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white/70 rounded-lg p-3 text-center border border-blue-100">
          <p className="text-xl font-bold text-blue-900">{purchaseConfidence}%</p>
          <p className="text-[9px] text-blue-600">Confidence</p>
        </div>
        <div className="bg-white/70 rounded-lg p-3 text-center border border-blue-100">
          <p className="text-xl font-bold text-blue-900">{returnRisk.level}</p>
          <p className="text-[9px] text-blue-600">Return Risk</p>
        </div>
        <div className="bg-white/70 rounded-lg p-3 text-center border border-blue-100">
          <p className="text-xl font-bold text-blue-900">{listing.ai_verified ? '✓ Yes' : 'No'}</p>
          <p className="text-[9px] text-blue-600">AI Verified</p>
        </div>
      </div>

      {/* AI Insight — Bedrock-generated explanation */}
      <div className="bg-white/80 rounded-lg p-3.5 border border-blue-100">
        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-1.5">🤖 AI Insight</p>
        {aiLoading ? (
          <p className="text-[10px] text-blue-400 italic">Generating explanation...</p>
        ) : aiExplanation ? (
          <p className="text-[11px] text-gray-700 leading-relaxed">{aiExplanation}</p>
        ) : (
          <p className="text-[10px] text-gray-500 italic">AI explanation unavailable</p>
        )}
      </div>
    </div>
  );
}

function getRecoveryPct(listing) {
  const GRADE_BASE = { A: 35, B: 45, C: 60, D: 80 };
  const CAT_MOD = { Electronics: 10, Appliances: 8, Furniture: 5, 'Sports Equipment': 3, Clothing: 0, Toys: -5, Books: -10 };
  const base = GRADE_BASE[listing.condition_grade] || 60;
  const mod = CAT_MOD[listing.product_category] || 0;
  return Math.min(95, Math.max(20, base + mod));
}

function getMaterials(category) {
  const MATS = {
    Electronics: '• Aluminum • Copper • Lithium • Plastic',
    Appliances: '• Steel • Copper • Aluminum • Glass',
    Furniture: '• Wood • Metal • Fabric • Foam',
    Clothing: '• Cotton fiber • Polyester • Nylon',
    Books: '• Paper pulp • Cardboard',
    Toys: '• Plastic • Metal • Electronic components',
    'Sports Equipment': '• Aluminum • Carbon fiber • Rubber',
  };
  return MATS[category] || '• Mixed materials';
}

function getMatchPotential(grade) {
  const MAP = { A: 'High', B: 'High', C: 'Medium', D: 'Low' };
  return MAP[grade] || 'Medium';
}

function ExchangeMatches({ listing, allListings, onSelectMatch }) {
  const myOffered = listing.product_category;
  const myWanted = listing.assessment_snapshot?.wanted_category || '';
  const myId = listing.listing_id;

  // STRICT FILTER: only show listings where other.offered_category == my.wanted_category
  // If myWanted is empty (old listing), show all other exchange listings ranked by grade
  const scored = allListings
    .filter((other) => {
      if (other.listing_id === myId) return false; // no self-recommendation
      if (other.listing_type !== 'exchange') return false;
      if (myWanted && other.product_category !== myWanted) return false; // strict filter when wanted is known
      return true;
    })
    .map((other) => {
      const otherWanted = other.assessment_snapshot?.wanted_category || '';
      let score = 0;
      if (myWanted && other.product_category === myWanted) score += 10; // category match
      if (otherWanted === myOffered) score += 10; // reciprocal = Perfect Match
      const grade = other.condition_grade;
      if (grade === 'A') score += 3;
      else if (grade === 'B') score += 2;
      else if (grade === 'C') score += 1;
      const snap = other.assessment_snapshot || {};
      score += (snap.green_credits || 0) * 0.1; // sustainability bonus
      return { ...other, _matchScore: score };
    })
    .filter((m) => m._matchScore > 0)
    .sort((a, b) => b._matchScore - a._matchScore)
    .slice(0, 3);

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-5">
      <p className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-3">🔄 Potential Exchange Matches</p>
      {scored.length > 0 ? (
        <div className="space-y-2">
          {scored.map((m) => {
            const isPerfect = m._matchScore >= 20;
            return (
              <div
                key={m.listing_id}
                className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-indigo-100 hover:shadow-md hover:border-indigo-300 hover:-translate-y-0.5 transition-all"
              >
                <div
                  className="flex items-center gap-3 flex-1 cursor-pointer"
                  onClick={() => onSelectMatch && onSelectMatch(m)}
                >
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-sm">🔄</div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-800">{m.title || m.product_category}</p>
                    <p className="text-[10px] text-gray-500">Seeking: {m.assessment_snapshot?.wanted_category || 'Not specified'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isPerfect ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {isPerfect ? '✓ Perfect' : 'Match'}
                  </span>
                  {isPerfect && (
                    <ScheduleExchangeBtn parentListingId={listing.listing_id} matchListingId={m.listing_id} />
                  )}
                  <span onClick={() => onSelectMatch && onSelectMatch(m)} className="text-[9px] text-indigo-500 font-medium cursor-pointer hover:text-indigo-700">View →</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-indigo-600">No matching exchange listings found yet.{myWanted ? ` Looking for listings offering ${myWanted}.` : ''} New matches will appear as more users list items.</p>
      )}
    </div>
  );
}

function DirectExchangeModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [offering, setOffering] = useState('');
  const [wanted, setWanted] = useState('');
  const [desc, setDesc] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const CATS = ['Electronics', 'Books', 'Furniture', 'Clothing', 'Toys', 'Appliances', 'Sports Equipment'];

  async function handleSubmit() {
    if (!file) return setError('Product photo is required.');
    if (!offering) return setError('Please select what you are offering.');
    if (!wanted) return setError('Please select what you want in exchange.');
    setError(''); setStatus('uploading');

    try {
      // Upload image first
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { image_key } = await uploadRes.json();

      // Create exchange listing
      setStatus('publishing');
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({
          assessment_id: 'direct-exchange',
          image_key,
          product_category: offering,
          listing_type: 'exchange',
          assessment_snapshot: {
            condition_grade: 'B', confidence_score: 80,
            grade_explanation: 'User-listed exchange item.',
            action_recommendation: 'exchange', action_reasoning: 'User chose exchange pathway.',
            resale_value: { min: 0, max: 0, display: 'Exchange' },
            green_credits: 5, co2_savings_kg: 1.5, buyer_personas: [],
            wanted_category: wanted, wanted_description: desc,
          },
        }),
      });
      if (!res.ok) throw new Error('Listing failed');
      setStatus('success');
    } catch (e) { setError(e.message || 'Failed'); setStatus(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-1">🔄 Create Exchange Listing</h3>
        <p className="text-xs text-gray-500 mb-4">Upload a photo of the item you want to exchange.</p>

        {status === 'success' ? (
          <div className="text-center py-4">
            <span className="text-3xl block mb-2">✅</span>
            <p className="font-bold text-green-800">Exchange listing created!</p>
            <button onClick={onSuccess} className="mt-3 text-sm text-indigo-600 font-medium">Close</button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Photo Upload — MANDATORY */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Photo *</label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-indigo-400 cursor-pointer transition-colors"
                onClick={() => document.getElementById('ex-file-input').click()}
              >
                {preview ? (
                  <img src={preview} alt="Preview" className="max-h-32 mx-auto rounded-lg" />
                ) : (
                  <div className="text-gray-400">
                    <p className="text-sm font-medium">📸 Click to upload</p>
                    <p className="text-[10px]">JPEG, PNG, WebP — required</p>
                  </div>
                )}
              </div>
              <input id="ex-file-input" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } }} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Offering Category *</label>
              <select value={offering} onChange={(e) => setOffering(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm">
                <option value="">What are you offering?</option>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wanted Category *</label>
              <select value={wanted} onChange={(e) => setWanted(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm">
                <option value="">What do you want?</option>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
              <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder='e.g. "Looking for Android tablet"' className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </div>

            {error && <p className="text-red-600 text-xs">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={handleSubmit} disabled={status === 'uploading' || status === 'publishing'} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all disabled:bg-gray-300">
                {status === 'uploading' ? '📸 Uploading...' : status === 'publishing' ? 'Creating...' : '🔄 Create Exchange'}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleExchangeBtn({ parentListingId, matchListingId }) {
  const [status, setStatus] = useState(null);

  async function handleClick(e) {
    e.stopPropagation();
    if (status) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/exchange/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({ listing_id_a: parentListingId, listing_id_b: matchListingId }),
      });
      if (res.ok) setStatus('done');
      else setStatus(null);
    } catch { setStatus(null); }
  }

  if (status === 'done') return <span className="text-[9px] text-green-700 font-bold">✅ Scheduled</span>;

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className="text-[8px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2 py-1 rounded-md transition-all disabled:opacity-50"
    >
      {status === 'loading' ? '...' : 'Schedule'}
    </button>
  );
}
