export const LOCK_METADATA = {
  lockInfoFlags: [' --info', ' --i', ' -i', ' --details', ' --d', ' -d'],
  lockBranchSuffix: 'branch-deploy-lock',
  globalLockBranch: 'global-branch-deploy-lock',
  lockCommitMsg: 'lock [skip ci]',
  lockFile: 'lock.json'
} as const satisfies {
  readonly globalLockBranch: string
  readonly lockBranchSuffix: string
  readonly lockCommitMsg: string
  readonly lockFile: string
  readonly lockInfoFlags: readonly string[]
}
