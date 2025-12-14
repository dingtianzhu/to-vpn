/// <reference types="vite/client" />

/**
 * Vue 单文件组件类型声明
 * 解决 TypeScript 无法识别 .vue 文件的问题
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/**
 * 环境变量类型声明
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  // 添加更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
