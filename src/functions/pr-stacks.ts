import {isDeepStrictEqual} from 'node:util'
import {API_HEADERS} from './api-headers.ts'
import type {BranchDeployOctokit} from '../types.ts'

type CompareParameters = Parameters<
  BranchDeployOctokit['rest']['repos']['compareCommits']
>[0]

export interface PrStacksOctokit {
  readonly graphql: (
    query: string,
    variables: Readonly<Record<string, unknown>>
  ) => Promise<unknown>
  readonly rest: {
    readonly repos: {
      readonly compareCommits: (
        parameters?: CompareParameters
      ) => Promise<{readonly data: unknown}>
    }
  }
}

export interface PrStackRequest {
  readonly owner: string
  readonly repo: string
  readonly pullNumber: number
  readonly expectedHeadSha: string
  readonly stableBranch: string
}

export interface PrStackMembership {
  readonly number: number
  readonly position: number
  readonly baseRef: string
}

export interface PrStackPull {
  readonly id: string
  readonly number: number
  readonly position: number
  readonly baseRef: string
  readonly baseSha: string
  readonly headRef: string
  readonly headSha: string
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED'
  readonly isDraft: boolean
}

export interface PrStackSnapshot {
  readonly repositoryId: string
  readonly repository: string
  readonly stackId: string
  readonly stackNumber: number
  readonly stableBranch: string
  readonly stableSha: string
  readonly selectedPullNumber: number
  readonly selectedPosition: number
  readonly selectedHeadSha: string
  readonly pullRequests: readonly PrStackPull[]
}

type StackIdentity = Omit<PrStackSnapshot, 'pullRequests'>

interface StackPage {
  readonly identity: StackIdentity
  readonly selected: PrStackPull
  readonly nodes: readonly unknown[]
  readonly hasNextPage: boolean
  readonly endCursor: string | null
}

const STACK_QUERY = `query BranchDeployPullRequestStack($owner:String!, $repo:String!, $pullNumber:Int!, $stableRef:String!, $cursor:String) {
  repository(owner:$owner, name:$repo) {
    id
    nameWithOwner
    ref(qualifiedName:$stableRef) { name target { oid } }
    pullRequest(number:$pullNumber) {
      id number baseRefName baseRefOid headRefName headRefOid state isDraft
      repository { id nameWithOwner }
      headRepository { id nameWithOwner }
      stackEntry { position }
      stack {
        id number size baseRefName
        entries(first:100, after:$cursor) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id position stack { id }
            pullRequest {
              id number baseRefName baseRefOid headRefName headRefOid state isDraft
              repository { id nameWithOwner }
              headRepository { id nameWithOwner }
            }
          }
        }
      }
    }
  }
}`

function invalid(reason: string): never {
  throw new Error(`Cannot verify pull request stack: ${reason}`)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) invalid('incomplete response')
  return value
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function array(value: unknown): readonly unknown[] {
  if (!isUnknownArray(value)) invalid('incomplete stack entries')
  return value
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    invalid('invalid string in response')
  }
  return value
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid('invalid number in response')
  }
  return value
}

export function parsePrStackMembership(
  value: unknown
): PrStackMembership | null {
  if (value === null || value === undefined) return null
  const membership = record(value)
  return {
    number: integer(membership['number']),
    position: integer(membership['position']),
    baseRef: string(record(membership['base'])['ref'])
  }
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid('invalid boolean in response')
  return value
}

function sha(value: unknown): string {
  const result = string(value)
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(result)) {
    invalid('invalid commit SHA')
  }
  return result.toLowerCase()
}

function state(value: unknown): PrStackPull['state'] {
  if (value !== 'OPEN' && value !== 'CLOSED' && value !== 'MERGED') {
    invalid('invalid pull request state')
  }
  return value
}

function repositoryMatches(
  value: unknown,
  repositoryId: string,
  repository: string
): void {
  const result = record(value)
  if (
    string(result['id']) !== repositoryId ||
    string(result['nameWithOwner']).toLowerCase() !== repository.toLowerCase()
  ) {
    invalid('stack members must belong to the same repository')
  }
}

function pull(
  value: unknown,
  position: number,
  repositoryId: string,
  repository: string
): PrStackPull {
  const result = record(value)
  repositoryMatches(result['repository'], repositoryId, repository)
  repositoryMatches(result['headRepository'], repositoryId, repository)
  return {
    id: string(result['id']),
    number: integer(result['number']),
    position,
    baseRef: string(result['baseRefName']),
    baseSha: sha(result['baseRefOid']),
    headRef: string(result['headRefName']),
    headSha: sha(result['headRefOid']),
    state: state(result['state']),
    isDraft: boolean(result['isDraft'])
  }
}

function page(value: unknown, request: PrStackRequest): StackPage | null {
  const result = record(record(value)['repository'])
  const repositoryId = string(result['id'])
  const repository = `${request.owner}/${request.repo}`
  repositoryMatches(result, repositoryId, repository)
  const selected = record(result['pullRequest'])
  repositoryMatches(selected['repository'], repositoryId, repository)
  if (
    integer(selected['number']) !== request.pullNumber ||
    sha(selected['headRefOid']) !== sha(request.expectedHeadSha)
  ) {
    invalid('selected pull request changed')
  }
  if (selected['stack'] === null && selected['stackEntry'] === null) return null

  const stack = record(selected['stack'])
  const selectedPosition = integer(record(selected['stackEntry'])['position'])
  const size = integer(stack['size'])
  const stable = record(result['ref'])
  if (
    string(stack['baseRefName']) !== request.stableBranch ||
    string(stable['name']) !== request.stableBranch
  ) {
    invalid('stack does not target the configured stable branch')
  }
  const identity: StackIdentity = {
    repositoryId,
    repository,
    stackId: string(stack['id']),
    stackNumber: integer(stack['number']),
    stableBranch: request.stableBranch,
    stableSha: sha(record(stable['target'])['oid']),
    selectedPullNumber: request.pullNumber,
    selectedPosition,
    selectedHeadSha: sha(request.expectedHeadSha)
  }
  const entries = record(stack['entries'])
  if (selectedPosition > size || integer(entries['totalCount']) !== size) {
    invalid('incomplete stack membership')
  }
  const pageInfo = record(entries['pageInfo'])
  const endCursor = pageInfo['endCursor']
  const nodes = array(entries['nodes'])
  if (nodes.length > 100) invalid('invalid stack page size')
  return {
    identity,
    selected: pull(selected, selectedPosition, repositoryId, repository),
    nodes,
    hasNextPage: boolean(pageInfo['hasNextPage']),
    endCursor: endCursor === null ? null : string(endCursor)
  }
}

async function readPage(
  octokit: PrStacksOctokit,
  request: PrStackRequest,
  cursor: string | null
): Promise<StackPage | null> {
  return page(
    await octokit.graphql(STACK_QUERY, {
      owner: request.owner,
      repo: request.repo,
      pullNumber: request.pullNumber,
      stableRef: `refs/heads/${request.stableBranch}`,
      cursor
    }),
    request
  )
}

async function verifyAncestor(
  octokit: PrStacksOctokit,
  request: PrStackRequest,
  base: string,
  head: string
): Promise<void> {
  const comparison = await octokit.rest.repos.compareCommits({
    owner: request.owner,
    repo: request.repo,
    base,
    head,
    headers: API_HEADERS
  })
  const data = record(comparison.data)
  if (
    data['status'] !== (base === head ? 'identical' : 'ahead') ||
    data['behind_by'] !== 0 ||
    sha(record(data['base_commit'])['sha']) !== base ||
    sha(record(data['merge_base_commit'])['sha']) !== base
  ) {
    invalid('stack is not linear; rebase the stack and try again')
  }
}

export async function resolvePrStack(
  octokit: PrStacksOctokit,
  request: PrStackRequest
): Promise<PrStackSnapshot | null> {
  const firstPage = await readPage(octokit, request, null)
  if (firstPage === null) return null

  const members: PrStackPull[] = []
  const entryIds = new Set<string>()
  const pullIds = new Set<string>()
  const pullNumbers = new Set<number>()
  const headRefs = new Set([firstPage.identity.stableBranch])
  const cursors = new Set<string>()
  let currentPage = firstPage

  while (members.length < firstPage.identity.selectedPosition) {
    const previousCount = members.length
    for (const value of currentPage.nodes) {
      if (members.length === firstPage.identity.selectedPosition) break
      const entry = record(value)
      const entryId = string(entry['id'])
      const position = integer(entry['position'])
      const member = pull(
        entry['pullRequest'],
        position,
        firstPage.identity.repositoryId,
        firstPage.identity.repository
      )
      if (
        string(record(entry['stack'])['id']) !== firstPage.identity.stackId ||
        position !== members.length + 1 ||
        entryIds.has(entryId) ||
        pullIds.has(member.id) ||
        pullNumbers.has(member.number) ||
        headRefs.has(member.headRef)
      ) {
        invalid('invalid or duplicate stack membership')
      }
      entryIds.add(entryId)
      pullIds.add(member.id)
      pullNumbers.add(member.number)
      headRefs.add(member.headRef)
      members.push(member)
    }
    if (members.length === firstPage.identity.selectedPosition) break
    if (
      members.length === previousCount ||
      !currentPage.hasNextPage ||
      currentPage.endCursor === null ||
      cursors.has(currentPage.endCursor)
    ) {
      invalid('incomplete stack membership')
    }
    cursors.add(currentPage.endCursor)
    const nextPage = await readPage(octokit, request, currentPage.endCursor)
    if (
      nextPage === null ||
      !isDeepStrictEqual(nextPage.identity, firstPage.identity) ||
      !isDeepStrictEqual(nextPage.selected, firstPage.selected)
    ) {
      invalid('stack changed while it was being read')
    }
    currentPage = nextPage
  }

  if (!isDeepStrictEqual(members.at(-1), firstPage.selected)) {
    invalid('selected pull request does not match its stack entry')
  }

  const pullRequests: PrStackPull[] = []
  let baseRef = firstPage.identity.stableBranch
  let baseSha = firstPage.identity.stableSha
  for (const member of members) {
    if (member.state === 'MERGED' && pullRequests.length === 0) continue
    if (member.state !== 'OPEN') {
      invalid('stack contains a closed or unexpectedly merged pull request')
    }
    if (member.baseRef !== baseRef || member.baseSha !== baseSha) {
      invalid('stack is not linear; rebase the stack and try again')
    }
    await verifyAncestor(octokit, request, baseSha, member.headSha)
    pullRequests.push(member)
    baseRef = member.headRef
    baseSha = member.headSha
  }
  if (pullRequests.at(-1)?.number !== request.pullNumber) {
    invalid('selected pull request is not open')
  }
  return {
    ...firstPage.identity,
    pullRequests
  }
}

export async function prStackSnapshotMatches(
  octokit: PrStacksOctokit,
  snapshot: PrStackSnapshot
): Promise<boolean> {
  const separator = snapshot.repository.indexOf('/')
  const current = await resolvePrStack(octokit, {
    owner: snapshot.repository.slice(0, separator),
    repo: snapshot.repository.slice(separator + 1),
    pullNumber: snapshot.selectedPullNumber,
    expectedHeadSha: snapshot.selectedHeadSha,
    stableBranch: snapshot.stableBranch
  })
  return current !== null && isDeepStrictEqual(snapshot, current)
}
