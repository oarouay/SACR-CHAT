import React, { useState, useEffect } from 'react';
import { apiKeysApi, personasApi } from '../api/client';
import { 
  KeyRound, 
  Plus, 
  RotateCw, 
  Trash2, 
  Copy, 
  Check, 
  AlertTriangle, 
  Clock, 
  Shield, 
  BarChart3, 
  X, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Code
} from 'lucide-react';

export default function ApiKeyManager({ tenant }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState(null); // { id, name, key, masked_key }
  const [rotateTargetKey, setRotateTargetKey] = useState(null);
  const [revokeTargetKey, setRevokeTargetKey] = useState(null);
  const [usageTargetKey, setUsageTargetKey] = useState(null);
  const [keyUsageData, setKeyUsageData] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // Form states for creation
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('never'); // '30', '90', '365', 'never'
  const [newKeyPersonaId, setNewKeyPersonaId] = useState('');
  const [personas, setPersonas] = useState([]);
  const [newKeyScopes, setNewKeyScopes] = useState([
    'chat:read',
    'chat:write',
    'sources:read',
    'sources:write'
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
    } catch (err) {
      setError(err.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonas = async () => {
    try {
      const list = await personasApi.list();
      setPersonas(list || []);
    } catch (err) {
      console.warn('Failed to load personas for API key manager:', err);
    }
  };

  useEffect(() => {
    fetchKeys();
    fetchPersonas();
  }, []);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    let expiresAt = null;
    if (newKeyExpiry !== 'never') {
      const days = parseInt(newKeyExpiry, 10);
      const d = new Date();
      d.setDate(d.getDate() + days);
      expiresAt = d.toISOString();
    }

    try {
      const res = await apiKeysApi.create({
        name: newKeyName.trim(),
        expires_at: expiresAt,
        scopes: newKeyScopes,
        persona_id: newKeyPersonaId ? parseInt(newKeyPersonaId, 10) : null
      });

      // Show one-time secret modal
      setCreatedKeyData(res);
      setCreateModalOpen(false);
      setNewKeyName('');
      setNewKeyExpiry('never');
      setNewKeyPersonaId('');
      fetchKeys();
    } catch (err) {
      setError(err.message || 'Failed to generate API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRotateKey = async () => {
    if (!rotateTargetKey || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiKeysApi.rotate(rotateTargetKey.id);
      setRotateTargetKey(null);
      setCreatedKeyData(res); // Show new key once
      fetchKeys();
    } catch (err) {
      setError(err.message || 'Failed to rotate API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeTargetKey || submitting) return;
    setSubmitting(true);
    try {
      await apiKeysApi.revoke(revokeTargetKey.id);
      setRevokeTargetKey(null);
      fetchKeys();
    } catch (err) {
      setError(err.message || 'Failed to revoke API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewUsage = async (key) => {
    setUsageTargetKey(key);
    setUsageLoading(true);
    setKeyUsageData(null);
    try {
      const data = await apiKeysApi.getUsage(key.id);
      setKeyUsageData(data);
    } catch (err) {
      console.warn('Failed to fetch key usage:', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Banner / Actions Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              API Keys
            </h2>
            <span style={{
              fontSize: '11px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'var(--accent-primary-subtle)',
              color: 'var(--accent-primary)',
              border: '1px solid var(--accent-primary-border)'
            }}>
              REST & Streaming
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
            Secure credentials for connecting your website, mobile apps, or backend services.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: 'var(--accent-primary)',
            color: 'var(--accent-primary-contrast)',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'background var(--transition-fast)'
          }}
        >
          <Plus size={15} />
          Create API Key
        </button>
      </div>

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--accent-rose-subtle)',
          border: '1px solid var(--accent-rose-border)',
          color: 'var(--accent-rose-text)',
          fontSize: '13px',
          marginBottom: '20px'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Keys Table Container */}
      <div style={{
        background: 'var(--bg-surface-1)',
        borderRadius: '12px',
        border: '1px solid var(--border-hairline)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Loading API credentials...
          </div>
        ) : keys.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--bg-surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: 'var(--text-muted)'
            }}>
              <KeyRound size={22} />
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              No API Keys Created
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 20px auto' }}>
              Create an API key to securely connect external systems and applications.
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'var(--accent-primary)',
                color: 'var(--accent-primary-contrast)',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Plus size={15} />
              Generate First Key
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{
                borderBottom: '1px solid var(--border-hairline)',
                background: 'var(--bg-surface-2)',
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                <th style={{ padding: '12px 16px' }}>Name</th>
                <th style={{ padding: '12px 16px' }}>Key Identifier</th>
                <th style={{ padding: '12px 16px' }}>Persona</th>
                <th style={{ padding: '12px 16px' }}>Scopes</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Created</th>
                <th style={{ padding: '12px 16px' }}>Last Used</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr
                  key={k.id}
                  style={{
                    borderBottom: '1px solid var(--border-hairline)',
                    transition: 'background var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Name */}
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {k.name}
                  </td>

                  {/* Masked Key */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        background: 'var(--bg-surface-2)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-hairline)'
                      }}>
                        {k.masked_key}
                      </code>
                      <button
                        onClick={() => copyToClipboard(k.key_prefix)}
                        title="Copy Prefix Identifier"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </td>

                  {/* Persona */}
                  <td style={{ padding: '14px 16px' }}>
                    {k.persona_name ? (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: '#818CF8',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}>
                        {k.persona_name}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Default
                      </span>
                    )}
                  </td>

                  {/* Scopes */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {k.scopes?.map((sc) => (
                        <span
                          key={sc}
                          style={{
                            fontSize: '10px',
                            fontWeight: 500,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--bg-surface-3)',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)'
                          }}
                        >
                          {sc}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 16px' }}>
                    {k.is_active && !k.revoked_at ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: 'var(--accent-emerald-text)',
                        background: 'var(--accent-emerald-subtle)',
                        padding: '2px 8px',
                        borderRadius: '12px'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-emerald)' }} />
                        Active
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: 'var(--accent-rose-text)',
                        background: 'var(--accent-rose-subtle)',
                        padding: '2px 8px',
                        borderRadius: '12px'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-rose)' }} />
                        Revoked
                      </span>
                    )}
                  </td>

                  {/* Created */}
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDate(k.created_at)}
                  </td>

                  {/* Last Used */}
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {k.last_used_at ? formatDate(k.last_used_at) : 'Never'}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleViewUsage(k)}
                        title="View Key Telemetry & Usage"
                        style={{
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-hairline)',
                          borderRadius: '6px',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '6px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 500
                        }}
                      >
                        <BarChart3 size={13} />
                        Usage
                      </button>

                      {k.is_active && (
                        <>
                          <button
                            onClick={() => setRotateTargetKey(k)}
                            title="Rotate Key Secret"
                            style={{
                              background: 'var(--bg-surface-2)',
                              border: '1px solid var(--border-hairline)',
                              borderRadius: '6px',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 500
                            }}
                          >
                            <RotateCw size={13} />
                            Rotate
                          </button>

                          <button
                            onClick={() => setRevokeTargetKey(k)}
                            title="Revoke Key"
                            style={{
                              background: 'var(--accent-rose-subtle)',
                              border: '1px solid var(--accent-rose-border)',
                              borderRadius: '6px',
                              color: 'var(--accent-rose-text)',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Code Authentication Quick Reference */}
      <div style={{
        marginTop: '28px',
        padding: '20px',
        background: 'var(--bg-surface-1)',
        borderRadius: '12px',
        border: '1px solid var(--border-hairline)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Code size={16} style={{ color: 'var(--accent-primary)' }} />
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Programmatic API Authentication Header
          </h4>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Pass your secret key in the <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>X-API-Key</code> request header.
        </p>
        <div style={{
          background: 'var(--bg-canvas)',
          padding: '14px 16px',
          borderRadius: '8px',
          border: '1px solid var(--border-hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-primary)',
          overflowX: 'auto',
          lineHeight: '1.6'
        }}>
          curl -X POST "{window.location.origin}/api/v1/chat/conversations" \<br />
          &nbsp;&nbsp;-H "X-API-Key: ogr_live_••••••••" \<br />
          &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
          &nbsp;&nbsp;-d '{`{"title": "External Chat"}`}'
        </div>
      </div>

      {/* MODAL 1: Create New Key */}
      {createModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface-1)',
            borderRadius: '14px',
            border: '1px solid var(--border-hairline)',
            width: '100%',
            maxWidth: '480px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Generate Developer API Key
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateKey} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Key Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production Backend, Slack Bot, CI Ingestion"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Expiration
                </label>
                <select
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="never">No Expiration</option>
                  <option value="30">30 Days</option>
                  <option value="90">90 Days</option>
                  <option value="365">1 Year</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Assigned Persona
                </label>
                <select
                  value={newKeyPersonaId}
                  onChange={(e) => setNewKeyPersonaId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">Default Organization Persona (Automatic)</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.role} {p.is_default ? '(Org Default)' : ''}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
                  Programmatic calls made with this key will inherit this persona's tone, role, and instructions.
                </p>
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Permission Scopes
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'chat:read', label: 'Chat Read', desc: 'View sessions' },
                    { id: 'chat:write', label: 'Chat Write', desc: 'Send & stream AI' },
                    { id: 'sources:read', label: 'Sources Read', desc: 'List documents' },
                    { id: 'sources:write', label: 'Sources Write', desc: 'Ingest data' },
                  ].map((sc) => {
                    const isChecked = newKeyScopes.includes(sc.id);
                    return (
                      <label
                        key={sc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: isChecked ? 'var(--accent-primary-subtle)' : 'var(--bg-surface-2)',
                          border: isChecked ? '1px solid var(--accent-primary-border)' : '1px solid var(--border-hairline)',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewKeyScopes([...newKeyScopes, sc.id]);
                            } else {
                              setNewKeyScopes(newKeyScopes.filter((s) => s !== sc.id));
                            }
                          }}
                          style={{ marginTop: '2px' }}
                        />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{sc.label}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{sc.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--border-hairline)',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newKeyName.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--accent-primary)',
                    color: 'var(--accent-primary-contrast)',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.7 : 1
                  }}
                >
                  {submitting ? 'Generating...' : 'Create Secret'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: One-Time Key Display Modal */}
      {createdKeyData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface-1)',
            borderRadius: '14px',
            border: '1px solid var(--border-hairline)',
            width: '100%',
            maxWidth: '520px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '24px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'var(--accent-emerald-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-emerald)',
                marginBottom: '16px'
              }}>
                <CheckCircle2 size={24} />
              </div>

              <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                API Key Generated Successfully
              </h3>

              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'var(--accent-amber-subtle)',
                border: '1px solid var(--accent-amber-border)',
                color: 'var(--accent-amber-text)',
                fontSize: '12px',
                lineHeight: '1.5',
                marginBottom: '18px'
              }}>
                <strong>Important:</strong> Copy your secret key now. For your security, this key will <strong>never be shown again</strong> once you close this window.
              </div>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Key for "{createdKeyData.name}"
              </label>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '22px'
              }}>
                <code style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-all',
                  flex: 1
                }}>
                  {createdKeyData.key}
                </code>
                <button
                  onClick={() => copyToClipboard(createdKeyData.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginLeft: '12px',
                    padding: '7px 12px',
                    borderRadius: '6px',
                    background: copiedKey ? 'var(--accent-emerald)' : 'var(--bg-surface-2)',
                    color: copiedKey ? '#fff' : 'var(--text-primary)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                  {copiedKey ? 'Copied!' : 'Copy Key'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setCreatedKeyData(null)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: 'var(--accent-primary)',
                    color: 'var(--accent-primary-contrast)',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  I have saved this key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Rotate Confirmation Modal */}
      {rotateTargetKey && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface-1)',
            borderRadius: '14px',
            border: '1px solid var(--border-hairline)',
            width: '100%',
            maxWidth: '460px',
            boxShadow: 'var(--shadow-lg)',
            padding: '24px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--accent-amber-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-amber)',
              marginBottom: '16px'
            }}>
              <RotateCw size={20} />
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Rotate Key "{rotateTargetKey.name}"?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
              Rotating this credential will <strong>immediately invalidate</strong> the current key. Any external services or automated agents using this key will fail to authenticate until updated with the new credential.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setRotateTargetKey(null)}
                disabled={submitting}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRotateKey}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'var(--accent-amber)',
                  color: '#000',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: submitting ? 'wait' : 'pointer'
                }}
              >
                {submitting ? 'Rotating...' : 'Rotate & Show New Secret'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Revoke Confirmation Modal */}
      {revokeTargetKey && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface-1)',
            borderRadius: '14px',
            border: '1px solid var(--border-hairline)',
            width: '100%',
            maxWidth: '460px',
            boxShadow: 'var(--shadow-lg)',
            padding: '24px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--accent-rose-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-rose)',
              marginBottom: '16px'
            }}>
              <AlertTriangle size={20} />
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Revoke Key "{revokeTargetKey.name}"?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
              Applications using this API key will <strong>immediately lose access</strong>. Historical usage data and telemetry records will remain safely preserved in the database.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setRevokeTargetKey(null)}
                disabled={submitting}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRevokeKey}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'var(--accent-rose)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: submitting ? 'wait' : 'pointer'
                }}
              >
                {submitting ? 'Revoking...' : 'Revoke Key Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Key Usage Telemetry Drawer / Modal */}
      {usageTargetKey && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface-1)',
            borderRadius: '14px',
            border: '1px solid var(--border-hairline)',
            width: '100%',
            maxWidth: '560px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Usage Telemetry — {usageTargetKey.name}
                </h3>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {usageTargetKey.masked_key}
                </span>
              </div>
              <button
                onClick={() => setUsageTargetKey(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {usageLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Loading key analytics...
                </div>
              ) : keyUsageData ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ padding: '14px', background: 'var(--bg-surface-2)', borderRadius: '8px', border: '1px solid var(--border-hairline)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Calls</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {keyUsageData.total_requests.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--bg-surface-2)', borderRadius: '8px', border: '1px solid var(--border-hairline)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Tokens Used</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {keyUsageData.total_tokens.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--bg-surface-2)', borderRadius: '8px', border: '1px solid var(--border-hairline)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Errors</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: keyUsageData.error_count > 0 ? 'var(--accent-rose)' : 'var(--text-primary)' }}>
                        {keyUsageData.error_count}
                      </div>
                    </div>
                  </div>

                  <h5 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    Recent Daily Activity
                  </h5>
                  {keyUsageData.daily && keyUsageData.daily.length > 0 ? (
                    <div style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      borderRadius: '8px',
                      border: '1px solid var(--border-hairline)'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-surface-3)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>
                            <th style={{ padding: '8px 12px' }}>Date</th>
                            <th style={{ padding: '8px 12px' }}>Requests</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Tokens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keyUsageData.daily.map((d) => (
                            <tr key={d.date} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{d.date}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{d.requests}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--accent-primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                                {d.tokens.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                      No daily records recorded yet for this credential.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Unable to load telemetry metrics.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
