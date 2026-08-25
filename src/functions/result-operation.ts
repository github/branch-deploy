import {isDeepStrictEqual} from 'node:util'
import * as core from '../actions-core.ts'
import {
  getActionInput,
  getBooleanActionInput,
  setActionOutput
} from '../action-io.ts'
import {decodedJsonValue} from '../trust-boundaries.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  CompletionContext,
  OperationDeploymentType,
  OperationOutcome,
  RawPostDeployData
} from '../types.ts'
import {API_HEADERS} from './api-headers.ts'
import {checkInput} from './check-input.ts'
import {completionSettings} from './deferred-completion.ts'
import {findEnvironmentUrl} from './environment-targets.ts'
import {
  completionMetadata,
  parseCompletionContext,
  parseCompletionMetadata,
  parseJobResults,
  validateResultUrl
} from './result-context.ts'
import {postDeploy} from './post-deploy.ts'
import type {PostDeployOctokit, ResultPostDeployOptions} from './post-deploy.ts'
import {stringToArray} from './string-to-array.ts'
import {validRepositoryPath} from './trusted-deployment-template.ts'

type GetComment = BranchDeployOctokit['rest']['issues']['getComment']
type GetDeployment = BranchDeployOctokit['rest']['repos']['getDeployment']

export type ResultOperationOctokit = PostDeployOctokit & {
  readonly rest: {
    readonly issues: {
      readonly getComment: (
        parameters?: Parameters<GetComment>[0]
      ) => Promise<{readonly data: unknown}>
    }
    readonly repos: {
      readonly getDeployment: (
        parameters?: Parameters<GetDeployment>[0]
      ) => Promise<{readonly data: unknown}>
    }
  }
}

export interface ResultOperationRequest {
  readonly context: BranchDeployContext
  readonly octokit: ResultOperationOctokit
  readonly trustedSha: string
}

const FAILURE_MESSAGES = {
  invalid_result_context:
    'The result context does not match the originating operation',
  invalid_result_inputs: 'The result inputs are invalid',
  result_verification_failed:
    'GitHub could not verify the originating operation',
  result_completion_failed:
    'Result completion failed; inspect the deployment and original lock before manual recovery'
} as const

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value: unknown): Readonly<Record<string, unknown>> {
  if (!isObject(value)) {
    throw new Error('Invalid result evidence')
  }
  return value
}

function same(actual: unknown, expected: unknown): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error('Result evidence does not match')
  }
}

function parsedParams(completion: CompletionContext): unknown {
  return completion.parsed_params === ''
    ? null
    : decodedJsonValue(completion.parsed_params)
}

function verifyInvocation(
  {context, trustedSha}: ResultOperationRequest,
  completion: CompletionContext
): void {
  const issue = object(context.payload.issue)
  const comment = object(context.payload.comment)
  if (
    context.eventName !== 'issue_comment' ||
    issue['pull_request'] === null ||
    issue['pull_request'] === undefined
  ) {
    throw new Error(
      'Result mode requires the original pull request comment event'
    )
  }
  same(
    {
      repository: completion.repository,
      runId: completion.run_id,
      runAttempt: String(completion.run_attempt),
      issue: completion.issue_number,
      payloadIssue: completion.issue_number,
      comment: completion.trigger_comment_id,
      actor: completion.actor,
      trustedSha: completion.trusted_sha
    },
    {
      repository: `${context.repo.owner}/${context.repo.repo}`,
      runId: context.runId,
      runAttempt: process.env['GITHUB_RUN_ATTEMPT'],
      issue: context.issue.number,
      payloadIssue: issue['number'],
      comment: comment['id'],
      actor: context.actor,
      trustedSha
    }
  )
}

function startedMetadata(body: unknown): Readonly<Record<string, unknown>> {
  if (typeof body !== 'string') throw new Error('Invalid started comment')
  const lines = body.split('\n')
  const startMarker = '<!--- pre-deploy-metadata-start -->'
  const endMarker = '<!--- pre-deploy-metadata-end -->'
  const start = lines.indexOf(startMarker)
  const end = lines.indexOf(endMarker)
  if (
    start === -1 ||
    end <= start ||
    start !== lines.lastIndexOf(startMarker) ||
    end !== lines.lastIndexOf(endMarker)
  ) {
    throw new Error('Invalid started comment metadata')
  }
  const block = lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
  const json = /^(`{3,})json\n([\s\S]*)\n\1$/u.exec(block)?.[2]
  if (json === undefined) throw new Error('Invalid started comment JSON block')
  return object(decodedJsonValue(json))
}

function verifyStartedComment(
  request: ResultOperationRequest,
  completion: CompletionContext,
  value: unknown
): OperationDeploymentType {
  const comment = object(value)
  same(comment['id'], completion.started_comment_id)
  const apiUrl = process.env['GITHUB_API_URL'] ?? 'https://api.github.com'
  same(
    comment['issue_url'],
    `${apiUrl}/repos/${completion.repository}/issues/${completion.issue_number}`
  )
  const metadata = startedMetadata(comment['body'])
  same(
    parseCompletionMetadata(metadata['completion']),
    completionMetadata(completion)
  )
  const git = object(metadata['git'])
  const origin = object(metadata['context'])
  const sourceComment = object(origin['comment'])
  const eventComment = object(request.context.payload.comment)
  same(
    {
      environment: metadata['environment'],
      deployment: metadata['deployment'],
      git: {
        branch: git['branch'],
        commit: git['commit'],
        verified: git['verified']
      },
      origin: {
        actor: origin['actor'],
        noop: origin['noop'],
        fork: origin['fork']
      },
      commentUrl: sourceComment['html_url'],
      parameters: metadata['parameters']
    },
    {
      environment: {
        name: completion.environment,
        url: completion.environment_url
      },
      deployment: {
        timestamp: completion.deployment_start_time,
        logs: `${String(process.env['GITHUB_SERVER_URL'])}/${completion.repository}/actions/runs/${completion.run_id}`
      },
      git: {
        branch: completion.ref,
        commit: completion.sha,
        verified: completion.commit_verified
      },
      origin: {
        actor: completion.actor,
        noop: completion.noop,
        fork: completion.fork
      },
      commentUrl: eventComment['html_url'],
      parameters: {
        raw: completion.params === '' ? null : completion.params,
        parsed: parsedParams(completion)
      }
    }
  )
  const type = metadata['type']
  if (completion.noop && type === 'noop') return 'noop'
  if (!completion.noop && (type === 'branch' || type === 'sha')) return type
  throw new Error('Invalid originating deployment type')
}

function verifyDeployment(completion: CompletionContext, value: unknown): void {
  const deployment = object(value)
  let payload = deployment['payload']
  for (let layer = 0; layer < 2 && typeof payload === 'string'; layer += 1) {
    payload = decodedJsonValue(payload)
  }
  const metadata = object(payload)
  same(
    parseCompletionMetadata(metadata['completion']),
    completionMetadata(completion)
  )
  same(
    {
      id: deployment['id'],
      sha: deployment['sha'],
      ref: deployment['ref'],
      environment: deployment['environment'],
      type: metadata['type'],
      checkedSha: metadata['sha'],
      runId: metadata['github_run_id'],
      commentId: metadata['initial_comment_id'],
      startedCommentId: metadata['deployment_started_comment_id'],
      reactionId: metadata['initial_reaction_id'],
      timestamp: metadata['timestamp'],
      actor: metadata['actor'],
      verified: metadata['commit_verified'],
      params: metadata['params'] === '' ? null : metadata['params'],
      parsedParams: metadata['parsed_params']
    },
    {
      id: completion.deployment_id,
      sha: completion.sha,
      ref: completion.ref,
      environment: completion.environment,
      type: 'branch-deploy',
      checkedSha: completion.sha,
      runId: completion.run_id,
      commentId: completion.trigger_comment_id,
      startedCommentId: completion.started_comment_id,
      reactionId: completion.reaction_id,
      timestamp: completion.deployment_start_time,
      actor: completion.actor,
      verified: completion.commit_verified,
      params: completion.params === '' ? null : completion.params,
      parsedParams: parsedParams(completion)
    }
  )
}

function booleanSetting(value: string): boolean {
  if (['true', 'True', 'TRUE'].includes(value)) return true
  if (['false', 'False', 'FALSE'].includes(value)) return false
  throw new Error('Invalid result boolean setting')
}

export async function runResultOperation(
  request: ResultOperationRequest
): Promise<OperationOutcome> {
  let verifiedCompletion: CompletionContext | null = null
  let deploymentType: OperationDeploymentType | null = null
  let failureCode: keyof typeof FAILURE_MESSAGES = 'invalid_result_context'
  try {
    // The caller must pass a trusted ready job output. A started comment alone
    // does not prove that a noop passed its final prechecks.
    const completion = parseCompletionContext(getActionInput('context'))
    verifyInvocation(request, completion)

    failureCode = 'invalid_result_inputs'
    const deploymentResult = parseJobResults(getActionInput('job_results'))
    const rawResultUrl = getActionInput('result_url')
    const resultUrl = rawResultUrl === '' ? '' : validateResultUrl(rawResultUrl)
    const inheritSettings = getBooleanActionInput('result_inherit_settings')
    const settings = inheritSettings
      ? completion.settings
      : completionSettings()
    const deployMessagePath = checkInput(settings.deploy_message_path)
    if (deployMessagePath !== null && !validRepositoryPath(deployMessagePath)) {
      throw new Error('Invalid result template path')
    }
    const options: ResultPostDeployOptions = {
      deployMessagePath: settings.deploy_message_path,
      environmentUrlInComment: booleanSetting(
        settings.environment_url_in_comment
      ),
      resultUrl,
      retainLock: deploymentResult === 'cancelled'
    }
    const labels = {
      successful_deploy: stringToArray(settings.successful_deploy_labels),
      failed_deploy: stringToArray(settings.failed_deploy_labels),
      successful_noop: stringToArray(settings.successful_noop_labels),
      failed_noop: stringToArray(settings.failed_noop_labels),
      skip_successful_noop_labels_if_approved: booleanSetting(
        settings.skip_successful_noop_labels_if_approved
      ),
      skip_successful_deploy_labels_if_approved: booleanSetting(
        settings.skip_successful_deploy_labels_if_approved
      )
    }

    failureCode = 'result_verification_failed'
    const started = await request.octokit.rest.issues.getComment({
      ...request.context.repo,
      comment_id: completion.started_comment_id,
      headers: API_HEADERS
    })
    const deployment =
      completion.deployment_id === null
        ? null
        : await request.octokit.rest.repos.getDeployment({
            ...request.context.repo,
            deployment_id: completion.deployment_id,
            headers: API_HEADERS
          })

    failureCode = 'invalid_result_context'
    deploymentType = verifyStartedComment(request, completion, started.data)
    if (deployment !== null) verifyDeployment(completion, deployment.data)
    verifiedCompletion = completion

    failureCode = 'invalid_result_inputs'
    const environmentUrl =
      resultUrl !== ''
        ? resultUrl
        : inheritSettings
          ? completion.environment_url
          : findEnvironmentUrl(
              completion.environment,
              getActionInput('environment_urls')
            )
    const data: RawPostDeployData = {
      ...completion,
      comment_id: String(completion.trigger_comment_id),
      deployment_id:
        completion.deployment_id === null
          ? ''
          : String(completion.deployment_id),
      reaction_id:
        completion.reaction_id === null ? '' : String(completion.reaction_id),
      environment_url: environmentUrl,
      status: deploymentResult,
      labels
    }

    failureCode = 'result_completion_failed'
    setActionOutput('deployment_result', deploymentResult)
    const completed = await postDeploy(
      request.context,
      request.octokit,
      data,
      options
    )
    if (completed === undefined)
      throw new Error('Result completion did not finish')
    if (deploymentResult !== 'success') {
      core.setFailed(`Deployment result: ${deploymentResult}`)
    }
    return {
      operation: 'result',
      runResult:
        deploymentResult === 'success' ? 'success - result mode' : 'failure',
      decision: deploymentResult === 'success' ? 'complete' : 'failure',
      reasonCode:
        deploymentResult === 'success'
          ? 'result_completed'
          : 'result_non_success',
      deploymentType,
      deploymentId: completion.deployment_id,
      environment: completion.environment,
      ref: completion.ref,
      sha: completion.sha
    }
  } catch {
    return {
      operation: 'result',
      runResult: 'failure',
      decision: 'failure',
      reasonCode: failureCode,
      deploymentType,
      deploymentId: verifiedCompletion?.deployment_id ?? null,
      environment: verifiedCompletion?.environment ?? null,
      ref: verifiedCompletion?.ref ?? null,
      sha: verifiedCompletion?.sha ?? null,
      error: new Error(FAILURE_MESSAGES[failureCode])
    }
  }
}
