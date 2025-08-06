const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cheerio = require("cheerio");
const app = express();
const port = 3000;

require('dotenv').config();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

app.use(express.json());
app.use(cors());

async function getSpotifyToken() {
  const authOptions = {
    method: "post",
    url: "https://accounts.spotify.com/api/token",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET).toString(
          "base64"
        ),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: "grant_type=client_credentials",
  };

  try {
    const response = await axios(authOptions);
    return response.data.access_token;
  } catch (error) {
    console.error(
      "Spotify token alma hatası:",
      error.response ? error.response.data : error.message
    );
    throw new Error("Spotify token alınamadı.");
  }
}

app.get("/spotify-track/:id", async (req, res) => {
  const trackId = req.params.id;
  try {
    const token = await getSpotifyToken();
    const trackResponse = await axios.get(
      `https://api.spotify.com/v1/tracks/${trackId}`,
      {
        headers: { Authorization: "Bearer " + token },
      }
    );

    res.json(trackResponse.data);
  } catch (error) {
    console.error("Spotify API hatası:", error.message);
    res.status(500).json({ error: "Spotify API hatası: " + error.message });
  }
});

app.get("/genius-lyrics", async (req, res) => {
  const { artist, title } = req.query;
  try {
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(
      artist
    )}%20${encodeURIComponent(title)}`;
    const searchResponse = await axios.get(searchUrl, {
      headers: { Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}` },
    });

    const hits = searchResponse.data.response.hits;
    if (hits.length > 0) {
      const songUrl = hits[0].result.url;

      const lyricsPageResponse = await axios.get(songUrl);
      const $ = cheerio.load(lyricsPageResponse.data);

      let lyrics = "";

      const lyricsContainer = $('[data-lyrics-container="true"]');

      if (lyricsContainer.length > 0) {
        lyricsContainer.find("br").replaceWith("\n");
        lyrics = lyricsContainer.text();
      } else {
        const potentialLyricsDivs = $(
          'div[class*="Lyrics__Container"], div[class*="lyrics"], div[class*="SongPage__Lyrics"]'
        );
        if (potentialLyricsDivs.length > 0) {
          potentialLyricsDivs.find("br").replaceWith("\n");
          lyrics = potentialLyricsDivs.first().text();
        } else {
          lyrics = $("body").text();
        }
      }

      lyrics = lyrics.replace(/\[.*?\]/g, "").trim();
      lyrics = lyrics.replace(/\n\s*\n/g, "\n").trim();
      lyrics = lyrics.replace(/\s{2,}/g, " ");

      let lines = lyrics.split("\n");
      const lowerCaseTitle = title.toLowerCase();
      const lowerCaseArtist = artist.toLowerCase();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();

        const isSpecificContributorHeader =
          /^\d+\s*contributors.*lyrics$/i.test(line);
        const isGeneralHeaderLine =
          line.includes("contributors") ||
          line.includes("lyrics") ||
          (line.includes(lowerCaseTitle) && line.includes(lowerCaseArtist)) ||
          (line.includes(lowerCaseTitle) && line.length < 50) ||
          (line.includes(lowerCaseArtist) && line.length < 50);
        const isShortAndLikelyHeader =
          line.split(" ").length < 10 &&
          (line.includes("contributors") ||
            line.includes("lyrics") ||
            line.includes(lowerCaseTitle));

        if (
          isSpecificContributorHeader ||
          isGeneralHeaderLine ||
          isShortAndLikelyHeader
        ) {
          lines.splice(i, 1);
          i--;
        } else {
          break;
        }
      }
      lyrics = lines.join("\n").trim();

      if (lyrics && lyrics.length > 100) {
        res.json({ lyrics: lyrics, url: songUrl });
      } else {
        res
          .status(404)
          .json({
            error:
              "Web kazıma ile şarkı sözleri bulunamadı. Genius sayfa yapısı değişmiş olabilir veya sözler bu seçicilerle çekilemedi.",
          });
      }
    } else {
      res.status(404).json({ error: "Genius'ta şarkı bulunamadı." });
    }
  } catch (error) {
    console.error("Genius API veya Web Kazıma hatası:", error.message);
    res
      .status(500)
      .json({
        error:
          "Sunucu hatası: Şarkı sözleri alınamadı. Detay: " + error.message,
      });
  }
});

app.post("/translate", async (req, res) => {
  const { text, source_lang, target_lang } = req.body;
  try {
    const deeplResponse = await axios.post(
      "https://api-free.deepl.com/v2/translate",
      new URLSearchParams({
        text: text,
        source_lang: source_lang.toUpperCase(),
        target_lang: target_lang.toUpperCase(),
        auth_key: DEEPL_API_KEY,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(deeplResponse.data);
  } catch (error) {
    console.error(
      "DeepL çeviri hatası:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "DeepL çeviri servisi hatası." });
  }
});

app.listen(port, () => {
  console.log(`Backend sunucusu http://localhost:${port} adresinde çalışıyor`);
});
