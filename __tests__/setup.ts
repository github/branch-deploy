import {afterEach, vi} from 'vitest'

vi.mock(import('../src/actions-core.ts'), async importOriginal => {
  const actual = await importOriginal()

  return {
    ...actual,
    debug: vi.fn<typeof actual.debug>(),
    error: vi.fn<typeof actual.error>(),
    info: vi.fn<typeof actual.info>(),
    saveState: vi.fn<typeof actual.saveState>(),
    setFailed: vi.fn<typeof actual.setFailed>(),
    setOutput: vi.fn<typeof actual.setOutput>(),
    warning: vi.fn<typeof actual.warning>()
  } satisfies typeof actual
})

afterEach(() => {
  vi.unstubAllEnvs()
})
