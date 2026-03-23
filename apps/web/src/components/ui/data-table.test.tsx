import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable, type Column } from './data-table';

type Row = {
  name: string;
  calories: number;
};

const columns: Column<Row>[] = [
  {
    key: 'name',
    header: 'Name',
    accessor: (row) => row.name,
  },
  {
    key: 'calories',
    header: 'Calories',
    accessor: (row) => row.calories,
  },
];

describe('DataTable', () => {
  it('renders provided columns and rows', () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { name: 'Greek yogurt', calories: 120 },
          { name: 'Banana', calories: 90 },
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Calories' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Greek yogurt' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '120' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Banana' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '90' })).toBeInTheDocument();
  });

  it('shows empty state when no rows are provided', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="No foods found" />);

    expect(screen.getByText('No foods found')).toBeInTheDocument();
  });
});
