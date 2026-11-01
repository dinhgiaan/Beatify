import React from 'react';
import { NavLink } from 'react-router-dom';

export interface TabItem {
  label: string;
  path: string;
  badge?: string | number;
}

export interface ModuleNavTabsProps {
  tabs: TabItem[];
  className?: string;
}

export const ModuleNavTabs: React.FC<ModuleNavTabsProps> = ({ tabs, className = '' }) => {
  return (
    <div
      className={`flex items-center gap-1.5 p-1 rounded-lg border mb-5 overflow-x-auto select-none ${className}`}
      style={{
        backgroundColor: 'var(--bg-subtle)',
        borderColor: 'var(--border)',
      }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-[12px] font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-sm border border-[var(--border)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                    borderColor: 'var(--border)',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
};
