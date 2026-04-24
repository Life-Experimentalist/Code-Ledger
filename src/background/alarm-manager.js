/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../lib/debug.js';
import { storage, alarms } from '../lib/browser-compat.js';

const dbg = createDebugger('AlarmManager');

export const AlarmManager = {
  setup() {
    dbg.log('Setting up alarms');
    if (alarms) {
      alarms.create('sync.periodic', { periodInMinutes: 30 });
      alarms.create('reminder.daily', { periodInMinutes: 1440 });
      alarms.onAlarm.addListener(this.onAlarm.bind(this));
    }
  },

  async onAlarm(alarm) {
    dbg.log(`Alarm triggered: ${alarm.name}`);
    if (alarm.name === 'sync.periodic') {
      // Trigger sync
    } else if (alarm.name === 'reminder.daily') {
      // Trigger daily notification if streak is pending
    }
  }
};
