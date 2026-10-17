import React, { useState, useEffect } from 'react';
import SidebarNav from './components/SidebarNav';
import ChatStudio from './components/ChatStudio';
import SourceManager from './components/SourceManager';
import GraphExplorer from './components/GraphExplorer';
import Assistant from './components/Assistant';
import AIProfileAdmin from './components/AIProfileAdmin';
import OnboardingWizard from './components/OnboardingWizard';
import Integrations from './components/Integrations';
import AuthModal from './components/AuthModal';
import { ConfirmProvider } from './components/ConfirmModal';
import { authApi, getStoredToken } from './api/client';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('ask');
  const [tenant, setTenant] = useState(null);
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Cross-page navigation context (e.g. asking about a specific source)
  const [sourceScope, setSourceScope] = useState(null);

  // Theme Management: 'system' | 'light' | 'dark'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('omnigraph_theme') || 'system';
  });

  useEffect(() => {
    const applyTheme = () => {
      let resolvedTheme = theme;
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolvedTheme = prefersDark ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      localStorage.setItem('omnigraph_theme', theme);
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  useEffect(() => {
    const initAuth = async () => {
      const token = getStoredToken();
      if (token) {
        try {
          const meData = await authApi.getMe();
          setUser(meData.user);
          setTenant(meData.tenant);
        } catch (err) {
          console.warn('Stored token expired or invalid:', err);
          authApi.logout();
        }
      }
      setInitializing(false);
    };

    initAuth();
  }, []);

  const handleAuthSuccess = (meData, options = {}) => {
    setUser(meData.user);
    setTenant(meData.tenant);
    setAuthModalOpen(false);
    if (options.isNewRegistration) {
      setShowOnboarding(true);
    }
  };

  const handleLogout = () => {
    authApi.logout();
    setUser(null);
    setTenant(null);
    setShowOnboarding(false);
  };

  const handleNavigateToAsk = (scope) => {
    setSourceScope(scope);
    setActiveTab('ask');
  };

  // 1. Initial Loading Splash
  if (initializing) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={26} className="spin" style={{ margin: '0 auto 12px auto', color: 'var(--accent-primary)' }} />
          <div style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '-0.01em' }}>Connecting to GraphRAG Cluster...</div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State: Dedicated High-Craft Authentication & Onboarding View
  if (!tenant) {
    return (
      <ConfirmProvider>
        <AuthModal
          isOpen={true}
          isStandalone={true}
          onAuthSuccess={handleAuthSuccess}
          theme={theme}
          setTheme={setTheme}
        />
      </ConfirmProvider>
    );
  }

  // 3. Authenticated Workspace Shell
  return (
    <ConfirmProvider>
      <div className="app-shell">
        {/* Persistent Left Navigation Shell */}
        <SidebarNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tenant={tenant}
          user={user}
          theme={theme}
          setTheme={setTheme}
          onLogout={handleLogout}
          onOpenAuthModal={() => setAuthModalOpen(true)}
        />

        {/* Main Workspace Canvas */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {showOnboarding ? (
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-canvas)' }}>
              <OnboardingWizard
                initialTenantName={tenant?.name || ''}
                onComplete={() => {
                  setShowOnboarding(false);
                  setActiveTab('ai-profile');
                }}
                onCancel={() => {
                  setShowOnboarding(false);
                  setActiveTab('ask');
                }}
              />
            </div>
          ) : (
            <>
              {activeTab === 'ask' && (
                <ChatStudio initialSourceScope={sourceScope} />
              )}
              {activeTab === 'knowledge' && (
                <SourceManager onNavigateToAsk={handleNavigateToAsk} />
              )}
              {activeTab === 'explore' && (
                <GraphExplorer onNavigateToSources={() => setActiveTab('knowledge')} />
              )}
              {activeTab === 'ai-profile' && (
                <AIProfileAdmin tenant={tenant} />
              )}
              {activeTab === 'assistant' && (
                <Assistant tenant={tenant} />
              )}
              {activeTab === 'integrations' && (
                <Integrations tenant={tenant} />
              )}
            </>
          )}
        </main>

        {/* In-app Organization Switch / Tenant Modal */}
        <AuthModal
          isOpen={authModalOpen}
          isStandalone={false}
          onClose={() => setAuthModalOpen(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      </div>
    </ConfirmProvider>
  );
}
