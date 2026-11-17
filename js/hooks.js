// Extension points used by later phases (post-session review, hand notes...).
import { go } from './ui.js';

// What happens right after a session ends.
export async function afterFinish(session) {
  go(`#/session/${session.id}`);
}

// Stats cards on the home screen.
export async function dashboardCards(_sessions) {
  return null;
}

// Extra sections on the Settings screen.
export async function settingsSections() {
  return null;
}

// Extra cards shown on a finished session's page.
export async function sessionExtras(_session) {
  return null;
}
