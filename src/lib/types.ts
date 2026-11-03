export const STATUSES = ['pending', 'running', 'done', 'failed'] as const
export type Status = (typeof STATUSES)[number]

export const CATEGORIES = ['task', 'briefing', 'idea', 'quick_action'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Task {
  id: number
  task: string
  status: Status
  reply: string
  result: string
  category: Category
  createdAt: string
  updatedAt: string | null
}

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'unauthorized' | 'error'

/** 작업을 어디서 보냈는지(입력창 / 빠른 지시). */
export type TaskSource = 'composer' | 'preset'
