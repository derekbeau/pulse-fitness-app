import { describe, expect, it } from 'vitest';

import { addMealItemsInputSchema, mergeFoodInputSchema, type User, userSchema } from './index';

describe("userSchema", () => {
  it("parses a valid user object", () => {
    const user = userSchema.parse({
      id: "user-1",
      name: "Derek",
    });

    expect(user).toEqual({
      id: "user-1",
      name: "Derek",
    });
  });

  it("rejects payloads missing required fields", () => {
    expect(() => userSchema.parse({ id: "user-1" })).toThrow();
  });

  it("infers the User type from the schema", () => {
    const user: User = {
      id: "user-2",
      name: "Pulse",
    };

    expect(user.name).toBe("Pulse");
  });
});

describe('shared schema exports', () => {
  it('exports mergeFoodInputSchema from package root', () => {
    const payload = mergeFoodInputSchema.parse({
      loserId: '22222222-2222-4222-8222-222222222222',
    });

    expect(payload.loserId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('exports addMealItemsInputSchema from package root', () => {
    const payload = addMealItemsInputSchema.parse({
      items: [
        {
          foodName: 'Chicken Breast',
          quantity: 1,
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 3.6,
        },
      ],
    });

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      name: 'Chicken Breast',
      amount: 1,
      unit: 'serving',
    });
  });
});
