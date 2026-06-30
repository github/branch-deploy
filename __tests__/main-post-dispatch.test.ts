import assert from 'node:assert/strict'
import {mock, test} from 'node:test'
import {
  assertCalledTimes,
  createMock,
  installModuleMock
} from './node-test-helpers.ts'

type ActionsCore = typeof import('../src/actions-core.ts')
type PostModule = typeof import('../src/functions/post.ts')

const getStateMock = createMock<ActionsCore['getState']>(() => 'true')
const postMock = createMock<PostModule['post']>(() => Promise.resolve())

installModuleMock(mock, new URL('../src/actions-core.ts', import.meta.url), {
  debug: createMock<ActionsCore['debug']>(),
  error: createMock<ActionsCore['error']>(),
  getBooleanInput: createMock<ActionsCore['getBooleanInput']>(() => false),
  getInput: createMock<ActionsCore['getInput']>(() => ''),
  getState: getStateMock,
  info: createMock<ActionsCore['info']>(),
  saveState: createMock<ActionsCore['saveState']>(),
  setFailed: createMock<ActionsCore['setFailed']>(),
  setOutput: createMock<ActionsCore['setOutput']>(),
  warning: createMock<ActionsCore['warning']>()
})
installModuleMock(mock, new URL('../src/functions/post.ts', import.meta.url), {
  post: postMock
})

await import('../src/main.ts')

test('import dispatches post mode when the saved state requests it', () => {
  assertCalledTimes(postMock, 1)
  assert.strictEqual(getStateMock.mock.callCount() > 0, true)
})
