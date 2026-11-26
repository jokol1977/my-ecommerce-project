export type SavedAddress = {
  id: string;
  title: string;
  recipient: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  buildingNumber?: string | null;
  unit?: string | null;
  postalCode: string;
};
