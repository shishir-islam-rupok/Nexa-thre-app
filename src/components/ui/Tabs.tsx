interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export default function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex items-center gap-1 border-b border-ink-100 dark:border-ink-800 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            active === tab.key
              ? 'text-accent-600 dark:text-accent-400'
              : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="text-xs text-ink-400">{tab.count}</span>
            )}
          </span>
          {active === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-600 dark:bg-accent-400 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
