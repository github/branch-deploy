import * as core from '../actions-core.ts'
import parse from 'yargs-parser'
import type {ParsedParams} from '../types.ts'

// Helper function to parse parameters if requested by input
// :param params: The trimmed input parameters
// :returns: A JSON object of the parameters parsed by yargs-parser
// @see https://www.npmjs.com/package/yargs-parser
export function parseParams(params: string | null): ParsedParams {
  // use the yarns-parser library to parse the parameters as JSON
  const parsed = parse(params ?? '')
  core.debug(
    `Parsing parameters string: ${String(params)}, produced: ${JSON.stringify(parsed)}`
  )
  return parsed
}
