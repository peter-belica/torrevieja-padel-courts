import { calendarHandler } from "../lib/handler.js";
import { fetchNovaPadel } from "../lib/sources/novapadel.js";

export const GET = calendarHandler(fetchNovaPadel);
