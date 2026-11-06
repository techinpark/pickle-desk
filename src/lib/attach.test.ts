import { describe, expect, it } from 'vitest'
import { driveFileIds, withImageLinks, withoutImageLines } from './attach'

describe('image links in tasks', () => {
  it('appends links on their own lines and reads them back', () => {
    const text = withImageLinks('정리해 줘', ['a1', 'b_2-x'], '첨부 이미지')
    expect(text).toBe('정리해 줘\n\n첨부 이미지: https://drive.google.com/file/d/a1/view\n첨부 이미지: https://drive.google.com/file/d/b_2-x/view')
    expect(driveFileIds(text)).toEqual(['a1', 'b_2-x'])
    expect(withoutImageLines(text)).toBe('정리해 줘')
    expect(withImageLinks('그대로', [], 'x')).toBe('그대로')
  })

  it('keeps Drive links that are part of a sentence', () => {
    const text = '이 파일 https://drive.google.com/file/d/zz/view 요약해 줘'
    expect(withoutImageLines(text)).toBe(text)
    expect(driveFileIds(text)).toEqual(['zz'])
  })
})
