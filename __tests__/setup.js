import {vi} from 'vitest'

// Mock @actions/core module globally to suppress output
// Individual tests can still spy on these mocked functions
vi.mock('@actions/core', async () => {
  const actual = await vi.importActual('@actions/core')
  return {
    ...actual,
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    setOutput: vi.fn(),
    saveState: vi.fn(),
    setFailed: vi.fn(),
    setSecret: vi.fn(),
    exportVariable: vi.fn(),
    addPath: vi.fn(),
    notice: vi.fn(),
    startGroup: vi.fn(),
    endGroup: vi.fn()
  }
})
