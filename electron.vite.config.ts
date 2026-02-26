import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // @slack/web-api와 그 하위 의존성(axios, form-data, combined-stream 등)을
    // 번들에 포함시켜 런타임 모듈 누락 오류를 방지합니다.
    plugins: [externalizeDepsPlugin({ exclude: ['@slack/web-api'] })],
    resolve: {
      alias: {
        '@core': resolve('src/core')
      }
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@core': resolve('src/core')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
