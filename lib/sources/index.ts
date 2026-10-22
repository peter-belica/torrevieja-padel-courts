import type { Calendar } from "../types.js";
import { fetchNovaPadel } from "./novapadel.js";
import { fetchOrihuela } from "./orihuela.js";
import { fetchTorrevieja } from "./torrevieja.js";

/** Poradie zodpovedá poradiu kalendárov na stránke. */
export const SOURCES = {
  orihuela: fetchOrihuela,
  novapadel: fetchNovaPadel,
  torrevieja: fetchTorrevieja,
} satisfies Record<string, (date: string) => Promise<Calendar>>;
