import { createDb } from "./index"
import { artists, songs, punchlines } from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required")
}

const db = createDb(process.env.DATABASE_URL)

type SeedSong = {
  title: string
  album: string | null
  releaseYear: number | null
  bars: string[]
}
type SeedArtist = {
  slug: string
  name: string
  songs: SeedSong[]
}

const data: SeedArtist[] = [
  {
    slug: "kollegah",
    name: "Kollegah",
    songs: [
      {
        title: "King",
        album: "King",
        releaseYear: 2014,
        bars: [
          "Ich häng mit Killern ab, die für ein Geld-Bündel mit Pumpgun in dein Heim eindringen",
          "King-Status, der Boss, der die Gegner zerlegt wie 'ne Granate im Karton",
        ],
      },
      {
        title: "Apokalypse",
        album: "Bossaura",
        releaseYear: 2011,
        bars: [
          "Du Bitch zerbrichst wie 'ne Glasfigur, wenn der Boss durch deinen Stadtteil tourt",
        ],
      },
      {
        title: "Du bist Boss",
        album: "Zuhältertape Vol. 4",
        releaseYear: 2014,
        bars: ["Wer hat das Spiel verändert? Wer hat den Game-Verlauf bestimmt?"],
      },
    ],
  },
  {
    slug: "haftbefehl",
    name: "Haftbefehl",
    songs: [
      {
        title: "Chabos wissen wer der Babo ist",
        album: "Blockplatin",
        releaseYear: 2013,
        bars: [
          "Chabos wissen wer der Babo ist, Para auf'm Konto, Hawara",
          "Frankfurt, ich repräsentier' die Stadt, die du nicht magst",
        ],
      },
      {
        title: "069",
        album: "Russisch Roulette",
        releaseYear: 2014,
        bars: [
          "Null-sechs-neun, ich bin der König der Straße",
          "Mein Block ist heiß wie der Asphalt im Sommer",
        ],
      },
    ],
  },
  {
    slug: "bushido",
    name: "Bushido",
    songs: [
      {
        title: "Alles wird gut",
        album: "Carlo Cokxxx Nutten",
        releaseYear: 2002,
        bars: ["Ich bin der Junge, vor dem dich deine Mutter immer gewarnt hat"],
      },
      {
        title: "Electro Ghetto",
        album: "Electro Ghetto",
        releaseYear: 2004,
        bars: [
          "Electro Ghetto, ich bin der Sound aus dem Block",
          "Berlin Tempelhof, hier wo die Geschichte beginnt",
        ],
      },
    ],
  },
  {
    slug: "apache-207",
    name: "Apache 207",
    songs: [
      {
        title: "Roller",
        album: "Treppenhaus",
        releaseYear: 2019,
        bars: [
          "Ich fahr Roller, kein Mercedes-Benz",
          "Sonnenbrille auf, auch wenn die Sonne nicht scheint",
        ],
      },
      {
        title: "200 km/h",
        album: "Treppenhaus",
        releaseYear: 2019,
        bars: ["Zweihundert Kilometer pro Stunde, ich fahr durch die Nacht"],
      },
    ],
  },
  {
    slug: "bonez-mc",
    name: "Bonez MC",
    songs: [
      {
        title: "Mörder",
        album: "Hollywood Uncut",
        releaseYear: 2017,
        bars: [
          "Wir sind die Mörder, die nachts in deinem Viertel cruisen",
          "187 für immer, das ist mehr als nur 'ne Zahl",
        ],
      },
      {
        title: "Palmen aus Plastik",
        album: "Palmen aus Plastik",
        releaseYear: 2016,
        bars: ["Palmen aus Plastik, wir tanzen im Regen der Stadt"],
      },
    ],
  },
  {
    slug: "raf-camora",
    name: "RAF Camora",
    songs: [
      {
        title: "Andere Liga",
        album: "Anthrazit",
        releaseYear: 2017,
        bars: [
          "Andere Liga, ich spiel in einer anderen Welt",
          "Wien, Berlin, ich verbinde die Szenen",
        ],
      },
      {
        title: "Primo",
        album: "Zenit",
        releaseYear: 2018,
        bars: ["Primo, ich bin der Erste, der die Tür für euch geöffnet hat"],
      },
    ],
  },
  {
    slug: "ssio",
    name: "SSIO",
    songs: [
      {
        title: "Nullf*cksgegeben",
        album: "0,9",
        releaseYear: 2014,
        bars: [
          "Null Fucks gegeben, ich mach mein Ding wie ich es will",
          "Bonn-Bad Godesberg, mein Block, meine Regeln",
        ],
      },
      {
        title: "Kleinanzeigen",
        album: "BB.U.M.SS.N",
        releaseYear: 2018,
        bars: ["Auf eBay Kleinanzeigen verkauf ich meinen alten Schmuck"],
      },
    ],
  },
]

async function seed() {
  console.log("Wiping existing data...")
  // Order matters: punchlines → songs → artists (FK chain)
  await db.delete(punchlines)
  await db.delete(songs)
  await db.delete(artists)

  console.log("Seeding artists...")
  const artistIds = new Map<string, number>()
  for (const a of data) {
    const [artist] = await db
      .insert(artists)
      .values({ slug: a.slug, name: a.name, imageUrl: null })
      .returning()
    artistIds.set(a.slug, artist.id)
  }

  function pickDistractors(correctId: number): [number, number] {
    const pool = [...artistIds.values()].filter((id) => id !== correctId)
    if (pool.length < 2) throw new Error("Need ≥3 artists to seed distractors")
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return [pool[0], pool[1]]
  }

  console.log("Seeding songs + punchlines...")
  for (const a of data) {
    const artistId = artistIds.get(a.slug)!
    for (const s of a.songs) {
      const [song] = await db
        .insert(songs)
        .values({
          artistId,
          title: s.title,
          album: s.album,
          albumArtUrl: null,
          releaseYear: s.releaseYear,
        })
        .returning()
      for (const bar of s.bars) {
        const [d1, d2] = pickDistractors(artistId)
        await db.insert(punchlines).values({
          songId: song.id,
          line: bar,
          perfectSolution: [],
          acceptableSolutions: [],
          distractor1Id: d1,
          distractor2Id: d2,
        })
      }
    }
    console.log(`  ✓ ${a.name} (${a.songs.length} songs)`)
  }
  console.log("Done.")
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
