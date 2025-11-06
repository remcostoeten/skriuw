// Minimal recurrence helpers (daily/weekly/monthly) and reminders

export type SimpleRecurrence =
    | { freq: 'DAILY'; interval?: number }
    | { freq: 'WEEKLY'; interval?: number; byDay?: number[] } // 0-6 (Sun-Sat)
    | { freq: 'MONTHLY'; interval?: number; byMonthDay?: number[] };

export function encodeRecurrence(r: SimpleRecurrence): string {
    const parts = [`FREQ=${r.freq}`];
    if ('interval' in r && r.interval) parts.push(`INTERVAL=${r.interval}`);
    if (r.freq === 'WEEKLY' && r.byDay && r.byDay.length) parts.push(`BYDAY=${r.byDay.join(',')}`);
    if (r.freq === 'MONTHLY' && r.byMonthDay && r.byMonthDay.length) parts.push(`BYMONTHDAY=${r.byMonthDay.join(',')}`);
    return parts.join(';');
}

export function nextRun(from: number, rule: string): Optional<number> {
    const map = Object.fromEntries(rule.split(';').map(kv => kv.split('=')));
    const freq = map['FREQ'];
    const interval = parseInt(map['INTERVAL'] || '1', 10);
    const dt = new Date(from);
    if (freq === 'DAILY') {
        dt.setDate(dt.getDate() + interval);
        return dt.getTime();
    }
    if (freq === 'WEEKLY') {
        dt.setDate(dt.getDate() + 7 * interval);
        return dt.getTime();
    }
    if (freq === 'MONTHLY') {
        dt.setMonth(dt.getMonth() + interval);
        return dt.getTime();
    }
    return undefined;
}

export function shouldRemind(now: number, reminderAt?: number): boolean {
    return !!reminderAt && now >= reminderAt;
}


