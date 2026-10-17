import React, { useState, useEffect } from 'react';
import { analyticsApi } from '../api/client';
import { 
  Activity, 
  MessageSquare, 
  Zap, 
  Users, 
  Cpu, 
  Clock, 
  AlertOctagon, 
  RefreshCw, 
  Calendar,
  ArrowUpRight,
  TrendingUp,
  BarChart2
} from 'lucide-react';

export default function ObservabilityDashboard({ tenant }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [periodDays, setPeriodDays] = useState(30); // 7 | 30 | 90

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const toDate = new Date().toISOString().split('T')[0];
      const fromDateObj = new Date();
      fromDateObj.setDate(fromDateObj.getDate() - periodDays);
      const fromDate = fromDateObj.toISOString().split('T')[0];

      const data = await analyticsApi.getTenantAnalytics({ from: fromDate, to: toDate });
      setAnalytics(data);
    } catch (err) {
      setError(err.message || 'Failed to load usage metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [periodDays]);

  const cards = [
    {
      title: 'Total Messages',
      value: analytics ? analytics.messages.toLocaleString() : '—',
      icon: MessageSquare,
      color: 'var(--accent-primary)',
      subtext: 'Chat & streaming queries'
    },
    {
      title: 'API Requests',
      value: analytics ? analytics.api_requests.toLocaleString() : '—',
      icon: Zap,
      color: 'var(--accent-cyan)',
      subtext: 'Direct integration requests'
    },
    {
      title: 'Tokens Consumed',
      value: analytics ? analytics.total_tokens.toLocaleString() : '—',
      icon: Cpu,
      color: '#A78BFA',
      subtext: `${analytics?.input_tokens?.toLocaleString() || 0} in / ${analytics?.output_tokens?.toLocaleString() || 0} out`
    },
    {
      title: 'Active Users',
      value: analytics ? analytics.active_users.toLocaleString() : '—',
      icon: Users,
      color: 'var(--accent-emerald)',
      subtext: 'Team members active'
    },
    {
      title: 'Avg Latency',
      value: analytics ? `${analytics.avg_latency_ms} ms` : '—',
      icon: Clock,
      color: 'var(--accent-amber)',
      subtext: analytics?.avg_latency_ms < 1500 ? 'Optimal performance' : 'Normal throughput'
    },
    {
      title: 'API Errors',
      value: analytics ? analytics.error_count.toLocaleString() : '—',
      icon: AlertOctagon,
      color: analytics?.error_count > 0 ? 'var(--accent-rose)' : 'var(--text-muted)',
      subtext: analytics?.error_count === 0 ? 'Zero errors logged' : 'Client or upstream failures'
    },
  ];

  // Maximum token count for chart scaling
  const maxDailyTokens = analytics?.daily?.reduce((max, d) => Math.max(max, d.tokens), 1) || 1;
  const maxDailyRequests = analytics?.daily?.reduce((max, d) => Math.max(max, d.api_requests), 1) || 1;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header & Filter Controls */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Usage & Analytics
            </h2>
            <span style={{
              fontSize: '11px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'var(--accent-emerald-subtle)',
              color: 'var(--accent-emerald-text)',
              border: '1px solid var(--accent-emerald-border)'
            }}>
              Live Overview
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
            Monitor message volume, requests, response speed, and overall assistant usage.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            background: 'var(--bg-surface-2)',
            borderRadius: '8px',
            padding: '3px',
            border: '1px solid var(--border-hairline)'
          }}>
            {[
              { days: 7, label: '7D' },
              { days: 30, label: '30D' },
              { days: 90, label: '90D' },
            ].map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriodDays(p.days)}
                style={{
                  background: periodDays === p.days ? 'var(--bg-surface-1)' : 'transparent',
                  color: periodDays === p.days ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchAnalytics}
            disabled={loading}
            title="Refresh metrics"
            style={{
              padding: '7px 10px',
              borderRadius: '8px',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-hairline)',
              color: 'var(--text-secondary)',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--accent-rose-subtle)',
          border: '1px solid var(--accent-rose-border)',
          color: 'var(--accent-rose-text)',
          fontSize: '13px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* Metric Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '14px',
        marginBottom: '28px'
      }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              style={{
                background: 'var(--bg-surface-1)',
                borderRadius: '12px',
                border: '1px solid var(--border-hairline)',
                padding: '18px 16px',
                transition: 'border-color var(--transition-fast)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {c.title}
                </span>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '7px',
                  background: 'var(--bg-surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: c.color
                }}>
                  <Icon size={15} />
                </div>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                {c.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {c.subtext}
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily Activity Chart Section */}
      <div style={{
        background: 'var(--bg-surface-1)',
        borderRadius: '12px',
        border: '1px solid var(--border-hairline)',
        padding: '22px 24px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Daily Request & Token Volume
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', marginBottom: 0 }}>
              Activity trends across the selected {periodDays}-day window.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent-primary)' }} />
              API Requests
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent-emerald)' }} />
              Messages
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Aggregating time-series telemetry...
          </div>
        ) : !analytics?.daily || analytics.daily.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No usage events recorded in this time range. Execute chat queries or ingest documents to view real-time data.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--border-hairline)',
                  background: 'var(--bg-surface-2)',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}>API Requests</th>
                  <th style={{ padding: '10px 14px' }}>Messages</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Tokens</th>
                  <th style={{ padding: '10px 14px', width: '220px' }}>Volume Intensity</th>
                </tr>
              </thead>
              <tbody>
                {analytics.daily.map((d) => {
                  const reqPercent = Math.min(100, Math.round((d.api_requests / maxDailyRequests) * 100));
                  return (
                    <tr
                      key={d.date}
                      style={{ borderBottom: '1px solid var(--border-hairline)' }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {d.date}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {d.api_requests.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {d.messages.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                        {d.tokens.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{
                          height: '6px',
                          background: 'var(--bg-surface-3)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${Math.max(reqPercent, 4)}%`,
                            height: '100%',
                            background: 'var(--accent-primary)',
                            borderRadius: '3px'
                          }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
