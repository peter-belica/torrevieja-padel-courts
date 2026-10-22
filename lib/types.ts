export type SlotStatus = "free" | "busy" | "na" | "past";

export interface Slot {
  /** "HH:MM" v čase Europe/Madrid */
  start: string;
  end: string;
  status: SlotStatus;
  /** EUR, ak ju zdroj poskytuje */
  price?: number;
  /** Prepíše prvý odkaz kalendára pre tento konkrétny slot */
  bookingUrl?: string;
}

export interface Court {
  id: string;
  name: string;
  slots: Slot[];
}

export interface BookingLink {
  label: string;
  url: string;
}

export interface Calendar {
  source: string;
  title: string;
  subtitle: string;
  /** YYYY-MM-DD */
  date: string;
  slotMinutes: number;
  links: BookingLink[];
  courts: Court[];
  note?: string;
  /** ISO čas stiahnutia dát */
  fetchedAt: string;
}

/** Chyba so správou, ktorú je bezpečné ukázať v UI. */
export class SourceError extends Error {}
