import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 有些机器上系统临时目录被安全软件或权限策略锁住，必须按顺序回退到用户目录。
export function tempBaseDirectories(): string[] {
  const candidates = [os.tmpdir()]
  const dataDirectory = process.env.LINGDIAN_DATA_DIR
  if (dataDirectory) candidates.push(path.join(dataDirectory, 'temp'))
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'lingdian-chujuan', 'temp'))
  }
  candidates.push(path.join(os.homedir(), '.lingdian-chujuan', 'temp'))
  return [...new Set(candidates.filter(Boolean))]
}

export async function createTempDirectory(
  prefix: string,
  bases: string[] = tempBaseDirectories()
): Promise<string> {
  let lastError: unknown
  for (const base of bases) {
    try {
      await fs.mkdir(base, { recursive: true })
      return await fs.mkdtemp(path.join(base, prefix))
    } catch (error) {
      lastError = error
    }
  }
  const detail = lastError instanceof Error ? lastError.message : '未知错误'
  throw new Error(`无法创建临时目录：${detail}`)
}
