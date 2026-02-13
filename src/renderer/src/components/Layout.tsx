import type { ReactNode } from 'react'

interface LayoutProps {
  activeTab: 'settings' | 'preview' | 'execute'
  onTabChange: (tab: 'settings' | 'preview' | 'execute') => void
  children: ReactNode
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconPreview({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function IconExecute({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

export function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const navItemClass = (tab: typeof activeTab) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
      activeTab === tab
        ? 'bg-blue-600 text-white'
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans">
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">업무일지 자동화</h1>
          <p className="text-xs text-slate-500 mt-1">Work Log Automation</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <div
            className={navItemClass('settings')}
            onClick={() => onTabChange('settings')}
          >
            <IconSettings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </div>

          <div
            className={navItemClass('preview')}
            onClick={() => onTabChange('preview')}
          >
            <IconPreview className="w-5 h-5" />
            <span className="font-medium">Preview</span>
          </div>

          <div
            className={navItemClass('execute')}
            onClick={() => onTabChange('execute')}
          >
            <IconExecute className="w-5 h-5" />
            <span className="font-medium">Execute</span>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-600 text-center">
            v1.0.0
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-900">
        <div className="h-full p-8 max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
