/**
 * Overlay request body values onto an empty DTO
 * and track which fields were provided
 */
export function overlayDto<T extends Record<string, any>>(
    emptyDtoFactory: () => T,
    body: Record<string, unknown>
) {
    const empty = emptyDtoFactory();
    const merged: T = { ...empty };
    const provided = new Set<string>();

    for (const key of Object.keys(body)) {
        if (key in merged) {
            (merged as any)[key] = body[key];
            provided.add(key);
        }
    }

    return {
        merged,
        providedFields: provided,
    };
}
