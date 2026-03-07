export type EquipmentCategory =
  | 'free-weights'
  | 'machines'
  | 'cables'
  | 'cardio'
  | 'accessories';

export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  details?: string;
}

export interface EquipmentLocation {
  id: string;
  name: string;
  notes?: string;
  equipment: EquipmentItem[];
}
