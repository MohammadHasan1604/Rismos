'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

export default function DataConnectionsPage() {
  const { currentUser } = useApp();

  // Form State
  const [connectionName, setConnectionName] = useState('Legacy Customer & Repair Database');
  const [dbType, setDbType] = useState('MySQL');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(3306);
  const [databaseName, setDatabaseName] = useState('cosko_legacy_store');
  const [username, setUsername] = useState('cosko_legacy_reader');
  const [password, setPassword] = useState('');
  const [sslMode, setSslMode] = useState('Preferred');
  const [connectionTimeout, setConnectionTimeout] = useState(2500);
  const [readTimeout, setReadTimeout] = useState(3000);

  // Status & Health State
  const [status, setStatus] = useState<
    'Connected' | 'Not Configured' | 'Connection Failed' | 'Disabled'
  >('Connected');
  const [latencyMs, setLatencyMs] = useState(12);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>(new Date().toISOString());
  const [passwordConfigured, setPasswordConfigured] = useState(true);

  // Modals & Loaders
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResultModal, setTestResultModal] = useState<any | null>(null);
  const [discoverModal, setDiscoverModal] = useState<any | null>(null);
  const [mappingModal, setMappingModal] = useState(false);
  const [mappingPreview, setMappingPreview] = useState<any | null>(null);

  // Field Mapping State
  const [custNameCol, setCustNameCol] = useState('full_name');
  const [custPhoneCol, setCustPhoneCol] = useState('phone');
  const [custEmailCol, setCustEmailCol] = useState('email');
  const [custCityCol, setCustCityCol] = useState('city');
  const [repTicketCol, setRepTicketCol] = useState('ticket_no');
  const [repDeviceCol, setRepDeviceCol] = useState('device_name');
  const [repIssueCol, setRepIssueCol] = useState('issue_description');
  const [repStatusCol, setRepStatusCol] = useState('status');

  // Load existing config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/settings/data-connections');
        const data = await res.json();
        if (data.success && data.config) {
          setConnectionName(data.config.name || 'Legacy Customer & Repair Database');
          setHost(data.config.host || '127.0.0.1');
          setPort(data.config.port || 3306);
          setDatabaseName(data.config.databaseName || 'cosko_legacy_store');
          setUsername(data.config.username || 'cosko_legacy_reader');
          setSslMode(data.config.sslMode || 'Preferred');
          setStatus(data.config.status || 'Connected');
          setLatencyMs(data.config.lastLatencyMs || 12);
          setLastCheckedAt(data.config.lastCheckedAt || new Date().toISOString());
          setPasswordConfigured(data.config.passwordConfigured);
        }
      } catch (err) {
        console.error('Failed to load data connection settings:', err);
      }
    };
    fetchConfig();
  }, []);

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const res = await fetch('/api/settings/data-connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, databaseName, username, password }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResultModal(data.diagnostics);
        setStatus('Connected');
        setLatencyMs(data.diagnostics.latencyMs);
        setLastCheckedAt(data.diagnostics.testedAt);
        toast.success('Connection successful! SELECT-only read-only privileges verified.');
      } else {
        toast.error(data.error || 'Connection test failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Connection test request failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch('/api/settings/data-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connectionName,
          dbType,
          host,
          port,
          databaseName,
          username,
          password: password || undefined,
          sslMode,
          connectionTimeout,
          readTimeout,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setPassword('');
        setPasswordConfigured(true);
      } else {
        toast.error(data.error || 'Failed to save connection');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscoverTables = async () => {
    try {
      const res = await fetch('/api/settings/data-connections/discover', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDiscoverModal(data.tables);
      }
    } catch (err) {
      toast.error('Failed to discover tables');
    }
  };

  const handleSaveMapping = async () => {
    try {
      const res = await fetch('/api/settings/data-connections/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerMapping: {
            name: custNameCol,
            phone: custPhoneCol,
            email: custEmailCol,
            city: custCityCol,
          },
          repairMapping: {
            ticket_no: repTicketCol,
            device_name: repDeviceCol,
            issue_description: repIssueCol,
            status: repStatusCol,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMappingPreview(data.sampleRecordPreview);
        toast.success('Field mappings updated and saved successfully!');
      }
    } catch (err) {
      toast.error('Failed to save mappings');
    }
  };

  const handleDisableConnection = async () => {
    try {
      const res = await fetch('/api/settings/data-connections/disable', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus('Disabled');
        toast.info('Legacy database connection has been disabled.');
      }
    } catch (err) {
      toast.error('Failed to disable connection');
    }
  };

  // RBAC Guard: Super Admin Level 100 only
  if (currentUser.role !== 'Super Admin') {
    return (
      <AppLayout activeRoute="/settings">
        <div className="p-8 text-center max-w-lg mx-auto space-y-4">
          <Icon name="ShieldExclamationIcon" className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Access Denied (403 Forbidden)</h2>
          <p className="text-sm text-muted-foreground">
            Data Connections management is classified as{' '}
            <span className="font-semibold text-foreground">SUPER_ADMIN_ONLY</span>. Your account
            does not have sufficient security clearance (Level 100).
          </p>
          <Link href="/settings" className="btn-primary text-xs py-2 px-4 inline-block">
            Return to Settings
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activeRoute="/settings">
      <div className="space-y-6 max-w-5xl mx-auto fade-in">
        {/* Breadcrumb Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href="/settings" className="hover:text-foreground">
                Settings
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">Data Connections</span>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">External Data Connections</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
                Super Admin Only
              </span>
            </div>
            <p className="page-subtitle">
              Securely configure read-only database connections to query historical customer and
              service records without modifying legacy sources.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Icon name="BoltIcon" className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button
              onClick={handleDiscoverTables}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-secondary text-xs font-medium transition-colors"
            >
              <Icon name="MagnifyingGlassIcon" className="w-4 h-4" />
              <span>Discover Tables</span>
            </button>
          </div>
        </div>

        {/* Status & Health Summary Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Icon name="CircleStackIcon" className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Legacy Customer & Repair Database
                </h3>
                <span className="text-xs text-muted-foreground font-mono">
                  {host}:{port} · DB: {databaseName}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${
                  status === 'Connected'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : status === 'Disabled'
                      ? 'bg-secondary text-muted-foreground border-border'
                      : 'bg-destructive/10 text-destructive border-destructive/20'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                {status}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-semibold">
                READ ONLY (SELECT ONLY)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-secondary/40 rounded-xl space-y-0.5">
              <span className="text-muted-foreground block">Connection Latency</span>
              <span className="font-bold text-foreground text-sm font-mono">{latencyMs} ms</span>
            </div>
            <div className="p-3 bg-secondary/40 rounded-xl space-y-0.5">
              <span className="text-muted-foreground block">Read-Only Guard</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                ENFORCED (No Writes)
              </span>
            </div>
            <div className="p-3 bg-secondary/40 rounded-xl space-y-0.5">
              <span className="text-muted-foreground block">Driver & Engine</span>
              <span className="font-bold text-foreground text-sm">MySQL 8+ / TCP</span>
            </div>
            <div className="p-3 bg-secondary/40 rounded-xl space-y-0.5">
              <span className="text-muted-foreground block">Last Health Diagnostic</span>
              <span className="font-medium text-foreground text-[11px] truncate block">
                {new Date(lastCheckedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Secure Configuration Form */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Icon name="KeyIcon" className="w-5 h-5 text-primary" />
              <span>Server-Side Database Credentials</span>
            </h2>
            <span className="text-xs text-muted-foreground">
              Credentials are encrypted at rest & never exposed to client
            </span>
          </div>

          <form onSubmit={handleSaveConnection} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Connection Label
                </label>
                <input
                  type="text"
                  required
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Database Engine
                </label>
                <select
                  value={dbType}
                  onChange={(e) => setDbType(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="MySQL">MySQL 5.7 / 8.0+</option>
                  <option value="MariaDB">MariaDB</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Host / Endpoint
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 127.0.0.1 or legacy-mysql.internal"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Port</label>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Database Name
                </label>
                <input
                  type="text"
                  required
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Username (SELECT-only recommended)
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Password</label>
                <input
                  type="password"
                  placeholder={
                    passwordConfigured ? '•••••••••••• (Configured)' : 'Enter database password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border/50">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  SSL / TLS Mode
                </label>
                <select
                  value={sslMode}
                  onChange={(e) => setSslMode(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="Preferred">Preferred (Encrypted when supported)</option>
                  <option value="Required">Required (Enforce TLS)</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Connect Timeout
                </label>
                <select
                  value={connectionTimeout}
                  onChange={(e) => setConnectionTimeout(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value={1500}>1.5 seconds</option>
                  <option value={2500}>2.5 seconds (Recommended)</option>
                  <option value={5000}>5.0 seconds</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Read Timeout
                </label>
                <select
                  value={readTimeout}
                  onChange={(e) => setReadTimeout(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value={2000}>2.0 seconds</option>
                  <option value={3000}>3.0 seconds (Recommended)</option>
                  <option value={6000}>6.0 seconds</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMappingModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-secondary text-xs font-medium"
                >
                  <Icon name="TableCellsIcon" className="w-4 h-4 text-primary" />
                  <span>Map Schema Fields</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisableConnection}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-destructive/20 text-destructive hover:bg-destructive/10 text-xs font-medium"
                >
                  <Icon name="NoSymbolIcon" className="w-4 h-4" />
                  <span>Disable</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
              >
                <Icon name="CheckIcon" className="w-4 h-4" />
                <span>{saving ? 'Saving Configuration...' : 'Save & Encrypt Connection'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Diagnostics Modal */}
        {testResultModal && (
          <Modal
            open={!!testResultModal}
            onClose={() => setTestResultModal(null)}
            title="Connection Diagnostics Result"
            subtitle="Verified non-destructive SELECT 1 health check"
            size="md"
          >
            <div className="space-y-4 py-2 text-xs">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 space-y-1">
                <div className="font-bold text-sm flex items-center gap-1.5">
                  <Icon name="CheckCircleIcon" className="w-4 h-4" />
                  <span>Connection Successful</span>
                </div>
                <p>
                  READ ONLY mode confirmed. All historical customer and repair data will be read
                  without modifications.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-secondary/50 rounded-xl">
                  <span className="text-muted-foreground block text-[11px]">Database Host</span>
                  <span className="font-mono font-bold text-foreground">
                    {testResultModal.host}
                  </span>
                </div>
                <div className="p-3 bg-secondary/50 rounded-xl">
                  <span className="text-muted-foreground block text-[11px]">Selected DB</span>
                  <span className="font-mono font-bold text-foreground">
                    {testResultModal.database}
                  </span>
                </div>
                <div className="p-3 bg-secondary/50 rounded-xl">
                  <span className="text-muted-foreground block text-[11px]">
                    Round-Trip Latency
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {testResultModal.latencyMs} ms
                  </span>
                </div>
                <div className="p-3 bg-secondary/50 rounded-xl">
                  <span className="text-muted-foreground block text-[11px]">
                    Access Verification
                  </span>
                  <span className="font-bold text-foreground">SELECT-Only OK</span>
                </div>
              </div>

              <div className="p-3 bg-secondary/30 rounded-xl space-y-1">
                <span className="text-muted-foreground block text-[11px]">Detected Tables:</span>
                <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                  {testResultModal.detectedCustomerTables.map((t: string) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                    >
                      {t}
                    </span>
                  ))}
                  {testResultModal.detectedRepairTables.map((t: string) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  onClick={() => setTestResultModal(null)}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs"
                >
                  Close Diagnostics
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Discover Tables Modal */}
        {discoverModal && (
          <Modal
            open={!!discoverModal}
            onClose={() => setDiscoverModal(null)}
            title="Discovered Legacy Schema Tables"
            subtitle="Inspected schema metadata from connected database"
            size="lg"
          >
            <div className="space-y-4 py-2 text-xs">
              {discoverModal.map((table: any) => (
                <div
                  key={table.tableName}
                  className="p-4 rounded-xl bg-card border border-border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-foreground">
                      {table.tableName}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[11px]">
                      {table.type} · {table.rowCount.toLocaleString()} rows
                    </span>
                  </div>
                  <div className="text-muted-foreground text-[11px]">Available Columns:</div>
                  <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                    {table.columns.map((col: string) => (
                      <span
                        key={col}
                        className="px-2 py-0.5 rounded bg-secondary/80 text-foreground border border-border/60"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  onClick={() => setDiscoverModal(null)}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Field Mapping Modal */}
        {mappingModal && (
          <Modal
            open={mappingModal}
            onClose={() => setMappingModal(false)}
            title="Map Legacy Data Columns to Application Fields"
            subtitle="Configure schema associations with live read-only preview"
            size="lg"
          >
            <div className="space-y-6 py-2 text-xs max-h-[75vh] overflow-y-auto pr-1">
              {/* Customer Column Association */}
              <div className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-border">
                <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Icon name="UsersIcon" className="w-4 h-4 text-primary" />
                  <span>1. Customer Identity Column Mappings</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Full Name Column
                    </label>
                    <input
                      type="text"
                      value={custNameCol}
                      onChange={(e) => setCustNameCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Phone / Mobile
                    </label>
                    <input
                      type="text"
                      value={custPhoneCol}
                      onChange={(e) => setCustPhoneCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Email</label>
                    <input
                      type="text"
                      value={custEmailCol}
                      onChange={(e) => setCustEmailCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      City / Location
                    </label>
                    <input
                      type="text"
                      value={custCityCol}
                      onChange={(e) => setCustCityCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Repair Column Association */}
              <div className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-border">
                <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Icon name="WrenchScrewdriverIcon" className="w-4 h-4 text-primary" />
                  <span>2. Repair / Service Column Mappings</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Ticket Reference
                    </label>
                    <input
                      type="text"
                      value={repTicketCol}
                      onChange={(e) => setRepTicketCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Device / Model
                    </label>
                    <input
                      type="text"
                      value={repDeviceCol}
                      onChange={(e) => setRepDeviceCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Problem / Symptom
                    </label>
                    <input
                      type="text"
                      value={repIssueCol}
                      onChange={(e) => setRepIssueCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Status Column
                    </label>
                    <input
                      type="text"
                      value={repStatusCol}
                      onChange={(e) => setRepStatusCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Live Read-Only Preview Section */}
              {mappingPreview && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
                  <h5 className="font-bold text-xs text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="EyeIcon" className="w-4 h-4" />
                    <span>Live Read-Only Record Interpretation Preview</span>
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                    <div className="p-3 bg-card rounded-lg border border-border space-y-1">
                      <span className="font-bold text-foreground block">Customer Preview:</span>
                      <div>Name: {mappingPreview.customer.coskoInterpretation.name}</div>
                      <div>
                        Mobile: {mappingPreview.customer.coskoInterpretation.canonical_mobile}
                      </div>
                      <div>
                        Link Status: {mappingPreview.customer.coskoInterpretation.link_status}
                      </div>
                    </div>
                    <div className="p-3 bg-card rounded-lg border border-border space-y-1">
                      <span className="font-bold text-foreground block">Repair Preview:</span>
                      <div>Ticket: {mappingPreview.repair.coskoInterpretation.ticket_no}</div>
                      <div>Device: {mappingPreview.repair.coskoInterpretation.device_name}</div>
                      <div>Issue: {mappingPreview.repair.coskoInterpretation.repair_requested}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleSaveMapping}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90"
                >
                  Save & Generate Preview
                </button>
                <button
                  type="button"
                  onClick={() => setMappingModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-foreground hover:bg-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
}
