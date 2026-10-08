'use client';

import React from 'react';
import ToggleSwitch from '@/components/ui/ToggleSwitch';

interface AlertsTabProps {
  lowStockAlerts: boolean;
  setLowStockAlerts: (val: boolean) => void;
  lowStockThreshold: number;
  setLowStockThreshold: (val: number) => void;
  overduePaymentAlerts: boolean;
  setOverduePaymentAlerts: (val: boolean) => void;
  overdueThresholdDays: number;
  setOverdueThresholdDays: (val: number) => void;
  dailySalesDigest: boolean;
  setDailySalesDigest: (val: boolean) => void;
  securityEventAlerts: boolean;
  setSecurityEventAlerts: (val: boolean) => void;
  alertRecipientEmails: string;
  setAlertRecipientEmails: (val: string) => void;
  isSuperAdmin: boolean;
}

export const AlertsTab: React.FC<AlertsTabProps> = ({
  lowStockAlerts,
  setLowStockAlerts,
  lowStockThreshold,
  setLowStockThreshold,
  overduePaymentAlerts,
  setOverduePaymentAlerts,
  overdueThresholdDays,
  setOverdueThresholdDays,
  dailySalesDigest,
  setDailySalesDigest,
  securityEventAlerts,
  setSecurityEventAlerts,
  alertRecipientEmails,
  setAlertRecipientEmails,
  isSuperAdmin,
}) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-3">
        <h3 className="text-base font-bold text-foreground">
          Automated System Alerts & Notifications
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure inventory threshold triggers, overdue vendor payment notifications, and daily
          sales digests.
        </p>
      </div>

      <div className="space-y-4 text-xs">
        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-foreground block text-xs">
                Low Stock Warning Alerts
              </span>
              <span className="text-3xs text-muted-foreground block">
                Trigger low stock warning alerts when store inventory drops below threshold.
              </span>
            </div>
            <ToggleSwitch
              id="lowStock"
              disabled={!isSuperAdmin}
              checked={lowStockAlerts}
              onChange={setLowStockAlerts}
              size="sm"
              onText="ON"
              offText="OFF"
            />
          </div>
          {lowStockAlerts && (
            <div className="pl-2 pt-1 flex items-center gap-3">
              <label className="text-muted-foreground text-xs">Default threshold:</label>
              <input
                type="number"
                min="1"
                max="100"
                disabled={!isSuperAdmin}
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                className="input-field text-xs w-24 font-mono font-bold"
              />
              <span className="text-muted-foreground text-xs">units per store</span>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-foreground block text-xs">
                Overdue Vendor Bill Reminders
              </span>
              <span className="text-3xs text-muted-foreground block">
                Trigger overdue vendor bill payment reminders and alerts.
              </span>
            </div>
            <ToggleSwitch
              id="overdue"
              disabled={!isSuperAdmin}
              checked={overduePaymentAlerts}
              onChange={setOverduePaymentAlerts}
              size="sm"
              onText="ON"
              offText="OFF"
            />
          </div>
          {overduePaymentAlerts && (
            <div className="pl-2 pt-1 flex items-center gap-3">
              <label className="text-muted-foreground text-xs">Alert after:</label>
              <input
                type="number"
                min="1"
                max="180"
                disabled={!isSuperAdmin}
                value={overdueThresholdDays}
                onChange={(e) => setOverdueThresholdDays(Number(e.target.value))}
                className="input-field text-xs w-24 font-mono font-bold"
              />
              <span className="text-muted-foreground text-xs">days past invoice due date</span>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 flex items-center justify-between">
          <div>
            <span className="font-bold text-foreground block text-xs">Daily Closing Digest</span>
            <span className="text-3xs text-muted-foreground block">
              Send daily store closing revenue, sales volume and margin digest.
            </span>
          </div>
          <ToggleSwitch
            id="digest"
            disabled={!isSuperAdmin}
            checked={dailySalesDigest}
            onChange={setDailySalesDigest}
            size="sm"
            onText="ON"
            offText="OFF"
          />
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 flex items-center justify-between">
          <div>
            <span className="font-bold text-foreground block text-xs">
              Critical Security Alerts
            </span>
            <span className="text-3xs text-muted-foreground block">
              Notify administrators immediately on critical security and permission events.
            </span>
          </div>
          <ToggleSwitch
            id="securityAlerts"
            disabled={!isSuperAdmin}
            checked={securityEventAlerts}
            onChange={setSecurityEventAlerts}
            size="sm"
            onText="ON"
            offText="OFF"
          />
        </div>

        <div>
          <label className="font-bold text-foreground block mb-1">
            Alert Recipient Email Addresses (Comma-separated)
          </label>
          <input
            type="text"
            disabled={!isSuperAdmin}
            value={alertRecipientEmails}
            onChange={(e) => setAlertRecipientEmails(e.target.value)}
            placeholder="alerts@company.com, finance@company.com"
            className="input-field text-xs font-mono"
          />
        </div>
      </div>
    </div>
  );
};
