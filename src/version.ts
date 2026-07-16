// The version of the branch-deploy Action
// Acceptable version formats:
// - v1.0.0
// - v4.5.1
// - v10.123.44
// - etc

export const VERSION =
  'v12.0.0' as const satisfies `v${number}.${number}.${number}`
