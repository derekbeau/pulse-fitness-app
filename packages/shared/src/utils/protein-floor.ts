import { proteinFloorProgressSchema, type ProteinFloorProgress } from '../schemas/protein-floor.js';

export type ProteinFloorProgressInput = {
  actualProteinGrams: number | null;
  proteinFloorGrams: number | null;
  isFinal: boolean;
  canEvaluate: boolean;
};

export function calculateProteinFloorProgress(
  input: ProteinFloorProgressInput,
): ProteinFloorProgress {
  if (
    input.actualProteinGrams !== null &&
    (!Number.isFinite(input.actualProteinGrams) || input.actualProteinGrams < 0)
  ) {
    throw new RangeError('Actual protein grams must be a finite nonnegative number');
  }
  if (
    input.proteinFloorGrams !== null &&
    (!Number.isFinite(input.proteinFloorGrams) || input.proteinFloorGrams < 0)
  ) {
    throw new RangeError('Protein floor grams must be null or a finite nonnegative number');
  }

  const factsAvailable =
    input.canEvaluate &&
    input.actualProteinGrams !== null &&
    input.proteinFloorGrams !== null &&
    input.proteinFloorGrams > 0;
  if (!factsAvailable) {
    return proteinFloorProgressSchema.parse({
      actualProteinGrams: input.actualProteinGrams,
      proteinFloorGrams: input.proteinFloorGrams,
      remainingToFloorGrams: null,
      amountAboveFloorGrams: null,
      state: 'unavailable',
      isFinal: input.isFinal,
    });
  }

  const actual = input.actualProteinGrams as number;
  const floor = input.proteinFloorGrams as number;
  return proteinFloorProgressSchema.parse({
    actualProteinGrams: actual,
    proteinFloorGrams: floor,
    remainingToFloorGrams: Math.max(floor - actual, 0),
    amountAboveFloorGrams: Math.max(actual - floor, 0),
    state: actual < floor ? 'below_floor' : 'floor_met',
    isFinal: input.isFinal,
  });
}
