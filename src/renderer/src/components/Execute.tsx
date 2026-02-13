import { useEffect, useRef } from 'react'
import type { AutomationProgress, LogEntry } from '@core/types'

const btnPrimary =
  'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnDanger =
  'bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors'

const statusColors: Record<string, string> = {
  idle: 'bg-slate-600 text-slate-300',
  collecting: 'bg-blue-600 text-blue-100',
  summarizing: 'bg-purple-600 text-purple-100',
  automating: 'bg-amber-600 text-amber-100',
  done: 'bg-green-600 text-green-100',
  error: 'bg-red-600 text-red-100',
}

const logColors: Record<LogEntry['level'], string> = {
  info: 'text-slate-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400',
}

interface ExecuteProps {
  progress: AutomationProgress
  hasSummary: boolean
  daysCount: number
  onExecute: () => void
  onCancel: () => void
}

export function Execute({ progress, hasSummary, daysCount, onExecute, onCancel }: ExecuteProps) {
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progress.logs.length])

  const isRunning = progress.status === 'automating' || progress.status === 'collecting' || progress.status === 'summarizing'
  const progressPct = progress.totalDays > 0 ? (progress.completedDays / progress.totalDays) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Execute</h2>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[progress.status] || statusColors.idle}`}
        >
          {progress.status.toUpperCase()}
        </span>
      </div>

      <div className="bg-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-300">
            {hasSummary ? (
              <span>{daysCount} day{daysCount !== 1 ? 's' : ''} ready for automation</span>
            ) : (
              <span className="text-slate-500">
                No summary available. Go to Preview to collect data and generate summaries first.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {isRunning ? (
              <button onClick={onCancel} className={btnDanger}>
                Cancel
              </button>
            ) : (
              <button onClick={onExecute} disabled={!hasSummary} className={btnPrimary}>
                Execute Automation
              </button>
            )}
          </div>
        </div>

        {progress.totalDays > 0 && (
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>
                {progress.currentDay && `Day: ${progress.currentDay}`}
                {progress.currentStep && ` - ${progress.currentStep}`}
              </span>
              <span>
                {progress.completedDays}/{progress.totalDays}
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Logs
          </span>
          <span className="text-xs text-slate-600">
            {progress.logs.length} entries
          </span>
        </div>
        <div className="h-80 overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5">
          {progress.logs.length === 0 ? (
            <div className="text-slate-600 py-8 text-center text-sm">
              Logs will appear here during execution.
            </div>
          ) : (
            progress.logs.map((log, i) => {
              const ts =
                log.timestamp instanceof Date
                  ? log.timestamp
                  : new Date(log.timestamp as unknown as string)
              return (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-600 flex-shrink-0">
                    {ts.toLocaleTimeString()}
                  </span>
                  <span className={logColors[log.level]}>{log.message}</span>
                </div>
              )
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {progress.error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4">
          <div className="text-sm font-medium text-red-400 mb-1">Error</div>
          <div className="text-sm text-red-300">{progress.error}</div>
        </div>
      )}
    </div>
  )
}
