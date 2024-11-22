import * as core from '@actions/core'
import parse from 'yargs-parser'

// Helper function to parse parameters if requested by input
// :param params: The trimmed input parameters
// :returns: A JSON object of the parameters parsed by yargs-parser
// @see https://www.npmjs.com/package/yargs-parser
export function parseParams(params) {
  // use the yarns-parser library to parse the parameters as JSON
  const parsed = parse(params)
  core.debug(
    `Parsing parameters string: ${params}, produced: ${JSON.stringify(parsed)}`
  )
  return parsed
}
