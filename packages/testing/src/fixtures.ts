import type { RawTranscript } from '@transcript-sdk/core'

export interface MockTranscriptOptions {
  /** Approximate word count (default: 200) */
  words?: number
  /** Language hint: 'en' | 'ru' | 'mixed' (default: 'en') */
  language?: 'en' | 'ru' | 'mixed'
  /** Include a fake PII entry for testing redaction */
  includePii?: boolean
}

const EN_SENTENCES = [
  'Alice opened the meeting and reviewed the agenda.',
  'Bob suggested moving the deadline to Friday.',
  'The team agreed to adopt PostgreSQL for primary storage.',
  'Carol will update the API documentation by end of week.',
  'Dave raised concerns about the current test coverage.',
  'The budget for Q2 was approved at fifty thousand dollars.',
  'Everyone agreed the onboarding process needs improvement.',
  'The next sprint will focus on performance optimization.',
  'Alice action item: schedule a follow-up meeting.',
  'Bob will create a migration plan for the database.',
]

const RU_SENTENCES = [
  'Алиса открыла встречу и озвучила повестку дня.',
  'Боб предложил перенести дедлайн на пятницу.',
  'Команда решила использовать PostgreSQL как основную базу данных.',
  'Карол обновит документацию по API до конца недели.',
  'Дейв поднял вопрос о текущем покрытии тестами.',
  'Бюджет на второй квартал был утверждён.',
  'Все согласились, что процесс онбординга требует улучшения.',
  'Следующий спринт будет сосредоточен на оптимизации производительности.',
  'Задача Алисы: назначить встречу для обсуждения итогов.',
  'Боб составит план миграции базы данных.',
]

export function createMockTranscript(options: MockTranscriptOptions = {}): RawTranscript {
  const { words = 200, language = 'en', includePii = false } = options

  const sentences =
    language === 'ru'
      ? RU_SENTENCES
      : language === 'mixed'
        ? EN_SENTENCES.map((s, i) => (i % 2 === 0 ? s : RU_SENTENCES[i] ?? s))
        : EN_SENTENCES

  let text = ''
  while (text.split(/\s+/).length < words) {
    text += sentences.join(' ') + ' '
  }

  // Trim to approximate word count
  const wordArray = text.trim().split(/\s+/)
  text = wordArray.slice(0, words).join(' ') + '.'

  if (includePii) {
    text = `Contact alice@example.com or call 555-123-4567 before the meeting. ${text}`
  }

  return {
    text,
    metadata: { language, generatedBy: '@transcript-sdk/testing' },
  }
}
