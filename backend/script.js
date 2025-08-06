document.addEventListener("DOMContentLoaded", () => {
  const spotifyLinkInput = document.getElementById("spotify-link");
  const getLyricsBtn = document.getElementById("get-lyrics-btn");
  const languageSelect = document.getElementById("language-select");
  const lyricsOutput = document.getElementById("lyrics-output");
  const lyricsText = document.getElementById("lyrics-text");

  // DeepL API anahtarı ve URL'si artık frontend'de tanımlı OLMAMALI.
  // Bu bilgiler backend/server.js dosyasında tutuluyor.
  // const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';
  // const DEEPL_API_KEY = 'YOUR_DEEPL_API_KEY_HERE';

  getLyricsBtn.addEventListener("click", async () => {
    const spotifyLink = spotifyLinkInput.value;
    if (!spotifyLink) {
      lyricsText.textContent = "Lütfen bir Spotify linki girin.";
      return;
    }

    lyricsOutput.classList.add("loading");
    lyricsOutput.style.borderColor = "var(--primary-color)";
    lyricsText.textContent = "Şarkı bilgileri alınıyor...";
    lyricsText.style.opacity = "0";

    try {
      const url = new URL(spotifyLink);
      const pathname = url.pathname;
      const trackId = pathname.split("/").pop();

      if (!trackId) {
        throw new Error("Geçersiz Spotify linki.");
      }

      const { artistName, songTitle } = await getSpotifyTrackData(trackId);

      lyricsText.textContent = `${artistName} - ${songTitle} şarkısının sözleri aranıyor...`;

      let lyrics = await getLyricsFromGenius(artistName, songTitle);

      if (lyrics) {
        const headerContent = `<h2 class="song-title">${songTitle}</h2><p class="artist-name">${artistName}</p><br>`;
        lyricsText.innerHTML = headerContent + lyrics;

        lyricsOutput.style.boxShadow = "0 0 15px var(--accent-glow)";
        lyricsText.style.opacity = "1";
      } else {
        lyricsText.textContent = "Şarkı sözleri bulunamadı.";
        lyricsText.style.opacity = "1";
      }
    } catch (error) {
      console.error("Hata:", error);
      lyricsText.textContent =
        "Bir hata oluştu. Lütfen geçerli bir link girdiğinizden emin olun.";
      lyricsText.style.opacity = "1";
    } finally {
      lyricsOutput.classList.remove("loading");
    }
  });

  languageSelect.addEventListener("change", async () => {
    // HTML içeriğinden sadece metin içeriğini alıyoruz
    const currentContent = lyricsText.innerHTML;
    // Başlık elementlerini bulup metinlerini çıkarıyoruz
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentContent;
    const songTitleElement = tempDiv.querySelector(".song-title");
    const artistNameElement = tempDiv.querySelector(".artist-name");

    let actualLyricsToTranslate = tempDiv.textContent || ""; // Tüm metni al

    // Başlıkları metinden temizle
    if (songTitleElement) {
      actualLyricsToTranslate = actualLyricsToTranslate
        .replace(songTitleElement.textContent, "")
        .trim();
    }
    if (artistNameElement) {
      actualLyricsToTranslate = actualLyricsToTranslate
        .replace(artistNameElement.textContent, "")
        .trim();
    }

    // Fazla boşlukları ve boş satırları temizle
    actualLyricsToTranslate = actualLyricsToTranslate
      .replace(/\s{2,}/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();

    const targetLang = languageSelect.value;
    const sourceLang = "en"; // Şarkı sözlerinin orijinal dilini İngilizce kabul ediyoruz.

    if (
      !actualLyricsToTranslate ||
      actualLyricsToTranslate.startsWith("Şarkı bilgileri") ||
      actualLyricsToTranslate.startsWith("Bir hata")
    ) {
      return;
    }

    lyricsOutput.classList.add("loading");
    lyricsText.textContent = "Çeviriliyor...";
    lyricsText.style.opacity = "0";

    try {
      // Orijinal şarkı adı ve sanatçı adını tekrar alalım (veya daha önce bir değişkende saklayabiliriz)
      const spotifyLink = spotifyLinkInput.value;
      const url = new URL(spotifyLink);
      const pathname = url.pathname;
      const trackId = pathname.split("/").pop();
      const { artistName, songTitle } = await getSpotifyTrackData(trackId);

      // Çeviri isteğini kendi backend sunucumuza gönderiyoruz
      const translatedLyrics = await translateText(
        actualLyricsToTranslate,
        sourceLang,
        targetLang
      );

      const headerContent = `<h2 class="song-title">${songTitle}</h2><p class="artist-name">${artistName}</p><br>`;
      lyricsText.innerHTML = headerContent + translatedLyrics;

      lyricsText.style.opacity = "1";
    } catch (error) {
      console.error("Çeviri hatası:", error);
      lyricsText.textContent = "Çeviri yapılırken bir hata oluştu.";
      lyricsText.style.opacity = "1";
    } finally {
      lyricsOutput.classList.remove("loading");
    }
  });

  // --- Yardımcı Fonksiyonlar ---

  async function getSpotifyTrackData(trackId) {
    const response = await fetch(
      `https://mitlight.onrender.com/spotify-track/${trackId}`
    );

    if (!response.ok) {
      throw new Error("Spotify verisi alınamadı.");
    }

    const data = await response.json();
    const artistName = data.artists.map((artist) => artist.name).join(", ");
    const songTitle = data.name;
    return { artistName, songTitle };
  }

  async function getLyricsFromGenius(artist, title) {
    const response = await fetch(
      `https://mitlight.onrender.com/genius-lyrics?artist=${encodeURIComponent(
        artist
      )}&title=${encodeURIComponent(title)}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error);
    }

    const data = await response.json();
    return data.lyrics;
  }

  // DeepL çeviri isteğini kendi backend sunucumuza yönlendiren fonksiyon
  async function translateText(text, source, target) {
    // Frontend'den kendi backend'imize istek gönderiyoruz.
    // Backend, bu isteği alıp DeepL API'sine iletecek.
    const response = await fetch("https://mitlight.onrender.com/translate", {
      method: "POST",
      body: JSON.stringify({
        // JSON olarak gönderiyoruz
        text: text,
        source_lang: source,
        target_lang: target,
      }),
      headers: {
        "Content-Type": "application/json", // JSON gönderdiğimizi belirtiyoruz
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Backend çeviri yanıtı:", errorData);
      throw new Error(
        `Çeviri servisi hatası: ${errorData.error || response.statusText}`
      );
    }

    const data = await response.json();
    // Backend'den gelen yanıtın DeepL'den geldiği gibi olmasını bekliyoruz
    return data.translations[0].text;
  }
});
