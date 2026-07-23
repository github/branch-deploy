declare module 'yargs-parser' {
  interface Arguments extends Record<string, unknown> {
    _: (number | string)[]
  }

  export default function parse(args: string): Arguments
}
