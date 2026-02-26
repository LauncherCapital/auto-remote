import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { restartScheduler, stopScheduler } from './scheduler'
import { handleDeepLink } from './oauth'

// Windows: 두 번째 인스턴스 방지 + 딥링크 처리
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 400,
    minHeight: 500,
    maxWidth: 600,
    title: '업무일지 자동화',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
    },
  })

  registerIpcHandlers(mainWindow)

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  // 16x16 monochrome document icon (PNG, base64)
  const TRAY_ICON_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdUlEQVQ4T2NkoBAwUqifYdAY8J+B4T8DFOPwBiM2LzAyMjIwMTIyMDD8/8/AwMBANReMeAPqxb8XDAwMbxj+MzAw/GdkYPj/f+ALIMpxWJqhiYmJgZmZiYGBgYVxwA2gWjQOxwDSwhFNg2EmEOEFUjQTnRcAVpMpEbWDfQoAAAAASUVORK5CYII='
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('업무일지 자동화')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        stopScheduler()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

// macOS: autoremote:// 딥링크 처리
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
  mainWindow?.show()
  mainWindow?.focus()
})

// Windows: 두 번째 인스턴스로 딥링크 전달
app.on('second-instance', (_event, argv) => {
  const url = argv.find((arg) => arg.startsWith('autoremote://'))
  if (url) handleDeepLink(url)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  // autoremote:// 프로토콜 등록 (개발 환경에서는 실행 파일 경로 지정)
  if (is.dev) {
    app.setAsDefaultProtocolClient('autoremote', process.execPath, [process.argv[1]])
  } else {
    app.setAsDefaultProtocolClient('autoremote')
  }

  createTray()
  createWindow()
  restartScheduler()

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopScheduler()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
