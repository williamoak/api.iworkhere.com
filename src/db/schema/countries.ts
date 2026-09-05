import {
    pgTable,
    text,
    integer,
    doublePrecision,
    jsonb,
    boolean,
} from "drizzle-orm/pg-core";

export const countries = pgTable("countries", {
    name: text("name").primaryKey(),
    alpha2Code: text("alpha2_code"),
    alpha3Code: text("alpha3_code"),
    cioc: text("cioc"),
    capital: text("capital"),
    region: text("region"),
    subregion: text("subregion"),
    population: integer("population"),
    demonym: text("demonym"),
    area: doublePrecision("area"),
    gini: doublePrecision("gini"),
    nativeName: text("native_name"),
    numericCode: text("numeric_code"),
    flag: text("flag"),
    independent: boolean("independent"),
    topLevelDomain: jsonb("top_level_domain"),
    callingCodes: jsonb("calling_codes"),
    currencies: jsonb("currencies"),
    languages: jsonb("languages"),
    latlng: jsonb("latlng"),
    borders: jsonb("borders"),
    timezones: jsonb("timezones"),
    flags: jsonb("flags"),
    svg: text("svg"),
    populationDensity: doublePrecision("population_density"),
});

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;
