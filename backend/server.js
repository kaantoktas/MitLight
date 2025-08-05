const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cheerio = require("cheerio"); // Cheerio kütüphanesini dahil ediyoruz
const app = express();
const port = 3000; // Sunucunun çalışacağı port numarası

// !!! ÖNEMLİ: API Anahtarlarınızı buraya yapıştırın !!!
// Bu anahtarları GENIUS ve SPOTIFY geliştirici sayfalarından aldığınız değerlerle değiştirin.
// Güvenlik nedeniyle, bu anahtarları gerçek bir projede doğrudan frontend kodunda tutmak yerine
// bir backend sunucusu (proxy) üzerinden kullanmak daha güvenlidir.
const SPOTIFY_CLIENT_ID = "aa056349b6984cf5a9c23b42d5bd30d0"; // Kendi Spotify Client ID'niz
const SPOTIFY_CLIENT_SECRET = "026998bb439a49dcaa3523a514a70dfd"; // Kendi Spotify Client Secret'ınız
const GENIUS_ACCESS_TOKEN =
  "YjnYJLTE-kcHoQg9hn0AB97LGtmB5__i0qTv3WNAynQ9RtJvJMjrONBVYC2VC5AS"; // Kendi Genius Access Token'ınız
const DEEPL_API_KEY = "ec8621f6-1844-4691-a43c-c91764e2349d:fx"; // Kendi DeepL API anahtarınız

// Middlewares
app.use(express.json()); // JSON body'leri parse etmek için
app.use(cors()); // CORS'u etkinleştirerek frontend'in erişimine izin veriyoruz

// Spotify'dan token alma fonksiyonu
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

// Spotify'dan şarkı bilgilerini getiren endpoint
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

// Genius'tan şarkı sözlerini getiren endpoint (Web Kazıma Dahil)
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
      const songUrl = hits[0].result.url; // Şarkı sözlerinin bulunduğu Genius sayfasının URL'si

      // Şarkı sözleri sayfasını çekiyoruz
      const lyricsPageResponse = await axios.get(songUrl);
      const $ = cheerio.load(lyricsPageResponse.data); // Cheerio ile HTML'i yüklüyoruz

      let lyrics = "";

      // Genius'taki şarkı sözlerini içeren ana div'i bulmaya çalışıyoruz
      const lyricsContainer = $('[data-lyrics-container="true"]');

      if (lyricsContainer.length > 0) {
        lyricsContainer.find("br").replaceWith("\n"); // <br> etiketlerini newline karakterleriyle değiştiriyoruz
        lyrics = lyricsContainer.text(); // İçindeki tüm metni alıyoruz
      } else {
        // Alternatif veya eski Genius yapıları için yedek seçiciler
        const potentialLyricsDivs = $(
          'div[class*="Lyrics__Container"], div[class*="lyrics"], div[class*="SongPage__Lyrics"]'
        );
        if (potentialLyricsDivs.length > 0) {
          potentialLyricsDivs.find("br").replaceWith("\n");
          lyrics = potentialLyricsDivs.first().text();
        } else {
          // Son çare: Sayfanın body'sindeki tüm metni çekmeyi deneyebiliriz.
          lyrics = $("body").text();
        }
      }

      // Şarkı sözlerini temizleme ve formatlama
      lyrics = lyrics.replace(/\[.*?\]/g, "").trim(); // Köşeli parantez içindeki metinleri (örn: [Verse 1], [Chorus]) kaldır
      lyrics = lyrics.replace(/\n\s*\n/g, "\n").trim(); // Fazla boş satırları tek boş satıra indir
      lyrics = lyrics.replace(/\s{2,}/g, " "); // Birden fazla boşluğu tek boşluğa indir

      // "Contributors" ve şarkı adı/Lyrics başlık satırını temizle
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
          lines.splice(i, 1); // Bu satırı kaldır
          i--; // Bir satır silindiği için indeksi geri al
        } else {
          break;
        }
      }
      lyrics = lines.join("\n").trim();

      if (lyrics && lyrics.length > 100) {
        // Çok kısa veya anlamsız sonuçları filtrele (en az 100 karakter)
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

// DeepL Çeviri için endpoint
app.post("/translate", async (req, res) => {
  const { text, source_lang, target_lang } = req.body; // Frontend'den JSON olarak gelen body'yi alıyoruz
  try {
    const deeplResponse = await axios.post(
      "https://api-free.deepl.com/v2/translate",
      new URLSearchParams({
        // DeepL API'si URL-encoded form data bekler
        text: text,
        source_lang: source_lang.toUpperCase(),
        target_lang: target_lang.toUpperCase(),
        auth_key: DEEPL_API_KEY,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded", // DeepL'e gönderdiğimiz Content-Type
        },
      }
    );
    res.json(deeplResponse.data); // DeepL'den gelen yanıtı frontend'e gönderiyoruz
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
