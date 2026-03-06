import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NutritionPage } from '@/pages/nutrition';

describe('NutritionPage', () => {
  it('renders the latest day summary with actual and target macros', () => {
    render(<NutritionPage />);

    expect(screen.getByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily totals' })).toBeInTheDocument();
    expect(screen.getByText('Thursday, March 5')).toBeInTheDocument();

    expect(screen.getByText('2131 cal')).toHaveClass('text-emerald-950');
    expect(screen.getByText(/\/ 2200 cal/)).toBeInTheDocument();
    expect(screen.getByText('192g')).toHaveClass('text-red-900');
    expect(screen.getByText(/\/ 180g/)).toBeInTheDocument();
    expect(screen.getByText('185g')).toHaveClass('text-emerald-950');
    expect(screen.getByText(/\/ 250g/)).toBeInTheDocument();
    expect(screen.getByText('70g')).toHaveClass('text-emerald-950');
    expect(screen.getByText(/\/ 73g/)).toBeInTheDocument();
  });

  it('renders meal cards in breakfast, lunch, dinner, snacks order', () => {
    render(<NutritionPage />);

    const breakfast = screen.getByRole('button', { name: /breakfast/i });
    const lunch = screen.getByRole('button', { name: /lunch/i });
    const dinner = screen.getByRole('button', { name: /dinner/i });
    const snacks = screen.getByRole('button', { name: /snacks/i });

    expect(breakfast.compareDocumentPosition(lunch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lunch.compareDocumentPosition(dinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dinner.compareDocumentPosition(snacks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
