import {afterEach, vi} from 'vitest'

vi.mock(import('@actions/core'), async importOriginal => {
  const actual = await importOriginal()

  return {
    ...actual,
    addPath: vi.fn<typeof actual.addPath>(),
    debug: vi.fn<typeof actual.debug>(),
    endGroup: vi.fn<typeof actual.endGroup>(),
    error: vi.fn<typeof actual.error>(),
    exportVariable: vi.fn<typeof actual.exportVariable>(),
    info: vi.fn<typeof actual.info>(),
    notice: vi.fn<typeof actual.notice>(),
    saveState: vi.fn<typeof actual.saveState>(),
    setFailed: vi.fn<typeof actual.setFailed>(),
    setOutput: vi.fn<typeof actual.setOutput>(),
    setSecret: vi.fn<typeof actual.setSecret>(),
    startGroup: vi.fn<typeof actual.startGroup>(),
    warning: vi.fn<typeof actual.warning>()
  } satisfies typeof actual
})

afterEach(() => {
  vi.unstubAllEnvs()
})
