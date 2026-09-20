// @vitest-environment jsdom
import type { ComponentType } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Route } from './route'

const state = vi.hoisted(() => ({
  role: 'user',
  summary: vi.fn(),
  tokens: vi.fn(),
  commits: vi.fn(),
}))
vi.mock('#/hooks/use-app-connection', () => ({
  useAppConnection: () => ({
    connection: {
      baseUrl: 'http://localhost:1933',
      accountId: 'account-a',
      userId: 'alice',
      apiKey: '',
      adminApiKey: '',
    },
    connectionRole: state.role,
    isConnectionRoleLoading: false,
  }),
}))
vi.mock('./-lib/api', () => ({
  fetchConsoleDashboardSummary: state.summary,
  fetchConsoleTokenSeries: state.tokens,
  fetchConsoleContextCommits: state.commits,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
beforeEach(() => {
  state.role = 'user'
  state.summary
    .mockReset()
    .mockResolvedValue({
      context_counts: { total: 0 },
      today_tokens: { total: 0 },
      today_retrievals: { total: 0 },
    })
  state.tokens.mockReset().mockResolvedValue({ items: [] })
  state.commits.mockReset().mockResolvedValue({ items: [] })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Home = Route.options.component as ComponentType & {
    preload?: () => Promise<unknown>
  }
  await Home.preload?.()
  const view = render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  )
  return () => {
    view.unmount()
    client.clear()
  }
}

it.each(['unknown', 'disabled'])(
  'shows unavailable values for %s data',
  async (reason) => {
    if (reason === 'unknown') state.role = 'unknown'
    else state.summary.mockResolvedValue({ enabled: false })
    const close = await renderHome()
    try {
      await waitFor(() => expect(screen.getAllByText('—')).toHaveLength(3), {
        timeout: 2000,
      })
      if (reason === 'unknown') expect(state.summary).not.toHaveBeenCalled()
    } finally {
      close()
    }
  },
)

it('renders successful zero measurements', async () => {
  const close = await renderHome()
  try {
    await waitFor(
      () => expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3),
      { timeout: 2000 },
    )
    expect(screen.queryByText('—')).toBeNull()
  } finally {
    close()
  }
})

it('uses each series result when the summary is disabled', async () => {
  state.summary.mockResolvedValue({ enabled: false })
  const close = await renderHome()
  try {
    await waitFor(
      () => expect(screen.getByText('tokenTrend.empty')).toBeTruthy(),
      { timeout: 2000 },
    )
    expect(screen.getByText('contextCommits.empty')).toBeTruthy()
  } finally {
    close()
  }
})
