import { describe, expect, it } from 'vitest';

import {
  equipmentItemCategorySchema,
  equipmentItemSchema,
  equipmentLocationSchema,
  type EquipmentItem,
  type EquipmentItemCategory,
  type EquipmentLocation,
} from './equipment';

describe('equipmentLocationSchema', () => {
  it('parses a valid equipment location payload', () => {
    const payload = equipmentLocationSchema.parse({
      id: 'location-1',
      userId: 'user-1',
      name: ' Garage Gym ',
      notes: null,
      createdAt: 1,
    });

    expect(payload).toEqual({
      id: 'location-1',
      userId: 'user-1',
      name: 'Garage Gym',
      notes: null,
      createdAt: 1,
    });
  });

  it('infers the EquipmentLocation type from the schema', () => {
    const payload: EquipmentLocation = {
      id: 'location-2',
      userId: 'user-1',
      name: 'Commercial Gym',
      notes: 'Main membership location',
      createdAt: 2,
    };

    expect(payload.name).toBe('Commercial Gym');
  });
});

describe('equipmentItemSchema', () => {
  it('parses a valid equipment item payload', () => {
    const payload = equipmentItemSchema.parse({
      id: 'item-1',
      locationId: 'location-1',
      name: ' Adjustable Bench ',
      category: 'accessories',
      details: null,
      createdAt: 1,
    });

    expect(payload).toEqual({
      id: 'item-1',
      locationId: 'location-1',
      name: 'Adjustable Bench',
      category: 'accessories',
      details: null,
      createdAt: 1,
    });
  });

  it('rejects invalid equipment categories', () => {
    expect(() =>
      equipmentItemSchema.parse({
        id: 'item-1',
        locationId: 'location-1',
        name: 'Bike',
        category: 'conditioning',
        details: null,
        createdAt: 1,
      }),
    ).toThrow();
  });

  it('infers the EquipmentItem category type from the schema', () => {
    const category: EquipmentItemCategory = equipmentItemCategorySchema.parse('machines');
    const payload: EquipmentItem = {
      id: 'item-2',
      locationId: 'location-1',
      name: 'Leg Press',
      category,
      details: 'Plate-loaded',
      createdAt: 2,
    };

    expect(payload.category).toBe('machines');
  });
});
