import type { QuestionType } from './schemas'

const TYPE_SCORE_WEIGHT: Record<QuestionType, number> = {
  single_choice: 0.9,
  fill_blank: 1,
  calculation: 1.8,
  solution: 2.6,
  proof: 3,
  application: 2.6
}

export function allocateQuestionScores(
  types: QuestionType[],
  totalScore: number
): number[] {
  if (types.length === 0) return []
  const weights = types.map((type) => TYPE_SCORE_WEIGHT[type])
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  const scores = weights.map((weight) =>
    Math.max(1, Math.floor((totalScore * weight) / weightTotal))
  )

  let difference = totalScore - scores.reduce((sum, value) => sum + value, 0)
  let index = 0
  while (difference !== 0) {
    const position = index % scores.length
    if (difference > 0) {
      scores[position] += 1
      difference -= 1
    } else if (scores[position] > 1) {
      scores[position] -= 1
      difference += 1
    }
    index += 1
    if (index > 10_000) {
      throw new Error('无法分配题目分值')
    }
  }
  return scores
}
