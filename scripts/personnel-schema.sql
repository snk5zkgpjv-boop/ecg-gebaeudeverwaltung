CREATE TABLE IF NOT EXISTS ecg_absences (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL,
 team text NOT NULL CHECK(team IN ('pastoral','building')),
 kind text NOT NULL CHECK(kind IN ('Urlaub','Abwesenheit','Sabbatjahr')),
 starts date NOT NULL,
 ends date NOT NULL CHECK(ends >= starts),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','cancelled')),
 deputy_id text,
 coverage text NOT NULL DEFAULT 'open' CHECK(coverage IN ('open','asked','confirmed','declined')),
 decided_by text,
 version integer NOT NULL DEFAULT 1
);
