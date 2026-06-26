declare module 'github-username-regex-js' {
  const githubUsernameRegex: RegExp
  export default githubUsernameRegex
}

declare module 'nunjucks' {
  interface ConfigureOptions {
    autoescape?: boolean
  }

  interface Nunjucks {
    configure(options: ConfigureOptions): void
    render(path: string, context: Record<string, unknown>): string
  }

  const nunjucks: Nunjucks
  export default nunjucks
}

declare module 'yargs-parser' {
  interface Arguments extends Record<string, unknown> {
    _: Array<number | string>
  }

  export default function parse(args: string): Arguments
}
