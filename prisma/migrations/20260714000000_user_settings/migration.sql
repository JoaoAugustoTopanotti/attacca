-- Settings: the instruments a person plays (INSTRUMENT_PRESETS keys). Feeds the
-- incompleteness wall ("essa música precisa do seu instrumento").
ALTER TABLE "User" ADD COLUMN "instruments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Where the magic link lands after being consumed (email change → back to /settings).
ALTER TABLE "LoginToken" ADD COLUMN "redirectTo" TEXT;
