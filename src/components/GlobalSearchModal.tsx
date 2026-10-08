'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';

export default function GlobalSearchModal() {
  const { searchOpen, setSearchOpen, inventory, customers, sales, branding, currentUser, formatCurrency } =
    useApp();
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, setSearchOpen]);

  if (!searchOpen || !mounted) return null;

  const isSuperAdmin = currentUser.role === 'Super Admin';
  const assignedStore = currentUser.store || 'BLR';

  const matchedItems = query
    ? inventory
        .filter((i) => {
          if (!isSuperAdmin && i.store && i.store.toUpperCase() !== assignedStore.toUpperCase()) {
            return false;
          }
          return (
            i.name.toLowerCase().includes(query.toLowerCase()) ||
            i.sku.toLowerCase().includes(query.toLowerCase()) ||
            (i.barcode && i.barcode.includes(query))
          );
        })
        .slice(0, 4)
    : [];

  const matchedCustomers = query
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.phone.includes(query) ||
            c.email.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 3)
    : [];

  const matchedSales = query
    ? sales
        .filter((s) => {
          if (!isSuperAdmin && s.store && s.store.toUpperCase() !== assignedStore.toUpperCase()) {
            return false;
          }
          return (
            s.orderNo.toLowerCase().includes(query.toLowerCase()) ||
            s.customerName.toLowerCase().includes(query.toLowerCase())
          );
        })
        .slice(0, 3)
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-start md:items-start md:justify-center md:pt-16 bg-black/60 backdrop-blur-sm fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSearchOpen(false);
      }}
    >
      <div className="bg-card w-full h-[100dvh] md:h-auto md:border md:border-border md:max-w-2xl md:rounded-2xl md:shadow-2xl overflow-hidden flex flex-col md:max-h-[85dvh] md:mx-4">
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 md:px-5 py-3 md:py-4 border-b border-border bg-muted/30">
          <Icon name="MagnifyingGlassIcon" size={18} className="text-primary flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search products, customers, orders..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded font-mono">
            ESC
          </kbd>
          <button
            onClick={() => setSearchOpen(false)}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Results Body */}
        <div className="p-4 overflow-y-auto scrollbar-thin space-y-5">
          {!query && (
            <div className="py-8 text-center text-muted-foreground">
              <Icon name="MagnifyingGlassIcon" size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">
                Type anything to search across {branding.appName}
              </p>
              <p className="text-2xs text-muted-foreground mt-1">
                Search SKUs, barcodes, orders, customers, or module pages
              </p>
            </div>
          )}

          {/* Products */}
          {matchedItems.length > 0 && (
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground px-2 mb-2">
                Inventory Products
              </p>
              <div className="space-y-1">
                {matchedItems.map((item) => (
                  <Link
                    key={`search-prod-${item.id}`}
                    href="/inventory-management"
                    onClick={() => setSearchOpen(false)}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-mono text-xs font-bold flex-shrink-0">
                        {item.sku.slice(-3)}
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.name}
                        </p>
                        <p className="text-2xs text-muted-foreground font-mono">
                          {item.sku} · {item.category} · {item.store}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-semibold font-tabular">
                        {formatCurrency(item.sellingPrice)}
                      </span>
                      <p className="text-2xs text-muted-foreground font-tabular">
                        {item.qtyOnHand} in stock
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Customers */}
          {matchedCustomers.length > 0 && (
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground px-2 mb-2">
                Customers
              </p>
              <div className="space-y-1">
                {matchedCustomers.map((cust) => (
                  <Link
                    key={`search-cust-${cust.id}`}
                    href="/customers"
                    onClick={() => setSearchOpen(false)}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-info/10 text-info flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {cust.name[0]}
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {cust.name}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {cust.phone} · {cust.city}
                        </p>
                      </div>
                    </div>
                    <span className="badge-info text-2xs">{cust.tier}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Sales */}
          {matchedSales.length > 0 && (
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground px-2 mb-2">
                Sales Orders
              </p>
              <div className="space-y-1">
                {matchedSales.map((s) => (
                  <Link
                    key={`search-sale-${s.id}`}
                    href="/sales"
                    onClick={() => setSearchOpen(false)}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-success/10 text-success flex items-center justify-center font-mono text-xs font-bold flex-shrink-0">
                        POS
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {s.orderNo} — {s.customerName}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {s.createdAt} · {s.store}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground font-tabular">
                      {formatCurrency(s.total)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {query &&
            matchedItems.length === 0 &&
            matchedCustomers.length === 0 &&
            matchedSales.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <p className="text-sm font-medium">No results found for &quot;{query}&quot;</p>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-muted/40 border-t border-border flex items-center justify-between text-2xs text-muted-foreground">
          <span>Navigate with Arrow keys</span>
          <span>Press ESC to close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
