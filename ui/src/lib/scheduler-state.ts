/**
 * Shared timer state for the built-in scheduler.
 * This lives outside the route handler so it can be imported by both routes.
 */

let timerEnabled = false;
let timerCron: string | null = null;

export function setTimerState(enabled: boolean, cron: string | null) {
  timerEnabled = enabled;
  timerCron = cron;
}

export function getTimerState() {
  return { enabled: timerEnabled, cron: timerCron };
}
