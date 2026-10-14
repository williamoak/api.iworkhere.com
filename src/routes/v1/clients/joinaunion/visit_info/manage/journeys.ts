/**
 * @myDocBlock
 * @file journeys.ts
 * @internal
 * @module clients-joinaunion-visit-info-manage-journeys
 * @tag clients, joinaunion, visit_info, manage, journeys
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path @routes/v1/clients/joinaunion/visit_info/manage/journeys.ts
 * @summary Journey extraction, transformation, and counting helpers for joinaunion visit_info records.
 *
 * @description
 * Implements the transformation algorithm converting raw visit_info records into structured
 * user browsing journeys:
 * 1. Note and Route Parsing: Extracting page_name and notes metadata from visit notes.
 * 2. Deduplication & Validation: Validating device_id and touch_time, deduplicating by identity key.
 * 3. Grouping and Boundary Segmentation: Partitioning by device, ordering chronologically, and
 *    segmenting journeys starting at "Home" page visits.
 * 4. Duration and Metrics Computation: Calculating inter-page elapsed times, handling last page duration
 *    using average transition duration, and determining total journey duration and coverage.
 * 5. Filtering and Global Sorting: Excluding invalid journeys and single-page bounces (duration <= 0),
 *    and sorting chronologically by journey_start_time.
 */

export interface VisitInfoRow {
    id?: string | number | null;
    touch_time?: string | Date | null;
    touchTime?: string | Date | null;
    device_id?: string | null;
    deviceId?: string | null;
    note?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    location_source?: string | null;
    locationSource?: string | null;
    userId?: string | null;
    user_id?: string | null;
    requestMethod?: string | null;
    request_method?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    [key: string]: unknown;
}

export interface JourneyPage {
    page_number: number;
    page_name: string;
    time_on_page_seconds: number;
    time_on_page: string;
    notes: string;
}

export interface JourneyRecord {
    city: string;
    country: string;
    region: string;
    latitude: number | null;
    longitude: number | null;
    locationSource: string | null;
    device_id: string;
    userId: string | null;
    journey_average_time_per_page: string;
    journey_average_time_per_page_seconds: number;
    journey_duration: string;
    journey_duration_seconds: number;
    journey_id: string;
    journey_num_pages: number;
    journey_start_time: string;
    longest_page: string;
    pages_viewed_percent: number;
    pages: JourneyPage[];
    records?: VisitInfoRow[];
}

export function isSystemEvent(noteOrRow: unknown): boolean {
    if (!noteOrRow) return false;
    if (typeof noteOrRow === "string") {
        return noteOrRow.toLowerCase().includes("/v1/");
    }
    if (typeof noteOrRow === "object") {
        const row = noteOrRow as Record<string, unknown>;
        const note = String(row.note || "");
        const pageName = String(row.page_name || row.pageName || "");
        return note.toLowerCase().includes("/v1/") || pageName.toLowerCase().includes("/v1/");
    }
    return false;
}

export function parsePageNote(note: unknown): { page_name: string; notes: string } {
    const value = String(note || "").replace(/^\s*visit:\s*/i, "");
    const separator = value.indexOf("#");
    if (separator < 0) return { page_name: value.trim(), notes: "" };
    return {
        page_name: value.slice(0, separator).trim(),
        notes: value.slice(separator + 1).trim()
    };
}

export function formatDuration(seconds: number): string {
    const rounded = Math.max(0, Math.round(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = rounded % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${remainder}s`;
    if (minutes > 0) return `${minutes}m ${remainder}s`;
    return `${remainder}s`;
}

export function parseVisitTime(value: unknown): number | null {
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    const str = String(value || "").trim();
    if (!str) return null;
    const timestamp = Date.parse(str);
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function visitIdentity(row: VisitInfoRow): string {
    const id = String(row.id || "").trim();
    if (id) return `id\u0001${id}`;
    const deviceId = row.device_id ?? row.deviceId;
    const touchTime = row.touch_time ?? row.touchTime;
    const touchTimeStr = touchTime instanceof Date ? touchTime.toISOString() : touchTime;
    return [deviceId, touchTimeStr, row.note, row.city, row.region, row.country]
        .map(v => String(v || ""))
        .join("\u0001");
}

export function buildJourney(rows: VisitInfoRow[], journeyIndex: number, maxPages: number): JourneyRecord {
    const validRows = rows.filter(row => {
        if (!row || typeof row !== "object") return false;
        if (isSystemEvent(row)) return false;
        const parsed = parsePageNote(row.note);
        if (isSystemEvent(parsed.page_name) || isSystemEvent(parsed.notes)) return false;
        return true;
    });

    if (validRows.length === 0) {
        return {
            city: "",
            country: "",
            region: "",
            latitude: null,
            longitude: null,
            locationSource: null,
            device_id: "",
            userId: null,
            journey_average_time_per_page: "0s",
            journey_average_time_per_page_seconds: 0,
            journey_duration: "0s",
            journey_duration_seconds: 0,
            journey_id: `journey-${journeyIndex}`,
            journey_num_pages: 0,
            journey_start_time: "",
            longest_page: "",
            pages_viewed_percent: 0,
            pages: [],
        };
    }

    const first = validRows[0];
    const pageDurations = validRows.slice(0, -1).map((row, index) => {
        const current = parseVisitTime(row.touch_time ?? row.touchTime);
        const next = parseVisitTime(validRows[index + 1].touch_time ?? validRows[index + 1].touchTime);
        return current !== null && next !== null ? Math.max(0, (next - current) / 1000) : 0;
    });

    const average = pageDurations.length > 0
        ? pageDurations.reduce((sum, value) => sum + value, 0) / pageDurations.length
        : 0;

    const pages: JourneyPage[] = validRows.map((row, index) => {
        const parsed = parsePageNote(row.note);
        const seconds = index < pageDurations.length ? pageDurations[index] : average;
        return {
            ...parsed,
            page_number: index + 1,
            time_on_page_seconds: seconds,
            time_on_page: formatDuration(seconds)
        };
    });

    const journeyDurationSeconds = pageDurations.reduce((sum, value) => sum + value, 0) + (validRows.length > 1 ? average : 0);
    const longestPage = pages.reduce((longest, page) => page.time_on_page_seconds > longest.time_on_page_seconds ? page : longest, pages[0]);
    const uniquePagesViewed = new Set(pages.map(page => page.page_name).filter(Boolean)).size;

    const firstTouchTime = first.touch_time ?? first.touchTime;
    const startTimeStr = firstTouchTime instanceof Date ? firstTouchTime.toISOString() : String(firstTouchTime || "");

    return {
        city: String(first.city || ""),
        country: String(first.country || ""),
        region: String(first.region || ""),
        latitude: first.latitude !== undefined && first.latitude !== null ? Number(first.latitude) : null,
        longitude: first.longitude !== undefined && first.longitude !== null ? Number(first.longitude) : null,
        locationSource: (first.locationSource ?? first.location_source ?? null) as string | null,
        device_id: String(first.device_id ?? first.deviceId ?? ""),
        userId: (first.userId ?? first.user_id ?? null) as string | null,
        journey_average_time_per_page: formatDuration(average),
        journey_average_time_per_page_seconds: average,
        journey_duration: formatDuration(journeyDurationSeconds),
        journey_duration_seconds: journeyDurationSeconds,
        journey_id: `journey-${journeyIndex}`,
        journey_num_pages: pages.length,
        journey_start_time: startTimeStr,
        longest_page: longestPage?.page_name || "",
        pages_viewed_percent: maxPages > 0 ? Math.min(100, Math.round((uniquePagesViewed / maxPages) * 100)) : 0,
        pages,
    };
}

export function buildJourneys(
    rows: VisitInfoRow[],
    configuredPageCount?: number
): JourneyRecord[] {
    const rowsByIdentity = new Map<string, VisitInfoRow>();

    // 1. Deduplicate & validate
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        if (isSystemEvent(row)) continue;
        const parsed = parsePageNote(row.note);
        if (isSystemEvent(parsed.page_name) || isSystemEvent(parsed.notes)) continue;
        const deviceId = row.device_id ?? row.deviceId;
        const touchTime = row.touch_time ?? row.touchTime;
        if (deviceId && parseVisitTime(touchTime) !== null) {
            rowsByIdentity.set(visitIdentity(row), row);
        }
    }

    // 2. Group by device
    const visitsByDevice = new Map<string, VisitInfoRow[]>();
    for (const visit of rowsByIdentity.values()) {
        const device = String(visit.device_id ?? visit.deviceId);
        const list = visitsByDevice.get(device) || [];
        list.push(visit);
        visitsByDevice.set(device, list);
    }

    // 3. Sort and segment into journeys by "Home" boundary
    const groups: VisitInfoRow[][] = [];
    visitsByDevice.forEach(deviceVisits => {
        deviceVisits.sort((a, b) => {
            const timeDiff = (parseVisitTime(a.touch_time ?? a.touchTime) as number) - 
                             (parseVisitTime(b.touch_time ?? b.touchTime) as number);
            if (timeDiff !== 0) return timeDiff;
            return visitIdentity(a).localeCompare(visitIdentity(b));
        });

        let current: VisitInfoRow[] = [];
        for (const visit of deviceVisits) {
            const parsed = parsePageNote(visit.note);
            const pageName = parsed.page_name.trim().toLowerCase();
            const isBaseHome = pageName === "home" && !parsed.notes;

            if (isBaseHome) {
                if (current.length > 0) groups.push(current);
                current = [visit];
            } else if (current.length > 0) {
                current.push(visit);
            }
        }
        if (current.length > 0) {
            groups.push(current);
        }
    });

    const maxPages = configuredPageCount && configuredPageCount > 0
        ? configuredPageCount
        : groups.reduce((max, group) => Math.max(max, group.length), 0);

    // 4. Build, filter, and sort journeys
    return groups
        .map(group => buildJourney(group, 0, maxPages))
        .filter(journey => {
            const firstPage = journey.pages[0];
            return firstPage?.page_name.trim().toLowerCase() === "home" && !firstPage?.notes;
        })
        .filter(journey => journey.journey_duration_seconds > 0)
        .sort((a, b) => (parseVisitTime(a.journey_start_time) as number) - (parseVisitTime(b.journey_start_time) as number))
        .map((journey, index) => ({ ...journey, journey_id: `journey-${index + 1}` }));
}

export function countJourneys(
    rows: VisitInfoRow[],
    configuredPageCount?: number
): number {
    return buildJourneys(rows, configuredPageCount).length;
}
