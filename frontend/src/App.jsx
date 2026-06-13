import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import { getSessionId } from './services/api';

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [dashData, setDashData] = useState(null);
  const location = useLocation();

  useEffect(() => { fetchDash(); }, []);

  async function fetchDash() {
    try {
      const res = await fetch('/api/dashboard', { headers: { 'x-session-id': getSessionId() } });
      if (res.ok) setDashData(await res.json());
    } catch { /* silent */ }
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col">
      {/* Navigation */}
      <header className="bg-[#0f1b2d] text-white sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 py-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="text-2xl">🌱</span>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-white group-hover:text-[#f59e0b] transition-colors">EcoLoop</span>
              <span className="text-[#f59e0b]"> AI</span>
            </span>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            <HeaderLink to="/" active={location.pathname === '/'}>Home</HeaderLink>
            <HeaderLink to="/?assess=1" active={false}>Assess</HeaderLink>
            <HeaderLink to="/marketplace" active={location.pathname === '/marketplace'}>Marketplace</HeaderLink>
            <HeaderLink to="/dashboard" active={location.pathname === '/dashboard'}>Dashboard</HeaderLink>
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {/* Green Credits Badge */}
            <Link to="/dashboard" className="flex items-center gap-2 bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-bold px-3.5 py-2 rounded-full transition-all shadow-md">
              <span>🌱</span>
              <span>{dashData?.total_green_credits || 0}</span>
              <span className="hidden sm:inline text-green-200 font-normal">Green Credits</span>
            </Link>
            {/* User Avatar */}
            <div className="flex items-center gap-2 ml-2">
              <div className="w-8 h-8 bg-[#f59e0b] rounded-full flex items-center justify-center text-xs font-bold text-[#0f1b2d]">
                AG
              </div>
              <span className="hidden lg:block text-sm text-gray-300">Ananya Gupta</span>
            </div>
          </div>
        </div>
        {/* Orange accent line */}
        <div className="h-[3px] bg-gradient-to-r from-[#f59e0b] via-[#f97316] to-[#eab308]" />
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-5 py-6">
          <Routes>
            <Route path="/" element={<UploadPage dashData={dashData} onAssessmentComplete={fetchDash} />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0f1b2d] text-white py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            <FooterItem icon="🔒" title="Secure & Private" desc="Your data is encrypted and never shared." />
            <FooterItem icon="🤖" title="AI-Powered Analysis" desc="5 specialized agents working together for accurate results." />
            <FooterItem icon="🌍" title="Sustainable Future" desc="Every action you take makes a real environmental impact." />
            <div className="text-right">
              <p className="text-xl font-bold">Small Actions,</p>
              <p className="text-xl font-bold text-[#f59e0b]">Big Impact.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeaderLink({ to, active, children }) {
  return (
    <Link to={to} className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors ${active ? 'text-[#f59e0b]' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}>
      {children}
    </Link>
  );
}

function FooterItem({ icon, title, desc }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-2xl mt-0.5">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </div>
  );
}

export default App;
