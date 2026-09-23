import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  usePlanChangeProposal,
  useProposalApprovalStatements,
} from '@/features/activity/api/proposal';
import { ActivityPage, ProposalReadback } from './activity';

vi.mock('@/features/activity/api/activity', () => ({
  useActivities: () => ({
    data: { data: [], meta: { total: 0, page: 1, limit: 100 } },
    isPending: false,
    isError: false,
  }),
  useActivity: () => ({ isPending: true }),
}));
vi.mock('@/features/activity/api/proposal', () => ({
  usePlanChangeProposal: vi.fn(),
  useProposalApprovalStatements: vi.fn(),
}));

describe('ActivityPage', () => {
  it('shows a real empty state without a capture form or preview data', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <ActivityPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('No activities recorded.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Activity' })).not.toBeInTheDocument();
    expect(screen.queryByText(/sample data is shown/i)).not.toBeInTheDocument();
  });

  it('does not disguise statement overflow as an empty or approved audit', () => {
    vi.mocked(usePlanChangeProposal).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        id: 'proposal-1',
        state: 'proposed',
        summary: 'Fictional pending move',
        currentRevisionId: 'revision-1',
        proposedAt: '2026-09-24T15:00:00.000Z',
        proposedBy: { kind: 'agent_token', id: 'agent-1' },
        effects: [{ kind: 'activity_assignment_reschedule', plannedLocalDate: '2026-09-29' }],
        approval: null,
      },
    } as never);
    vi.mocked(useProposalApprovalStatements).mockReturnValue({
      isPending: false,
      isError: true,
      error: new ApiError(
        422,
        'Approval statement audit exceeds the supported read limit.',
        'PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT_EXCEEDED',
      ),
      refetch: vi.fn(),
    } as never);
    render(
      <MemoryRouter>
        <ProposalReadback id="proposal-1" />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('Statement audit unavailable; no statement list was returned.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('422');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT_EXCEEDED',
    );
    expect(screen.getByText('Approval pending; no plan effect executed.')).toBeInTheDocument();
    expect(screen.queryByText('No statement captured.')).not.toBeInTheDocument();
  });
});
