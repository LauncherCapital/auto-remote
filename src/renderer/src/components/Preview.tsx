import { useWeekPicker } from '../hooks/useWeekPicker'
import type { WeeklyWorkData, WeeklySummary, AutomationProgress } from '@core/types'

const btnPrimary =
  'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const cardClass = 'bg-slate-800 rounded-lg p-4'

interface PreviewProps {
  weekData: WeeklyWorkData | null
  summary: WeeklySummary | null
  progress: AutomationProgress
  onCollect: (weekStart: string) => void
  onGenerateSummary: (data: WeeklyWorkData) => void
  onSummaryChange: (summary: WeeklySummary) => void
}

export function Preview({ weekData, summary, progress, onCollect, onGenerateSummary, onSummaryChange }: PreviewProps) {
  const { selectedWeek, weekLabel, nextWeek, prevWeek } = useWeekPicker()

  const isCollecting = progress.status === 'collecting'
  const isSummarizing = progress.status === 'summarizing'
  const isBusy = isCollecting || isSummarizing

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-100">Preview</h2>

      <div className="flex items-center gap-4">
        <button
          onClick={prevWeek}
          className="text-slate-400 hover:text-slate-200 p-1 text-lg"
        >
          &larr;
        </button>
        <span className="text-sm font-medium text-slate-200 min-w-[200px] text-center">
          {weekLabel}
        </span>
        <button
          onClick={nextWeek}
          className="text-slate-400 hover:text-slate-200 p-1 text-lg"
        >
          &rarr;
        </button>
        <button
          onClick={() => onCollect(selectedWeek)}
          disabled={isBusy}
          className={btnPrimary}
        >
          {isCollecting ? 'Collecting...' : 'Collect Data'}
        </button>
        {weekData && (
          <button
            onClick={() => onGenerateSummary(weekData)}
            disabled={isBusy}
            className={btnPrimary}
          >
            {isSummarizing ? 'Generating...' : 'Generate Summary'}
          </button>
        )}
      </div>

      {weekData && !summary && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Collected Data
          </h3>
          {weekData.days.map((day) => (
            <div key={day.date} className={cardClass}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold text-slate-200">{day.dayOfWeek}</span>
                <span className="text-xs text-slate-500">{day.date}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">
                    {day.commits.length} commit{day.commits.length !== 1 ? 's' : ''}
                  </span>
                  {day.commits.slice(0, 3).map((c, i) => (
                    <div key={i} className="text-slate-500 truncate mt-0.5">
                      {c.message}
                    </div>
                  ))}
                  {day.commits.length > 3 && (
                    <div className="text-slate-600 mt-0.5">
                      +{day.commits.length - 3} more
                    </div>
                  )}
                </div>
                <div>
                  <span className="text-slate-400">
                    {day.slackMessages.length} message{day.slackMessages.length !== 1 ? 's' : ''}
                  </span>
                  {day.slackMessages.slice(0, 3).map((m, i) => (
                    <div key={i} className="text-slate-500 truncate mt-0.5">
                      #{m.channelName}: {m.text}
                    </div>
                  ))}
                  {day.slackMessages.length > 3 && (
                    <div className="text-slate-600 mt-0.5">
                      +{day.slackMessages.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            AI Summaries (editable)
          </h3>
          {summary.days.map((day, dayIdx) => (
            <div key={day.date} className={cardClass}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-bold text-slate-200">{day.date}</span>
                <span className="text-xs text-slate-500">
                  {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-blue-400 mb-1">
                    AM (09:00-12:00)
                  </label>
                  <textarea
                    className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={day.amNotes}
                    onChange={(e) => {
                      const updated = [...summary.days]
                      updated[dayIdx] = { ...updated[dayIdx], amNotes: e.target.value }
                      onSummaryChange({ ...summary, days: updated })
                    }}
                  />
                  <div className="text-xs text-slate-600 mt-1">
                    {day.rawAmData.commits.length} commits, {day.rawAmData.messages.length} messages
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-orange-400 mb-1">
                    PM (13:00-18:00)
                  </label>
                  <textarea
                    className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={day.pmNotes}
                    onChange={(e) => {
                      const updated = [...summary.days]
                      updated[dayIdx] = { ...updated[dayIdx], pmNotes: e.target.value }
                      onSummaryChange({ ...summary, days: updated })
                    }}
                  />
                  <div className="text-xs text-slate-600 mt-1">
                    {day.rawPmData.commits.length} commits, {day.rawPmData.messages.length} messages
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
