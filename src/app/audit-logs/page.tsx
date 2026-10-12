'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useApp } from '@/context/AppContext';
import SuperAdminGuard from '@/components/SuperAdminGuard';

export default function AuditLogsPage() {
  const { auditLogs } = useApp();
  const [filterModule, setFilterModule] = useState('All');

  const filteredLogs =
    filterModule === 'All' ? auditLogs : auditLogs.filter((l) => l.module === filterModule);

  return (
    <SuperAdminGuard moduleName="Audit Logs">
      <AppLayout activeRoute="/audit-logs">
        <div className="space-y-4 md:space-y-6 fade-in">
          {/* Page Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="page-header">
              <h1 className="page-title">Audit Logs</h1>
              <p className="page-subtitle">System security trail & transactions</p>
            </div>

            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="input-field py-1.5 text-xs w-auto min-w-[120px] flex-shrink-0"
            >
              <option value="All">All</option>
              <option value="Inventory">Inventory</option>
              <option value="Sales">Sales</option>
              <option value="Authentication">Auth</option>
              <option value="Organization">Org</option>
            </select>
          </div>

          {/* Audit Logs Cards (<md) */}
          <div className="block md:hidden card overflow-hidden divide-y divide-border">
            {filteredLogs.map((log) => (
              <div
                key={`m-audit-${log.id}`}
                className="p-4 space-y-2 bg-card hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="badge-info text-3xs font-semibold">{log.module}</span>
                  <span className="text-3xs text-muted-foreground font-mono">{log.timestamp}</span>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground">{log.action}</p>
                  <p className="text-2xs text-muted-foreground mt-0.5">{log.details}</p>
                </div>

                <div className="flex items-center justify-between text-3xs pt-1 border-t border-border/50 text-muted-foreground">
                  <span>
                    <strong className="text-foreground">{log.userName}</strong> ({log.userRole})
                  </span>
                  <span className="font-mono">{log.ipAddress}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Audit Logs Desktop Table (>=md) */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left min-w-[750px]">
                <thead>
                  <tr className="bg-muted text-2xs font-bold uppercase text-muted-foreground">
                    <th className="px-4 py-3 sticky left-0 z-20 bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      Timestamp
                    </th>
                    <th className="px-4 py-3">User & Role</th>
                    <th className="px-4 py-3">Module</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Audit Details</th>
                    <th className="px-4 py-3 font-mono">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {filteredLogs.map((log) => (
                    <tr key={`audit-${log.id}`} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5 text-2xs text-muted-foreground font-mono sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        {log.timestamp}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-foreground">{log.userName}</p>
                        <p className="text-2xs text-muted-foreground">{log.userRole}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="badge-info text-2xs">{log.module}</span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-foreground text-xs">
                        {log.action}
                      </td>
                      <td
                        className="px-4 py-3.5 text-xs text-muted-foreground max-w-md truncate"
                        title={log.details}
                      >
                        {log.details}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-2xs text-muted-foreground">
                        {log.ipAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AppLayout>
    </SuperAdminGuard>
  );
}
