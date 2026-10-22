import { calendarHandler } from "../lib/handler.js";
import { fetchTorrevieja } from "../lib/sources/torrevieja.js";

export const GET = calendarHandler(fetchTorrevieja);
