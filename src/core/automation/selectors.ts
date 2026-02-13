// Remote.com UI selectors and constants
// Derived from manual Playwright exploration of employ.remote.com

export const URLS = {
  login: 'https://employ.remote.com/login',
  timeTracking: 'https://employ.remote.com/dashboard/time-tracking/',
} as const

export const SELECTORS = {
  // Login page
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  loginButton: 'button[type="submit"]',

  // Time tracking page
  reopenButton: 'button:has-text("Reopen timesheet")',
  resubmitButton: 'button:has-text("Resubmit timesheet")',
  resubmitHoursButton: 'button:has-text("Resubmit hours")',
  prevWeekButton: 'button[aria-label="Previous week"]',
  nextWeekButton: 'button[aria-label="Next week"]',

  // Edit modal
  editDialog: '[role="dialog"]',
  notesTextbox: 'textbox >> nth=-1', // Notes is the last textbox in the dialog
  saveButton: '[data-testid="modal-save-button"]',
  dismissButton: 'button:has-text("Dismiss")',

  // Entry buttons (parameterized)
  editEntryButton: (timeRange: string) =>
    `button:has-text("Edit time entry for ${timeRange}")`,
} as const

export const TIMEOUTS = {
  navigation: 30_000,
  modalAppear: 10_000,
  modalDisappear: 10_000,
  networkIdle: 5_000,
  loginComplete: 30_000,
} as const

export const INTERNAL_API = {
  base: 'https://api.employ.remote.com/api/v1',
  timesheets: '/employee/timesheets',
  timeTrackings: (employmentId: string) =>
    `/employee/employments/${employmentId}/time-trackings`,
} as const
