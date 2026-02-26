"use strict";

// src/core/automation/remote.ts
var import_playwright2 = require("playwright");

// src/core/automation/auth.ts
var import_fs = require("fs");
var import_playwright = require("playwright");

// src/core/automation/selectors.ts
var URLS = {
  login: "https://employ.remote.com/login",
  timeTracking: "https://employ.remote.com/dashboard/time-tracking/"
};
var SELECTORS = {
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
  notesTextbox: "textbox >> nth=-1",
  // Notes is the last textbox in the dialog
  saveButton: '[data-testid="modal-save-button"]',
  dismissButton: 'button:has-text("Dismiss")',
  // Entry buttons (parameterized)
  editEntryButton: (timeRange) => `button:has-text("Edit time entry for ${timeRange}")`
};
var TIMEOUTS = {
  navigation: 3e4,
  modalAppear: 1e4,
  modalDisappear: 1e4,
  networkIdle: 5e3,
  loginComplete: 3e4
};

// src/core/automation/auth.ts
async function ensureAuthenticated(config, generalConfig, authStatePath) {
  if ((0, import_fs.existsSync)(authStatePath)) {
    const isValid = await validateExistingSession(generalConfig, authStatePath);
    if (isValid) return;
  }
  await performFreshLogin(config, generalConfig, authStatePath);
}
async function validateExistingSession(generalConfig, authStatePath) {
  const browser = await import_playwright.chromium.launch({
    headless: generalConfig.headless,
    slowMo: generalConfig.slowMo
  });
  try {
    const context = await browser.newContext({ storageState: authStatePath });
    const page = await context.newPage();
    await page.goto(URLS.timeTracking, { timeout: TIMEOUTS.navigation });
    const url = page.url();
    const isAuthenticated = !url.includes("/login");
    await context.close();
    return isAuthenticated;
  } catch {
    return false;
  } finally {
    await browser.close();
  }
}
async function performFreshLogin(config, generalConfig, authStatePath) {
  const browser = await import_playwright.chromium.launch({
    headless: generalConfig.headless,
    slowMo: generalConfig.slowMo
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(URLS.login, { timeout: TIMEOUTS.navigation });
    await page.fill(SELECTORS.emailInput, config.email);
    await page.fill(SELECTORS.passwordInput, config.password);
    await page.click(SELECTORS.loginButton);
    await page.waitForURL(
      (url) => !url.toString().includes("/login"),
      { timeout: TIMEOUTS.loginComplete }
    );
    await context.storageState({ path: authStatePath });
    await context.close();
  } finally {
    await browser.close();
  }
}

// src/core/automation/remote.ts
var AM_TIME_RANGES = ["09:00 to 12:00", "9:00 to 12:00"];
var PM_TIME_RANGES = ["13:00 to 18:00", "13:00 to 17:00", "14:00 to 18:00"];
var ENTRY_DELAY_MS = 500;
async function automateTimesheet(summary, remoteConfig, generalConfig, authStatePath, onProgress2, signal) {
  const logs = [];
  const workdays = summary.days.filter((d) => !isWeekend(d.date));
  function emitProgress(status, overrides = {}) {
    if (!onProgress2) return;
    onProgress2({
      status,
      totalDays: workdays.length,
      completedDays: 0,
      logs: [...logs],
      ...overrides
    });
  }
  function log(level, message) {
    logs.push({ timestamp: /* @__PURE__ */ new Date(), level, message });
    emitProgress("automating", { logs: [...logs] });
  }
  await ensureAuthenticated(remoteConfig, generalConfig, authStatePath);
  log("info", "Authentication verified");
  const browser = await import_playwright2.chromium.launch({
    headless: generalConfig.headless,
    slowMo: generalConfig.slowMo
  });
  try {
    const context = await browser.newContext({ storageState: authStatePath });
    const page = await context.newPage();
    log("info", "Navigating to time tracking page");
    await page.goto(URLS.timeTracking, { timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(2e3);
    log("info", "Reopening timesheet");
    const reopenButton = page.locator(SELECTORS.reopenButton);
    if (await reopenButton.isVisible({ timeout: 3e3 }).catch(() => false)) {
      await reopenButton.click();
      await page.waitForTimeout(2e3);
      log("success", "Timesheet reopened");
    } else {
      log("info", "Timesheet already open for editing");
    }
    let completedDays = 0;
    for (const day of workdays) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      emitProgress("automating", {
        currentDay: day.date,
        completedDays
      });
      log("info", `Processing ${day.date}`);
      const amFilled = await fillEntry(page, day, "am", logs);
      const pmFilled = await fillEntry(page, day, "pm", logs);
      if (amFilled || pmFilled) {
        log("success", `Completed ${day.date}`);
      } else {
        log("warn", `No editable entries found for ${day.date}`);
      }
      completedDays++;
      emitProgress("automating", { completedDays });
    }
    log("info", "Resubmitting timesheet");
    const resubmitButton = page.locator(SELECTORS.resubmitButton);
    if (await resubmitButton.isVisible({ timeout: 3e3 }).catch(() => false)) {
      await resubmitButton.click();
      const resubmitHoursButton = page.locator(SELECTORS.resubmitHoursButton);
      await resubmitHoursButton.waitFor({ state: "visible", timeout: TIMEOUTS.modalAppear });
      await resubmitHoursButton.click();
      await page.waitForTimeout(2e3);
      log("success", "Timesheet resubmitted");
    } else {
      log("warn", "No resubmit button found - timesheet may not need resubmission");
    }
    await context.storageState({ path: authStatePath });
    await context.close();
    emitProgress("done", { completedDays: workdays.length });
    log("success", "Automation completed successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("error", `Automation failed: ${errorMessage}`);
    emitProgress("error", { error: errorMessage });
    throw error;
  } finally {
    await browser.close();
  }
}
async function fillEntry(page, day, period, logs) {
  const notes = period === "am" ? day.amNotes : day.pmNotes;
  const timeRanges = period === "am" ? AM_TIME_RANGES : PM_TIME_RANGES;
  for (const timeRange of timeRanges) {
    const editButton = page.locator(SELECTORS.editEntryButton(timeRange));
    const isVisible = await editButton.isVisible({ timeout: 1e3 }).catch(() => false);
    if (!isVisible) continue;
    try {
      return await retryOperation(async () => {
        await editButton.click();
        const dialog = page.locator(SELECTORS.editDialog);
        await dialog.waitFor({ state: "visible", timeout: TIMEOUTS.modalAppear });
        const notesField = dialog.getByPlaceholder("Add notes");
        await notesField.waitFor({ state: "visible", timeout: 3e3 });
        await notesField.clear();
        await notesField.fill(notes);
        await page.locator(SELECTORS.saveButton).click();
        await dialog.waitFor({ state: "hidden", timeout: TIMEOUTS.modalDisappear });
        await page.waitForTimeout(ENTRY_DELAY_MS);
        return true;
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logs.push({
        timestamp: /* @__PURE__ */ new Date(),
        level: "error",
        message: `Failed to fill ${period.toUpperCase()} entry for ${day.date}: ${msg}`
      });
      const dismissButton = page.locator(SELECTORS.dismissButton);
      if (await dismissButton.isVisible({ timeout: 1e3 }).catch(() => false)) {
        await dismissButton.click();
        await page.waitForTimeout(500);
      }
    }
  }
  return false;
}
async function retryOperation(operation, maxRetries = 3, baseDelay = 1e3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}
function isWeekend(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
}

// src/core/config.ts
var import_fs2 = require("fs");
var import_path = require("path");
var import_url = require("url");
var __dirname = (0, import_path.dirname)((0, import_url.fileURLToPath)("file:///sessions/intelligent-kind-wright/mnt/auto-remote/src/core/config.ts"));
var PROJECT_ROOT = (0, import_path.join)(__dirname, "..", "..");
var ENV_PATH = (0, import_path.join)(PROJECT_ROOT, ".env");
var CONFIG_PATH = (0, import_path.join)(PROJECT_ROOT, "config.json");
function parseEnvFile(path) {
  if (!(0, import_fs2.existsSync)(path)) return {};
  const content = (0, import_fs2.readFileSync)(path, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }
  return env;
}
function loadJsonConfig(path) {
  if (!(0, import_fs2.existsSync)(path)) return {};
  try {
    return JSON.parse((0, import_fs2.readFileSync)(path, "utf-8"));
  } catch {
    return {};
  }
}
function loadConfig() {
  const env = parseEnvFile(ENV_PATH);
  const json = loadJsonConfig(CONFIG_PATH);
  return {
    remote: {
      email: json.remote?.email ?? env.REMOTE_EMAIL ?? "",
      password: json.remote?.password ?? env.REMOTE_PASSWORD ?? "",
      employmentId: json.remote?.employmentId ?? "",
      timezone: json.remote?.timezone ?? "Asia/Seoul"
    },
    slack: {
      userToken: json.slack?.userToken ?? env.SLACK_USER_TOKEN ?? "",
      userId: json.slack?.userId ?? env.SLACK_USER_ID ?? "",
      userName: json.slack?.userName ?? env.SLACK_USER_NAME ?? ""
    },
    github: {
      accessToken: json.github?.accessToken ?? env.GITHUB_ACCESS_TOKEN ?? "",
      username: json.github?.username ?? env.GITHUB_USERNAME ?? "",
      repos: json.github?.repos ?? json.git?.repos ?? []
    },
    ai: {
      openRouterApiKey: env.OPENROUTER_API_KEY ?? "",
      model: json.ai?.model ?? "openai/gpt-4o-mini",
      language: json.ai?.language ?? "ko"
    },
    general: {
      headless: json.general?.headless ?? true,
      slowMo: json.general?.slowMo ?? 0
    },
    scheduler: {
      enabled: json.scheduler?.enabled ?? false,
      time: json.scheduler?.time ?? "18:00",
      skipWeekends: json.scheduler?.skipWeekends ?? true
    }
  };
}
function getAuthStatePath() {
  return (0, import_path.join)(PROJECT_ROOT, "auth.json");
}

// test-automation.ts
var MOCK_SUMMARY = {
  weekStart: "2026-02-23",
  weekEnd: "2026-02-27",
  days: [
    {
      date: "2026-02-23",
      amNotes: "\uC624\uC804 \uC5C5\uBB34: \uCF54\uB4DC \uB9AC\uBDF0 \uBC0F PR \uAC80\uD1A0, \uD300 \uC2A4\uD0E0\uB4DC\uC5C5 \uBBF8\uD305 \uCC38\uC11D",
      pmNotes: "\uC624\uD6C4 \uC5C5\uBB34: \uAE30\uB2A5 \uAC1C\uBC1C (\uC0AC\uC6A9\uC790 \uC778\uC99D \uBAA8\uB4C8), \uB2E8\uC704 \uD14C\uC2A4\uD2B8 \uC791\uC131"
    },
    {
      date: "2026-02-24",
      amNotes: "\uC624\uC804 \uC5C5\uBB34: \uBC31\uC5D4\uB4DC API \uC124\uACC4 \uBB38\uC11C \uC791\uC131, \uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC2A4\uD0A4\uB9C8 \uAC80\uD1A0",
      pmNotes: "\uC624\uD6C4 \uC5C5\uBB34: API \uC5D4\uB4DC\uD3EC\uC778\uD2B8 \uAD6C\uD604, \uD1B5\uD569 \uD14C\uC2A4\uD2B8 \uC2E4\uD589"
    },
    {
      date: "2026-02-25",
      amNotes: "\uC624\uC804 \uC5C5\uBB34: \uBC84\uADF8 \uC218\uC815 (#123, #124), QA \uD300\uACFC \uC774\uC288 \uB17C\uC758",
      pmNotes: "\uC624\uD6C4 \uC5C5\uBB34: \uB9B4\uB9AC\uC988 \uC900\uBE44, \uBC30\uD3EC \uC2A4\uD06C\uB9BD\uD2B8 \uAC80\uD1A0 \uBC0F \uC2A4\uD14C\uC774\uC9D5 \uD658\uACBD \uBC30\uD3EC"
    },
    {
      date: "2026-02-26",
      amNotes: "\uC624\uC804 \uC5C5\uBB34: \uC2A4\uD504\uB9B0\uD2B8 \uD68C\uACE0 \uBBF8\uD305, \uB2E4\uC74C \uC2A4\uD504\uB9B0\uD2B8 \uACC4\uD68D \uC218\uB9BD",
      pmNotes: "\uC624\uD6C4 \uC5C5\uBB34: \uC2E0\uADDC \uAE30\uB2A5 \uD504\uB85C\uD1A0\uD0C0\uC774\uD551, \uAE30\uC220 \uBB38\uC11C \uC5C5\uB370\uC774\uD2B8"
    },
    {
      date: "2026-02-27",
      amNotes: "\uC624\uC804 \uC5C5\uBB34: \uCF54\uB4DC \uB9AC\uD329\uD1A0\uB9C1, \uC131\uB2A5 \uCD5C\uC801\uD654 \uBD84\uC11D",
      pmNotes: "\uC624\uD6C4 \uC5C5\uBB34: \uD300 \uCF54\uB4DC \uB9AC\uBDF0, \uB2E4\uC74C \uC8FC \uC791\uC5C5 \uC6B0\uC120\uC21C\uC704 \uC815\uB9AC"
    }
  ]
};
function onProgress(progress) {
  const latest = progress.logs[progress.logs.length - 1];
  if (latest) {
    const icon = { info: "\u2139", warn: "\u26A0", error: "\u2717", success: "\u2713" }[latest.level];
    const time = new Date(latest.timestamp).toLocaleTimeString("ko-KR");
    console.log(`  [${time}] ${icon} ${latest.message}`);
  }
  if (progress.currentDay) {
  }
}
async function main() {
  console.log("\u{1F916} Playwright \uC790\uB3D9\uD654 \uD14C\uC2A4\uD2B8");
  console.log("===========================\n");
  const config = loadConfig();
  if (!config.remote.email || !config.remote.password) {
    console.error("\u274C Remote.com \uC778\uC99D \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    console.error("   .env \uD30C\uC77C\uC5D0 REMOTE_EMAIL, REMOTE_PASSWORD\uB97C \uC124\uC815\uD558\uC138\uC694.");
    process.exit(1);
  }
  console.log(`\u{1F4E7} \uACC4\uC815: ${config.remote.email}`);
  console.log(`\u{1F5A5}\uFE0F  \uD5E4\uB4DC\uB9AC\uC2A4: ${config.general.headless}`);
  console.log(`\u{1F4C5} \uC8FC\uAC04: ${MOCK_SUMMARY.weekStart} ~ ${MOCK_SUMMARY.weekEnd}
`);
  console.log("\uBAA9\uC5C5 \uC694\uC57D \uB370\uC774\uD130:");
  for (const day of MOCK_SUMMARY.days) {
    console.log(`  ${day.date}: AM="${day.amNotes.slice(0, 40)}..." PM="${day.pmNotes.slice(0, 40)}..."`);
  }
  console.log("\n[\uC790\uB3D9\uD654 \uC2DC\uC791]\n");
  try {
    await automateTimesheet(
      MOCK_SUMMARY,
      config.remote,
      config.general,
      getAuthStatePath(),
      onProgress
    );
    console.log("\n\u2705 \uC790\uB3D9\uD654 \uC644\uB8CC!");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`
\u274C \uC790\uB3D9\uD654 \uC2E4\uD328: ${msg}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}
main();
