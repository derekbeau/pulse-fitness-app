import { equipmentLocations } from '@/features/equipment';
import { ProfileHub } from '@/features/profile';

const initialEquipmentSummary = `${equipmentLocations.length} locations, ${equipmentLocations.reduce(
  (count, location) => count + location.equipment.length,
  0,
)} total items`;

export function ProfilePage() {
  return <ProfileHub equipmentSummary={initialEquipmentSummary} />;
}
