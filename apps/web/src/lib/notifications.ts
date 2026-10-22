/**
 * Browser system notifications wrapper (FR-XX).
 * Handles permission requests and triggering OS-level alerts for room activity.
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export function sendSystemNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Don't spam notifications if the tab is already visible?
  // User might still want them if they are in another window/workspace.
  try {
    new Notification(title, {
      body,
      icon: '/favicon.svg',
      silent: false,
    });
  } catch (err) {
    console.error('Failed to send system notification:', err);
  }
}
