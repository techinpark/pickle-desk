import { describe, expect, it } from 'vitest'
import { worthNotifying } from './notify'
import type { Task } from './types'

const task = (o: Partial<Task>): Task => ({ id: 1, task: 'A', status: 'pending', category: 'task', reply: '', result: '', createdAt: '', updatedAt: null, ...o })

describe('worthNotifying', () => {
  it('fires on a new reply or when a task finishes', () => {
    expect(worthNotifying(task({}), task({ reply: '했어요' }))).toBe(true)
    expect(worthNotifying(task({ status: 'running' }), task({ status: 'done' }))).toBe(true)
    expect(worthNotifying(task({ status: 'running' }), task({ status: 'failed', reply: '못 했어요' }))).toBe(true)
  })

  it('stays quiet for starts, unchanged replies and result-only edits', () => {
    expect(worthNotifying(task({}), task({ status: 'running' }))).toBe(false)
    expect(worthNotifying(task({ status: 'done', reply: 'x' }), task({ status: 'done', reply: 'x', result: 'more' }))).toBe(false)
  })

  it('treats rows Pickle added on its own as news, but not my own new pending task', () => {
    expect(worthNotifying(undefined, task({ status: 'done', reply: '오후에 비가 와요' }))).toBe(true)
    expect(worthNotifying(undefined, task({}))).toBe(false)
  })
})
