import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ColumnPicker } from './column-picker';

describe('ColumnPicker', () => {
  it('shows and hides selected columns', () => {
    function TestHarness() {
      const [visibleColumns, setVisibleColumns] = useState<string[]>(['name', 'calories']);

      return (
        <>
          <ColumnPicker
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'calories', label: 'Calories' },
              { key: 'protein', label: 'Protein' },
            ]}
            onChange={setVisibleColumns}
            visibleColumns={visibleColumns}
          />
          <p>{visibleColumns.join(',')}</p>
        </>
      );
    }

    render(<TestHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));

    const caloriesCheckbox = screen.getByRole('checkbox', { name: 'Calories' });
    const proteinCheckbox = screen.getByRole('checkbox', { name: 'Protein' });

    expect(caloriesCheckbox).toBeChecked();
    expect(proteinCheckbox).not.toBeChecked();

    fireEvent.click(caloriesCheckbox);
    expect(screen.getByText('name')).toBeInTheDocument();

    fireEvent.click(proteinCheckbox);
    expect(screen.getByText('name,protein')).toBeInTheDocument();
  });
});
