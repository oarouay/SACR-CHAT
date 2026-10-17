import React, { useState, useEffect, useRef } from 'react';
import { authApi } from '../api/client';
import {
  Eye,
  EyeOff,
  X,
  Sun,
  Moon,
  Laptop,
  Check
} from 'lucide-react';

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  isStandalone = false,
  theme,
  setTheme
}) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign In form fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSlug, setLoginSlug] = useState('');

  // Register form fields
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenantDesc, setTenantDesc] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const firstInputRef = useRef(null);

  // Keyboard navigation: Escape key closes modal (only when not standalone)
  useEffect(() => {
    if (!isOpen || isStandalone) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isStandalone, onClose]);

  // Autofocus when mode changes
  useEffect(() => {
    if (isOpen || isStandalone) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mode, isOpen, isStandalone]);

  if (!isOpen && !isStandalone) return null;

  // Auto-generate clean slug from organization name
  const handleNameChange = (e) => {
    const val = e.target.value;
    setTenantName(val);
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setTenantSlug(slug);
  };

  // Demo credentials fill
  const handleFillDemo = (e) => {
    e.preventDefault();
    setMode('login');
    setLoginEmail('admin@acme.com');
    setLoginPassword('StrongPassword123!');
    setLoginSlug('acme');
    setError('');
  };

  // Form submission: Sign In
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = loginEmail.trim().toLowerCase();
    const trimmedSlug = loginSlug.trim().toLowerCase();

    if (!trimmedEmail) {
      setError('Please provide your work email.');
      return;
    }
    if (!loginPassword) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      await authApi.login(trimmedEmail, loginPassword, trimmedSlug || undefined);
      const meData = await authApi.getMe();
      onAuthSuccess(meData, { isNewRegistration: false });
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Form submission: Register Tenant & Initial Admin
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanName = tenantName.trim();
    const cleanSlug = tenantSlug.trim().toLowerCase();
    const cleanAdminName = adminName.trim();
    const cleanEmail = adminEmail.trim().toLowerCase();

    if (!cleanName) {
      setError('Please enter your organization name.');
      return;
    }
    if (!cleanSlug || !/^[a-z0-9-]+$/.test(cleanSlug)) {
      setError('Workspace identifier must contain only lowercase letters, numbers, and hyphens.');
      return;
    }
    if (!cleanAdminName) {
      setError('Please enter the administrator name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please provide a valid work email.');
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await authApi.registerTenant({
        tenant_name: cleanName,
        tenant_slug: cleanSlug,
        tenant_description: tenantDesc.trim() || undefined,
        admin_name: cleanAdminName,
        admin_email: cleanEmail,
        admin_password: adminPassword,
      });
      const meData = await authApi.getMe();
      onAuthSuccess(meData, { isNewRegistration: true, tenantName: cleanName });
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Registration failed. The workspace identifier or email may already be registered.');
    } finally {
      setLoading(false);
    }
  };

  // Theme Toggle Helper
  const cycleTheme = () => {
    if (!setTheme) return;
    if (theme === 'dark') setTheme('light');
    else if (theme === 'light') setTheme('system');
    else setTheme('dark');
  };

  // Form Contents
  const formContent = (
    <div className="auth-form-wrap">
      {/* Mobile Top Brand (hidden on desktop) */}
      <div className="auth-mobile-brand">
        <div className="auth-brand-logo">OG</div>
        <div>
          <div className="auth-brand-title">OmniGraph</div>
          <div className="auth-brand-desc">Enterprise knowledge infrastructure</div>
        </div>
      </div>

      {/* Screen Title & Subtitle */}
      <h1 className="auth-heading">
        {mode === 'login' ? 'Welcome back' : 'Create your workspace'}
      </h1>
      <p className="auth-subheading">
        {mode === 'login'
          ? 'Sign in to your OmniGraph workspace.'
          : 'Set up your organization and administrator account.'}
      </p>

      {/* Error state */}
      {error && (
        <div className="auth-error-card" role="alert">
          {error}
        </div>
      )}

      {/* Mode = LOGIN */}
      {mode === 'login' ? (
        <form onSubmit={handleLoginSubmit} noValidate>
          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="login-email" className="auth-label">Work email</label>
            </div>
            <input
              id="login-email"
              ref={firstInputRef}
              type="email"
              required
              autoComplete="email"
              placeholder="name@company.com"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="login-password" className="auth-label">Password</label>
            </div>
            <div className="auth-input-group">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="auth-input"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-password-toggle"
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="login-slug" className="auth-label">Workspace</label>
              <span className="auth-label-optional">Optional</span>
            </div>
            <input
              id="login-slug"
              type="text"
              autoComplete="organization"
              placeholder="acme"
              value={loginSlug}
              onChange={(e) => setLoginSlug(e.target.value.toLowerCase().trim())}
              className="auth-input"
            />
            <div className="auth-helper-text">
              Leave blank to detect it from your account.
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-btn-primary"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {/* Switch to Register */}
          <div className="auth-switch-prompt">
            <span>New to OmniGraph?</span>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className="auth-link"
            >
              Create an account →
            </button>
          </div>

          {/* Subdued Demo Credentials */}
          <div className="auth-demo-section">
            <span>Using the demo?</span>
            <button
              type="button"
              onClick={handleFillDemo}
              className="auth-demo-link"
            >
              Use demo workspace →
            </button>
          </div>
        </form>
      ) : (
        /* Mode = REGISTER */
        <form onSubmit={handleRegisterSubmit} noValidate>
          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="reg-name" className="auth-label">Organization name</label>
            </div>
            <input
              id="reg-name"
              ref={firstInputRef}
              type="text"
              required
              autoComplete="organization"
              placeholder="Acme Corp"
              value={tenantName}
              onChange={handleNameChange}
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="reg-slug" className="auth-label">Workspace identifier</label>
            </div>
            <input
              id="reg-slug"
              type="text"
              required
              placeholder="acme"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))}
              className="auth-input"
            />
            <div className="auth-helper-text">
              Lowercase identifier used for your tenant URL and storage.
            </div>
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="reg-admin-name" className="auth-label">Full name</label>
            </div>
            <input
              id="reg-admin-name"
              type="text"
              required
              autoComplete="name"
              placeholder="Jane Doe"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="reg-admin-email" className="auth-label">Work email</label>
            </div>
            <input
              id="reg-admin-email"
              type="email"
              required
              autoComplete="email"
              placeholder="jane@acme.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="reg-admin-password" className="auth-label">Password</label>
            </div>
            <div className="auth-input-group">
              <input
                id="reg-admin-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="••••••••••••"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="auth-input"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-password-toggle"
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="auth-helper-text">
              Minimum 6 characters.
            </div>
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="reg-desc" className="auth-label">Workspace description</label>
              <span className="auth-label-optional">Optional</span>
            </div>
            <input
              id="reg-desc"
              type="text"
              placeholder="Internal engineering knowledge base"
              value={tenantDesc}
              onChange={(e) => setTenantDesc(e.target.value)}
              className="auth-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-btn-primary"
          >
            {loading ? 'Creating workspace…' : 'Create workspace'}
          </button>

          {/* Switch to Sign In */}
          <div className="auth-switch-prompt">
            <span>Already have an account?</span>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className="auth-link"
            >
              Sign in →
            </button>
          </div>
        </form>
      )}
    </div>
  );

  // If invoked as a dialog modal from inside the active workspace
  if (!isStandalone) {
    return (
      <div
        className="auth-modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) onClose();
        }}
      >
        <div className="auth-modal-dialog">
          {onClose && (
            <button
              onClick={onClose}
              className="btn-ghost"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                padding: '4px',
                borderRadius: '6px',
                color: 'var(--text-muted)'
              }}
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          )}
          {formContent}
        </div>
      </div>
    );
  }

  // Standalone Full-Bleed Authentication Page
  return (
    <div className="auth-layout">
      {/* Left Column: Subtle Product Context */}
      <div className="auth-left-pane">
        {/* Top: Logo & descriptor */}
        <div className="auth-brand-header">
          <div className="auth-brand-logo">OG</div>
          <div>
            <div className="auth-brand-title">OmniGraph</div>
            <div className="auth-brand-desc">Enterprise knowledge infrastructure</div>
          </div>
        </div>

        {/* Middle: Headline, paragraph & capabilities */}
        <div className="auth-left-body">
          <h2 className="auth-headline">
            Your organization’s knowledge,<br />grounded and connected.
          </h2>
          <p className="auth-paragraph">
            Connect documents, vector search, and knowledge graphs in a secure, isolated workspace.
          </p>

          <div className="auth-capability-list">
            <div className="auth-capability-item">
              <span className="auth-check-icon">✓</span>
              <span>Tenant-isolated knowledge</span>
            </div>
            <div className="auth-capability-item">
              <span className="auth-check-icon">✓</span>
              <span>Verifiable source citations</span>
            </div>
            <div className="auth-capability-item">
              <span className="auth-check-icon">✓</span>
              <span>Graph + semantic retrieval</span>
            </div>
          </div>
        </div>

        {/* Bottom indicator */}
        <div className="auth-left-footer">
          Enterprise Edition · Multi-tenant architecture
        </div>
      </div>

      {/* Right Column: Restrained Authentication Form */}
      <div className="auth-right-pane">
        {/* Minimal theme toggle button in the top corner */}
        {setTheme && (
          <button
            onClick={cycleTheme}
            className="auth-theme-btn"
            title={`Current theme: ${theme}`}
            aria-label={`Toggle theme (currently ${theme})`}
          >
            {theme === 'light' ? <Sun size={13} /> : theme === 'dark' ? <Moon size={13} /> : <Laptop size={13} />}
            <span style={{ textTransform: 'capitalize' }}>{theme}</span>
          </button>
        )}

        {formContent}
      </div>
    </div>
  );
}
