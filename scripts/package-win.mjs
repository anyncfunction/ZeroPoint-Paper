import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const outputDir = resolve(root, 'release', pkg.version)

console.log(`Packaging version ${pkg.version} into ${outputDir}`)

const builderCli = resolve(root, 'node_modules/electron-builder/out/cli/cli.js')
const result = spawnSync(
  process.execPath,
  [builderCli, '--win', 'nsis', `--config.directories.output=${outputDir}`],
  { cwd: root, stdio: 'inherit' }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const expected = resolve(outputDir, `零点出卷-${pkg.version}-安装版.exe`)
console.log(existsSync(expected) ? `Installer: ${expected}` : `Output directory: ${outputDir}`)
