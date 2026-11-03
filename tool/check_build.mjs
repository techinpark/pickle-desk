// 빌드 결과물에 테스트용 가짜 토큰·클라이언트 ID 가 섞이지 않았는지 확인한다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

if (!existsSync('dist')) {
  console.error('dist 가 없음. 먼저 vite build')
  process.exit(1)
}
const needles = ['fake-access-token', 'e2e-access-token', 'test-client.apps']
const hits = walk('dist').filter((p) => needles.some((n) => readFileSync(p).includes(n)))
if (hits.length) {
  console.error('빌드에 들어가면 안 되는 값:', hits)
  process.exit(1)
}
console.log('check_build: ok')
