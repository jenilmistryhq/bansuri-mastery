// The interactive lessons, and the day each one belongs to.
import { M0 } from "./m0.js";

export const LESSONS = { m0: M0 };
export const lessonForDay = n => Object.values(LESSONS).find(l => l.day === n) || null;
