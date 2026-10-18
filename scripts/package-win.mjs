import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const outputDir = resolve(root, 'release', pkg.version)

// 部分机器上的杀软会拦截 app-builder 在 %LOCALAPPDATA% 下建目录，报
// "mkdir ...\AppData\Local\electron-builder: Access is denied"。
// 这里默认把下载缓存放到项目内；外部已显式指定时保持原样。
const cacheRoot = resolve(root, '.build-cache')
for (const [variable, folder] of [
  ['ELECTRON_BUILDER_CACHE', 'electron-builder'],
  ['ELECTRON_CACHE', 'electron']
]) {
  const external = process.env[variable]
  if (external) {
    console.log(`${variable} 已由环境变量指定：${external}`)
    continue
  }
  const target = resolve(cacheRoot, folder)
  mkdirSync(target, { recursive: true })
  process.env[variable] = target
  console.log(`${variable} 使用项目内缓存：${target}`)
}

// 系统临时目录在本机可能不可写，makensis 会报 "!tempfile: Unable to create
// temporary file"。统一改到项目内的临时目录。
const tempRoot = resolve(cacheRoot, 'tmp')
mkdirSync(tempRoot, { recursive: true })
process.env.TMP = tempRoot
process.env.TEMP = tempRoot

// 直连 GitHub 下载 electron-builder 的 NSIS 工具链在国内经常超时，
// 默认走 npmmirror；需要时可用环境变量覆盖。
if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
    'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'
  console.log(`NSIS 工具链镜像：${process.env.ELECTRON_BUILDER_BINARIES_MIRROR}`)
}

// 优先复用 node_modules 里已安装的 Electron，省掉上百 MB 的重复下载。
const localElectronDist = resolve(root, 'node_modules', 'electron', 'dist')
const extraArgs = existsSync(localElectronDist)
  ? [`--config.electronDist=${localElectronDist}`]
  : []
if (extraArgs.length > 0) {
  console.log(`复用本地 Electron：${localElectronDist}`)
}

console.log(`Packaging version ${pkg.version} into ${outputDir}`)

const builderCli = resolve(root, 'node_modules/electron-builder/out/cli/cli.js')
const result = spawnSync(
  process.execPath,
  [builderCli, '--win', 'nsis', `--config.directories.output=${outputDir}`, ...extraArgs],
  { cwd: root, stdio: 'inherit', env: process.env }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const expected = resolve(outputDir, `零点出卷-${pkg.version}-安装版.exe`)
console.log(existsSync(expected) ? `Installer: ${expected}` : `Output directory: ${outputDir}`)
