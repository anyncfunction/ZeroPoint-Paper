export function normalizeStem(stem: string): string {
  return stem
    .normalize('NFKC')
    .replace(/[\s，。！？、；：,.!?;:（）()【】[\]《》<>]/g, '')
    .toLowerCase()
}

function shingles(value: string, size = 3): Set<string> {
  const normalized = normalizeStem(value).replace(/\\[a-zA-Z]+|[{}^_$]/g, '')
  const grams = new Set<string>()
  if (normalized.length <= size) {
    if (normalized) grams.add(normalized)
    return grams
  }
  for (let index = 0; index <= normalized.length - size; index += 1) {
    grams.add(normalized.slice(index, index + size))
  }
  return grams
}

export function stemSimilarity(left: string, right: string): number {
  const a = shingles(left)
  const b = shingles(right)
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) {
    if (b.has(gram)) shared += 1
  }
  return shared / (a.size + b.size - shared)
}

export function isNearDuplicate(
  stem: string,
  corpus: string[],
  threshold = 0.82
): boolean {
  if (corpus.length === 0) return false
  const normalized = normalizeStem(stem)
  for (const candidate of corpus) {
    if (normalizeStem(candidate) === normalized) return true
    if (stemSimilarity(stem, candidate) >= threshold) return true
  }
  return false
}
