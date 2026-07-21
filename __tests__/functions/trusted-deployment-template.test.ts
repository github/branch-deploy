import assert from 'node:assert/strict'
import {beforeEach, test} from 'node:test'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {
  loadTrustedDeploymentTemplate,
  type TrustedTemplateOctokit
} from '../../src/functions/trusted-deployment-template.ts'
import {createContext} from '../test-helpers.ts'
import {assertNotCalled, createMock} from '../node-test-helpers.ts'

type GetContent = TrustedTemplateOctokit['rest']['repos']['getContent']

const getContentMock = createMock<GetContent>()
const octokit: TrustedTemplateOctokit = {
  rest: {repos: {getContent: getContentMock}}
}
const context = createContext({repo: {owner: 'corp', repo: 'test'}})
const trustedSha = '0123456789abcdef0123456789abcdef01234567'

beforeEach(() => {
  getContentMock.mock.resetCalls()
})

test('loads and decodes a repository-relative template at the exact trusted SHA', async () => {
  const template = '# Deployment\n\n{{ results }}\n'
  getContentMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(template, 'utf8').toString('base64')
      }
    })
  )

  assert.strictEqual(
    await loadTrustedDeploymentTemplate(
      octokit,
      context,
      '.github/deployment_message.md',
      trustedSha
    ),
    template
  )
  assert.deepStrictEqual(
    getContentMock.mock.calls.map(call => call.arguments),
    [
      [
        {
          owner: 'corp',
          repo: 'test',
          path: '.github/deployment_message.md',
          ref: trustedSha,
          headers: API_HEADERS
        }
      ]
    ]
  )
})

test('accepts a 64-character immutable trusted SHA', async () => {
  const sha = 'a'.repeat(64)
  getContentMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {type: 'file', encoding: 'base64', content: ''}
    })
  )

  assert.strictEqual(
    await loadTrustedDeploymentTemplate(octokit, context, 'message.md', sha),
    ''
  )
  assert.strictEqual(getContentMock.mock.calls[0]?.arguments[0]?.ref, sha)
})

test('accepts an uppercase immutable SHA and preserves a UTF-8 path and template', async () => {
  const sha = 'ABCDEF0123456789'.repeat(4)
  const path = 'docs/déploiement 🚀.md'
  const template = '# Déploiement 🚀\n\nRésultat: {{ results }}\n'
  getContentMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(template, 'utf8').toString('base64')
      }
    })
  )

  assert.strictEqual(
    await loadTrustedDeploymentTemplate(octokit, context, path, sha),
    template
  )
  assert.deepStrictEqual(getContentMock.mock.calls[0]?.arguments[0], {
    owner: 'corp',
    repo: 'test',
    path,
    ref: sha,
    headers: API_HEADERS
  })
})

test('returns null when the trusted SHA does not contain the template', async () => {
  getContentMock.mock.mockImplementation(() =>
    Promise.reject(Object.assign(new Error('Not Found'), {status: 404}))
  )

  assert.strictEqual(
    await loadTrustedDeploymentTemplate(
      octokit,
      context,
      '.github/missing.md',
      trustedSha
    ),
    null
  )
})

const invalidPaths = [
  '',
  '/',
  '/etc/passwd',
  '.',
  '..',
  './message.md',
  '../message.md',
  'docs/../message.md',
  'docs/./message.md',
  'docs//message.md',
  'docs/',
  'docs\\message.md',
  'C:\\message.md'
] as const

for (const path of invalidPaths) {
  test(`rejects invalid repository path ${JSON.stringify(path)}`, async () => {
    await assert.rejects(
      loadTrustedDeploymentTemplate(octokit, context, path, trustedSha),
      new Error(
        'deploy_message_path must be a repository-relative path without traversal segments'
      )
    )
    assertNotCalled(getContentMock)
  })
}

const invalidShas = [
  '',
  'main',
  '0123456789abcdef0123456789abcdef0123456',
  '0123456789abcdef0123456789abcdef012345678',
  'g'.repeat(40),
  `${trustedSha}\n`
] as const

for (const sha of invalidShas) {
  test(`rejects invalid trusted SHA ${JSON.stringify(sha)}`, async () => {
    await assert.rejects(
      loadTrustedDeploymentTemplate(octokit, context, 'message.md', sha),
      new Error('Trusted deployment template SHA is invalid')
    )
    assertNotCalled(getContentMock)
  })
}

const invalidResponses: readonly unknown[] = [
  null,
  'file',
  [],
  {},
  {type: 'dir', encoding: 'base64', content: ''},
  {type: 'file'},
  {type: 'file', encoding: 'utf-8', content: ''},
  {type: 'file', encoding: 'base64'},
  {type: 'file', encoding: 'base64', content: 123}
]

for (const [index, data] of invalidResponses.entries()) {
  test(`rejects non-file Contents API response ${index + 1}`, async () => {
    getContentMock.mock.mockImplementation(() => Promise.resolve({data}))

    await assert.rejects(
      loadTrustedDeploymentTemplate(octokit, context, 'message.md', trustedSha),
      new Error('Trusted deployment template response is not a file')
    )
  })
}

test('propagates non-404 Contents API failures', async () => {
  const failure = Object.assign(new Error('Forbidden'), {status: 403})
  getContentMock.mock.mockImplementation(() => Promise.reject(failure))

  await assert.rejects(
    loadTrustedDeploymentTemplate(octokit, context, 'message.md', trustedSha),
    failure
  )
})
