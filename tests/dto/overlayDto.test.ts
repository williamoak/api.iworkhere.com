import { describe, it, expect } from "vitest";
import { overlayDto } from "@src/dto/dtoOverlay";

describe("overlayDto", () => {
    const emptyFactory = () => ({
        a: null as number | null,
        b: "" as string,
        c: 0 as number,
    });

    it("overlays provided values onto an empty DTO", () => {
        const body = {
            a: 42,
            b: "hello",
        };

        const { merged, providedFields } = overlayDto(emptyFactory, body);

        expect(merged).toEqual({
            a: 42,
            b: "hello",
            c: 0,
        });

        expect(providedFields).toEqual(new Set(["a", "b"]));
    });

    it("ignores keys not present in the DTO shape", () => {
        const body = {
            a: 1,
            unknown: "nope",
        };

        const { merged, providedFields } = overlayDto(emptyFactory, body);

        expect(merged).toEqual({
            a: 1,
            b: "",
            c: 0,
        });

        expect(providedFields).toEqual(new Set(["a"]));
    });

    it("tracks provided fields even if the value is null or empty", () => {
        const body = {
            a: null,
            b: "",
        };

        const { merged, providedFields } = overlayDto(emptyFactory, body);

        expect(merged).toEqual({
            a: null,
            b: "",
            c: 0,
        });

        expect(providedFields).toEqual(new Set(["a", "b"]));
    });

    it("does not mutate the factory result", () => {
        const empty = emptyFactory();
        const body = { a: 99 };

        const { merged } = overlayDto(emptyFactory, body);

        expect(empty).toEqual({
            a: null,
            b: "",
            c: 0,
        });

        expect(merged).not.toBe(empty);
    });
});
