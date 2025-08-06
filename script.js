document.addEventListener("DOMContentLoaded", () => {
  const spotifyLinkInput = document.getElementById("spotify-link");
  const getLyricsBtn = document.getElementById("get-lyrics-btn");
  const languageSelect = document.getElementById("language-select");
  const lyricsOutput = document.getElementById("lyrics-output");
  const lyricsText = document.getElementById("lyrics-text");

 

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
  
    const currentContent = lyricsText.innerHTML;
    
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentContent;
    const songTitleElement = tempDiv.querySelector(".song-title");
    const artistNameElement = tempDiv.querySelector(".artist-name");

    let actualLyricsToTranslate = tempDiv.textContent || ""; 
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

 
    actualLyricsToTranslate = actualLyricsToTranslate
      .replace(/\s{2,}/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();

    const targetLang = languageSelect.value;
    const sourceLang = "en"; 

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
    
      const spotifyLink = spotifyLinkInput.value;
      const url = new URL(spotifyLink);
      const pathname = url.pathname;
      const trackId = pathname.split("/").pop();
      const { artistName, songTitle } = await getSpotifyTrackData(trackId);

  
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

  // --- Fonksiyonlar ---

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

 
  async function translateText(text, source, target) {
  
    const response = await fetch('https://mitlight.onrender.com', {
      method: "POST",
      body: JSON.stringify({
      
        text: text,
        source_lang: source,
        target_lang: target,
      }),
      headers: {
        "Content-Type": "application/json",
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
   
    return data.translations[0].text;
  }
});
