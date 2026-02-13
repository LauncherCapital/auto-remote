import { existsSync } from 'fs'
import { chromium } from 'playwright'
import type { RemoteConfig, GeneralConfig } from '../types'
import { URLS, SELECTORS, TIMEOUTS } from './selectors'

export async function ensureAuthenticated(
  config: RemoteConfig,
  generalConfig: GeneralConfig,
  authStatePath: string
): Promise<void> {
  if (existsSync(authStatePath)) {
    const isValid = await validateExistingSession(generalConfig, authStatePath)
    if (isValid) return
  }

  await performFreshLogin(config, generalConfig, authStatePath)
}

async function validateExistingSession(
  generalConfig: GeneralConfig,
  authStatePath: string
): Promise<boolean> {
  const browser = await chromium.launch({
    headless: generalConfig.headless,
    slowMo: generalConfig.slowMo,
  })

  try {
    const context = await browser.newContext({ storageState: authStatePath })
    const page = await context.newPage()
    await page.goto(URLS.timeTracking, { timeout: TIMEOUTS.navigation })

    const url = page.url()
    const isAuthenticated = !url.includes('/login')

    await context.close()
    return isAuthenticated
  } catch {
    return false
  } finally {
    await browser.close()
  }
}

async function performFreshLogin(
  config: RemoteConfig,
  generalConfig: GeneralConfig,
  authStatePath: string
): Promise<void> {
  const browser = await chromium.launch({
    headless: generalConfig.headless,
    slowMo: generalConfig.slowMo,
  })

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(URLS.login, { timeout: TIMEOUTS.navigation })

    await page.fill(SELECTORS.emailInput, config.email)
    await page.fill(SELECTORS.passwordInput, config.password)
    await page.click(SELECTORS.loginButton)

    await page.waitForURL(
      (url) => !url.toString().includes('/login'),
      { timeout: TIMEOUTS.loginComplete }
    )

    await context.storageState({ path: authStatePath })
    await context.close()
  } finally {
    await browser.close()
  }
}
