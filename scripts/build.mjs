import { resolve } from 'node:path'
import { builtinModules } from 'node:module'
import { mkdirSync } from 'node:fs'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { externalizeDepsPlugin } from 'electron-vite'

const root = resolve(import.meta.dirname, '..')

// 部分机器上的杀软会拦截 esbuild 清理系统临时文件，报
// "remove ...\Temp\esbuild-xxx: Access is denied"。把临时目录放到项目内规避。
const tempRoot = resolve(root, '.build-cache', 'tmp')
mkdirSync(tempRoot, { recursive: true })
process.env.TMP = tempRoot
process.env.TEMP = tempRoot

const sharedAlias = {
  '@shared': resolve(root, 'src/shared')
}
const nodeExternals = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
]

await build({
  configFile: false,
  root,
  mode: 'production',
  resolve: { alias: sharedAlias },
  plugins: [externalizeDepsPlugin()],
  build: {
    outDir: resolve(root, 'out/main'),
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    lib: {
      entry: resolve(root, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: nodeExternals
    }
  }
})

await build({
  configFile: false,
  root,
  mode: 'production',
  resolve: { alias: sharedAlias },
  plugins: [externalizeDepsPlugin()],
  build: {
    outDir: resolve(root, 'out/preload'),
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    lib: {
      entry: resolve(root, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: nodeExternals
    }
  }
})

await build({
  configFile: false,
  root: resolve(root, 'src/renderer'),
  base: './',
  mode: 'production',
  resolve: {
    alias: {
      ...sharedAlias,
      '@renderer': resolve(root, 'src/renderer/src')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve(root, 'out/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
    rollupOptions: {
      input: resolve(root, 'src/renderer/index.html')
    }
  }
})

console.log('Build complete: out/main, out/preload, out/renderer')

