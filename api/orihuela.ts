import { calendarHandler } from "../lib/handler.js";
import { fetchOrihuela } from "../lib/sources/orihuela.js";

export const GET = calendarHandler(fetchOrihuela);
