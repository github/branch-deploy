import * as core from '@actions/core'
import {nakedCommandCheck} from '../../src/functions/naked-command-check'
import {COLORS} from '../../src/functions/colors'

const docs =
  'https://github.com/github/branch-deploy/blob/main/docs/naked-commands.md'
const warningMock = jest.spyOn(core, 'warning')

var context
var octokit
var triggers
var param_separator

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})

  process.env.INPUT_GLOBAL_LOCK_FLAG = '--global'

  triggers = ['.deploy', '.noop', '.lock', '.unlock', '.wcid']
  param_separator = '|'

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    },
    payload: {
      comment: {
        id: '1'
      }
    }
  }

  octokit = {
    rest: {
      reactions: {
        createForIssueComment: jest.fn().mockReturnValueOnce({
          data: {}
        })
      },
      issues: {
        createComment: jest.fn().mockReturnValueOnce({
          data: {}
        })
      }
    }
  }
})

test('checks the command and finds that it is naked', async () => {
  const body = '.deploy'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
  expect(warningMock).toHaveBeenCalledWith(
    `🩲 naked commands are ${COLORS.warning}not${COLORS.reset} allowed based on your configuration: ${COLORS.highlight}${body}${COLORS.reset}`
  )
  expect(warningMock).toHaveBeenCalledWith(
    `📚 view the documentation around ${COLORS.highlight}naked commands${COLORS.reset} to learn more: ${docs}`
  )
})

test('checks the command and finds that it is naked (noop)', async () => {
  const body = '.noop'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})

test('checks the command and finds that it is naked (lock)', async () => {
  const body = '.lock'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})

test('checks the command and finds that it is naked (lock) with a reason', async () => {
  const body = '.lock --reason I am testing a big change'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})

test('checks the command and finds that it is NOT naked (lock) with a reason', async () => {
  const body = '.lock production --reason I am testing a big change'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(false)
})

test('checks the command and finds that it is naked (unlock)', async () => {
  const body = '.unlock'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})

test('checks the command and finds that it is NOT naked because it is global', async () => {
  const body = '.unlock --global'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(false)
})

test('checks the command and finds that it is naked (alias)', async () => {
  const body = '.wcid'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})

test('checks the command and finds that it is naked (whitespaces)', async () => {
  const body = '.deploy     '
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})

test('checks the command and finds that it is not naked', async () => {
  const body = '.deploy production'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(false)
})

test('checks the command and finds that it is not naked with "to"', async () => {
  const body = '.deploy to production'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(false)
})

test('checks the command and finds that it is not naked with an alias lock command', async () => {
  const body = '.wcid staging '
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(false)
})

test('checks the command and finds that it is naked with params', async () => {
  const body = '.deploy | cpus=1 memory=2g,3g env=production'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})

test('checks the command and finds that it is naked with params and extra whitespace', async () => {
  const body = '.deploy  | cpus=1 memory=2g,3g env=production'
  expect(
    await nakedCommandCheck(body, param_separator, triggers, octokit, context)
  ).toBe(true)
})
