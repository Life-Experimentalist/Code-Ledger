/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { storage, alarms } from "../lib/browser-compat.js";

const dbg = createDebugger("AlarmManager");

export const AlarmManager = {
    setup() {
        dbg.log(`setup(): initializing alarms...`);
        if (!alarms) {
            dbg.warn(`setup(): alarms API unavailable`);
            return;
        }
        try {
            alarms.create("sync.periodic", { periodInMinutes: 30 });
            dbg.log(`setup(): ✓ created sync.periodic alarm (30 min)`);
            alarms.create("reminder.daily", { periodInMinutes: 1440 });
            dbg.log(`setup(): ✓ created reminder.daily alarm (1440 min)`);
            alarms.onAlarm.addListener(this.onAlarm.bind(this));
            dbg.log(`setup(): ✓ alarm listener registered`);
        } catch (e) {
            dbg.error(`setup(): ✗ alarm setup failed:`, e?.message);
        }
    },

    async onAlarm(alarm) {
        dbg.log(`onAlarm(): triggered alarm name=${alarm.name}`);
        if (alarm.name === "sync.periodic") {
            dbg.log(`onAlarm(): handling periodic sync...`);
            // Trigger sync
        } else if (alarm.name === "reminder.daily") {
            dbg.log(`onAlarm(): handling daily reminder check...`);
            // Trigger daily notification if streak is pending
        } else {
            dbg.warn(`onAlarm(): unknown alarm name=${alarm.name}`);
        }
    },
};
