import type { Paper, Question, QuestionType } from './schemas'
import { allocateQuestionScores } from './scoring'

export function reflowScores(paper: Paper): Paper {
  const questions = paper.sections.flatMap((section) => section.questions)
  if (questions.length === 0) return paper
  const scores = allocateQuestionScores(
    questions.map((question) => question.type),
    paper.config.totalScore
  )
  let cursor = 0
  const next = structuredClone(paper)
  for (const section of next.sections) {
    for (const question of section.questions) {
      question.score = scores[cursor] ?? 1
      cursor += 1
    }
  }
  return next
}

export function syncPlan(paper: Paper): Paper {
  const next = structuredClone(paper)
  next.plan.sections = next.sections.map((section) => {
    const existing = next.plan.sections.find((item) => item.type === section.type)
    return {
      type: section.type,
      title: section.title,
      questionCount: section.questions.length,
      scorePerQuestion:
        section.questions.length > 0
          ? Math.max(
              1,
              Math.round(
                section.questions.reduce((sum, question) => sum + question.score, 0) /
                  section.questions.length
              )
            )
          : existing?.scorePerQuestion ?? 1,
      chapterIds: section.questions.map((question) => question.chapterId),
      difficulties: section.questions.map((question) => question.difficulty)
    }
  })
  next.plan.totalQuestions = next.sections.reduce(
    (sum, section) => sum + section.questions.length,
    0
  )
  next.plan.totalScore = next.sections.reduce(
    (sum, section) =>
      sum + section.questions.reduce((inner, question) => inner + question.score, 0),
    0
  )
  return next
}

export function moveQuestion(
  paper: Paper,
  sectionIndex: number,
  questionIndex: number,
  direction: -1 | 1
): Paper {
  const next = structuredClone(paper)
  const section = next.sections[sectionIndex]
  if (!section) return paper
  const target = questionIndex + direction
  if (target < 0 || target >= section.questions.length) return paper
  const current = section.questions[questionIndex]
  section.questions[questionIndex] = section.questions[target]
  section.questions[target] = current
  return syncPlan(reflowScores(next))
}

export function deleteQuestion(
  paper: Paper,
  sectionIndex: number,
  questionIndex: number
): Paper {
  const next = structuredClone(paper)
  const section = next.sections[sectionIndex]
  if (!section || section.questions.length <= 1) {
    throw new Error('每种题型至少保留一道题')
  }
  section.questions.splice(questionIndex, 1)
  return syncPlan(reflowScores(next))
}

export function duplicateQuestion(
  paper: Paper,
  sectionIndex: number,
  questionIndex: number,
  newId: string
): Paper {
  const next = structuredClone(paper)
  const section = next.sections[sectionIndex]
  const question = section?.questions[questionIndex]
  if (!section || !question) return paper
  const copy: Question = { ...structuredClone(question), id: newId }
  section.questions.splice(questionIndex + 1, 0, copy)
  return syncPlan(reflowScores(next))
}

export function sectionTypeAt(paper: Paper, sectionIndex: number): QuestionType | undefined {
  return paper.sections[sectionIndex]?.type
}
