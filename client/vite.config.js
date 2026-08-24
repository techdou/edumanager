import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3142',
        changeOrigin: true
      },
      '/lectures': {
        target: 'http://localhost:3142',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // 把 mermaid / katex 这类大库拆到独立 vendor chunk，
        // 避免它们污染主入口和组件 chunk，便于浏览器并行加载与缓存
        manualChunks: {
          mermaid: ['mermaid'],
          katex: ['katex', '@vscode/markdown-it-katex']
        }
      }
    }
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.js']
  }
})