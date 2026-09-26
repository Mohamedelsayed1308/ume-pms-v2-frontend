'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
export type DisplayRole = 'executive' | 'finance' | 'operations';
export type CreateType = 'invoice' | 'payment' | 'purchase';
function usePreferencesState() {
  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState<DisplayRole>('executive');
  const [showAsk, setShowAsk] = useState(true);
  const [createType, setCreateType] = useState<CreateType | null>(null);
  return { collapsed, setCollapsed, role, setRole, showAsk, setShowAsk, createType, setCreateType };
}
const Context = createContext<ReturnType<typeof usePreferencesState> | null>(null);
export function DashboardPreferences({ children }: { children: ReactNode }) {
  return <Context.Provider value={usePreferencesState()}>{children}</Context.Provider>;
}
export function useDashboardPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('DashboardPreferences is required');
  return value;
}
export function QuickCreate() {
  const { setCreateType } = useDashboardPreferences();
  return <details className="relative"><summary className="cursor-pointer list-none rounded-lg bg-[#00283a] px-4 py-2 text-sm text-white">＋ إنشاء</summary><div className="absolute end-0 top-12 z-50 w-44 rounded-xl border bg-white p-2 shadow-lg">{([['invoice', 'فاتورة جديدة'], ['payment', 'دفعة جديدة'], ['purchase', 'أمر شراء جديد']] as const).map(([type, label]) => <button key={type} className="block w-full rounded-lg p-2 text-start text-sm hover:bg-gray-50" onClick={e => { setCreateType(type); e.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details>;
}
