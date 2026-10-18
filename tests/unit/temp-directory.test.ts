import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createTempDirectory,
  tempBaseDirectories
} from '../../src/main/export/temp'

const created: string[] = []

afterAll(async () => {
  for (const directory of created) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
})

describe('export temp directories', () => {
  it('creates a temp directory in the first writable base', async () => {
    const base = path.join(os.tmpdir(), `lingdian-test-${process.pid}`)
    created.push(base)
    const directory = await createTempDirectory('probe-', [base])
    created.push(directory)
    expect(directory.startsWith(base)).toBe(true)
    expect((await fs.stat(directory)).isDirectory()).toBe(true)
  })

  it('falls back when the first base cannot be created', async () => {
    const blocker = path.join(os.tmpdir(), `lingdian-blocker-${process.pid}`)
    created.push(blocker)
    await fs.writeFile(blocker, 'not a directory')
    const fallback = path.join(os.tmpdir(), `lingdian-fallback-${process.pid}`)
    created.push(fallback)
    const directory = await createTempDirectory('probe-', [
      path.join(blocker, 'nested'),
      fallback
    ])
    created.push(directory)
    expect(directory.startsWith(fallback)).toBe(true)
  })

  it('reports a clear error when every base fails', async () => {
    const blocker = path.join(os.tmpdir(), `lingdian-blocker-all-${process.pid}`)
    created.push(blocker)
    await fs.writeFile(blocker, 'not a directory')
    await expect(createTempDirectory('probe-', [path.join(blocker, 'x')])).rejects.toThrow(
      /无法创建临时目录/
    )
  })

  it('keeps the system temp directory first and deduplicates bases', () => {
    const bases = tempBaseDirectories()
    expect(bases[0]).toBe(os.tmpdir())
    expect(new Set(bases).size).toBe(bases.length)
  })
})
