const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico')

async function main() {
  const root = path.resolve(__dirname, '..')
  const svg = path.join(root, 'resources', 'icon.svg')
  const pngPath = path.join(root, 'resources', 'icon.png')
  const icoPath = path.join(root, 'resources', 'icon.ico')
  const tempDir = path.join(root, 'resources', '.icon-sizes')

  await fs.mkdir(tempDir, { recursive: true })
  await sharp(svg).resize(512, 512).png().toFile(pngPath)

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const files = []
  for (const size of sizes) {
    const target = path.join(tempDir, `icon-${size}.png`)
    await sharp(svg).resize(size, size).png().toFile(target)
    files.push(target)
  }
  const ico = await pngToIco.default(files)
  await fs.writeFile(icoPath, ico)
  await fs.rm(tempDir, { recursive: true, force: true })
  console.log(`Generated ${pngPath}`)
  console.log(`Generated ${icoPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

