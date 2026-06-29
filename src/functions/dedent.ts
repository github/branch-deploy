export function dedent(value: string): string {
  let result = value.replace(/\r?\n([\t ]*)$/, '')
  const indentations = result.match(/\n[\t ]+/g)

  if (indentations !== null) {
    const size = Math.min(
      ...indentations.map(indentation => indentation.length - 1)
    )
    result = result.replace(new RegExp(`\\n[\\t ]{${size}}`, 'g'), '\n')
  }

  return result.replace(/^\r?\n/, '')
}
