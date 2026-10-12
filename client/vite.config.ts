import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],

  server: {
    port: 5173,
    host: '127.0.0.1',
    /**
     * H5 开发态把 /api 代理到后端，好处是**同源**：
     * 浏览器不会发 CORS 预检，也就不依赖后端的 cors 配置。
     * 小程序端不支持代理，那边走 config.js 里的绝对地址分支。
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
