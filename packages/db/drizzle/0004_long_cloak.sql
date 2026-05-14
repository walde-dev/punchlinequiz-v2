CREATE TABLE "artist_tags" (
	"artist_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artist_tags_artist_id_tag_id_pk" PRIMARY KEY("artist_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"label" varchar(120) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "artist_tags" ADD CONSTRAINT "artist_tags_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_tags" ADD CONSTRAINT "artist_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "tags" ("slug", "label") VALUES
  ('frankfurt', 'Frankfurt'),
  ('berlin', 'Berlin'),
  ('hamburg', 'Hamburg'),
  ('nrw', 'NRW / Köln-Düsseldorf'),
  ('stuttgart', 'Stuttgart'),
  ('hessen', 'Hessen'),
  ('oesterreich', 'Österreich'),
  ('wordplay', 'Wordplay'),
  ('street', 'Street'),
  ('melodic', 'Melodic'),
  ('trap', 'Trap'),
  ('old-school', 'Old-School'),
  ('battle', 'Battle / Diss'),
  ('pop-rap', 'Pop-Rap'),
  ('conscious', 'Conscious'),
  ('gangsta', 'Gangsta'),
  ('braggadocio', 'Braggadocio'),
  ('love', 'Love / Emo'),
  ('hard', 'Hard'),
  ('funny', 'Funny'),
  ('introspective', 'Introspective'),
  ('multilingual', 'Mehrsprachig'),
  ('slang', 'Slang'),
  ('00s', '2000er'),
  ('10s', '2010er'),
  ('20s', '2020er')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "artist_tags" ("artist_id", "tag_id", "weight")
SELECT a.id, t.id, v.weight
FROM (VALUES
  ('kollegah','hessen',0.8),('kollegah','wordplay',1.0),('kollegah','braggadocio',1.0),('kollegah','battle',0.9),('kollegah','hard',0.8),('kollegah','10s',1.0),('kollegah','gangsta',0.7),
  ('farid-bang','nrw',0.9),('farid-bang','battle',0.9),('farid-bang','braggadocio',0.9),('farid-bang','hard',0.9),('farid-bang','gangsta',0.8),('farid-bang','10s',0.9),
  ('haftbefehl','frankfurt',1.0),('haftbefehl','hessen',0.9),('haftbefehl','street',1.0),('haftbefehl','multilingual',0.9),('haftbefehl','slang',1.0),('haftbefehl','hard',0.8),('haftbefehl','gangsta',0.9),
  ('celo-abdi','frankfurt',1.0),('celo-abdi','hessen',0.9),('celo-abdi','street',0.9),('celo-abdi','multilingual',0.8),('celo-abdi','slang',0.9),('celo-abdi','hard',0.7),
  ('olexesh','frankfurt',0.9),('olexesh','hessen',0.8),('olexesh','street',0.8),('olexesh','multilingual',0.7),('olexesh','10s',0.9),
  ('ssio','nrw',0.9),('ssio','funny',0.9),('ssio','wordplay',0.8),('ssio','braggadocio',0.8),('ssio','slang',0.7),('ssio','10s',0.9),
  ('sido','berlin',1.0),('sido','street',0.7),('sido','old-school',0.9),('sido','00s',1.0),('sido','10s',0.7),('sido','funny',0.6),
  ('bushido','berlin',1.0),('bushido','hard',0.8),('bushido','battle',0.7),('bushido','braggadocio',0.8),('bushido','old-school',0.9),('bushido','00s',1.0),('bushido','gangsta',0.8),
  ('fler','berlin',1.0),('fler','hard',0.7),('fler','old-school',0.8),('fler','00s',0.9),('fler','braggadocio',0.7),
  ('massiv','berlin',0.9),('massiv','street',0.7),('massiv','00s',0.8),('massiv','10s',0.7),
  ('raf-camora','oesterreich',0.9),('raf-camora','trap',1.0),('raf-camora','melodic',0.8),('raf-camora','10s',0.9),('raf-camora','20s',0.9),
  ('bonez-mc','hamburg',1.0),('bonez-mc','trap',0.9),('bonez-mc','melodic',0.8),('bonez-mc','street',0.7),('bonez-mc','10s',0.9),('bonez-mc','20s',0.8),
  ('gzuz','hamburg',1.0),('gzuz','street',0.9),('gzuz','hard',0.8),('gzuz','gangsta',0.8),('gzuz','10s',0.9),
  ('capital-bra','berlin',0.8),('capital-bra','trap',0.9),('capital-bra','melodic',0.7),('capital-bra','multilingual',0.6),('capital-bra','10s',0.9),('capital-bra','20s',0.8),
  ('luciano','stuttgart',0.8),('luciano','trap',0.9),('luciano','melodic',0.8),('luciano','20s',0.9),
  ('apache-207','melodic',1.0),('apache-207','pop-rap',1.0),('apache-207','love',0.7),('apache-207','20s',1.0),
  ('og-keemo','wordplay',0.9),('og-keemo','conscious',0.8),('og-keemo','introspective',0.8),('og-keemo','20s',0.9),
  ('edgar-wasser','wordplay',1.0),('edgar-wasser','funny',0.8),('edgar-wasser','conscious',0.7),('edgar-wasser','10s',0.9),
  ('megaloh','berlin',0.7),('megaloh','conscious',0.9),('megaloh','wordplay',0.7),('megaloh','10s',0.9),
  ('marteria','conscious',0.8),('marteria','wordplay',0.8),('marteria','10s',0.9),('marteria','20s',0.7)
) AS v(artist_slug, tag_slug, weight)
JOIN "artists" a ON a.slug = v.artist_slug
JOIN "tags" t ON t.slug = v.tag_slug
ON CONFLICT ("artist_id", "tag_id") DO NOTHING;
