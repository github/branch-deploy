import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import type {NakedCommandOctokit} from '../../src/functions/naked-command-check.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActionIo = typeof import('../../src/action-io.ts')
type NakedCommandModule =
  typeof import('../../src/functions/naked-command-check.ts')

const debugMock = createMock<ActionsCore['debug']>()
const warningMock = createMock<ActionsCore['warning']>()
const getActionInputMock = createMock<ActionIo['getActionInput']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  warning: warningMock
})
installModuleMock(mock, new URL('../../src/action-io.ts', import.meta.url), {
  getActionInput: getActionInputMock
})

const {nakedCommandCheck} =
  await import('../../src/functions/naked-command-check.ts')

const docs =
  'https://github.com/github/branch-deploy/blob/main/docs/naked-commands.md'

let context: Parameters<NakedCommandModule['nakedCommandCheck']>[4]
let octokit: Parameters<NakedCommandModule['nakedCommandCheck']>[3]
let triggers: Parameters<NakedCommandModule['nakedCommandCheck']>[2]
let param_separator: Parameters<NakedCommandModule['nakedCommandCheck']>[1]

beforeEach(() => {
  debugMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  getActionInputMock.mock.resetCalls()
  getActionInputMock.mock.mockImplementation(() => '--global')

  triggers = ['.deploy', '.noop', '.lock', '.unlock', '.wcid']
  param_separator = '|'

  context = createIssueCommentContext({
    repo: {owner: 'corp', repo: 'test'},
    issue: {number: 1},
    payload: {comment: {id: 1}}
  })

  octokit = {
    rest: {
      reactions: {
        createForIssueComment:
          createMock<
            NakedCommandOctokit['rest']['reactions']['createForIssueComment']
          >()
      },
      issues: {
        createComment:
          createMock<NakedCommandOctokit['rest']['issues']['createComment']>()
      }
    }
  } satisfies NakedCommandOctokit
})

test('checks the command and finds that it is naked', async () => {
  const body = '.deploy'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
  assertCalledWith(
    warningMock,
    `🩲 naked commands are ${COLORS.warning}not${COLORS.reset} allowed based on your configuration: ${COLORS.highlight}${body}${COLORS.reset}`
  )
  assertCalledWith(
    warningMock,
    `📚 view the documentation around ${COLORS.highlight}naked commands${COLORS.reset} to learn more: ${docs}`
  )
})

test('checks the command and finds that it is naked (noop)', async () => {
  const body = '.noop'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})

test('checks the command and finds that it is naked (lock)', async () => {
  const body = '.lock'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})

test('checks the command and finds that it is naked (lock) with a reason', async () => {
  const body = '.lock --reason I am testing a big change'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})

test('checks the command and finds that it is NOT naked (lock) with a reason', async () => {
  const body = '.lock production --reason I am testing a big change'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    false
  )
})

test('checks the command and finds that it is naked (unlock)', async () => {
  const body = '.unlock'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})

test('checks the command and finds that it is NOT naked because it is global', async () => {
  const body = '.unlock --global'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    false
  )
})

test('checks the command and finds that it is naked (alias)', async () => {
  const body = '.wcid'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})

test('checks the command and finds that it is naked (whitespaces)', async () => {
  const body = '.deploy     '
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})

test('checks the command and finds that it is not naked', async () => {
  const body = '.deploy production'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    false
  )
})

test('checks the command and finds that it is not naked with "to"', async () => {
  const body = '.deploy to production'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    false
  )
})

test('checks the command and finds that it is not naked with an alias lock command', async () => {
  const body = '.wcid staging '
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    false
  )
})

test('checks the command and finds that it is naked with params', async () => {
  const body = '.deploy | cpus=1 memory=2g,3g env=production'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})

test('checks the command and finds that it is naked with params and extra whitespace', async () => {
  const body = '.deploy  | cpus=1 memory=2g,3g env=production'
  assert.strictEqual(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context),
    true
  )
})
