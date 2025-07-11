// --- REGISTRO DEL SERVICE WORKER ---
// Esto debe estar fuera del DOMContentLoaded para que se registre lo antes posible.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('Service Worker registrado con éxito:', registration.scope);
    }).catch(err => {
      console.log('Fallo en el registro del Service Worker:', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DEL DOM ---
    const songTitleEl = document.getElementById('song-title');
    const songArtistEl = document.getElementById('song-artist');
    const albumArtEl = document.getElementById('album-art');
    const audioPlayer = document.getElementById('audio-player');
    const categoryTabsContainer = document.getElementById('category-tabs');
    const playlistViewContainer = document.getElementById('playlist-view');
    const songInformationEl = document.getElementById('song-information');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const searchInput = document.getElementById('search-input');
    const paginationControlsContainer = document.getElementById('pagination-controls');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const aboutToggleBtn = document.getElementById('about-toggle-btn');
    const aboutContent = document.getElementById('about-content');
    const songInfoToggleBtn = document.getElementById('song-info-toggle-btn');
    const adventureModeBtn = document.getElementById('adventure-mode-btn');
    const backgroundVideo = document.getElementById('background-video');
    const changeSkinBtn = document.getElementById('change-skin-btn');
    const colorPicker = document.getElementById('color-picker');
    const repeatBtn = document.getElementById('repeat-btn');
    const shareBtn = document.getElementById('share-btn');
    const addToFavoritesBtn = document.getElementById('add-to-favorites-btn');
    const addToHomeBtn = document.getElementById('add-to-home-btn');

    // --- ESTADO ---
    let deferredInstallPrompt = null;
    const cloudinaryBaseUrl = 'https://res.cloudinary.com/dy9cywux2/video/upload/';
    const googleSheetCsvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxbKnkTFmkECMfd_cRKchEv2XGOHII6YlLj0M0ragfExCtRWB2S0qTIZYrrFCTk3sxxctY2dnVgUif/pub?output=csv';
    const skinsPath = '/assets/img/labplay/skins/';
    const defaultCover = '/assets/img/labplay/default-cover.jpg';
    const songsPerPage = 5;
    let playlistsData = {};
    let currentCategory = '';
    let currentPlaylist = [];
    let allSongs = [];
    let currentSongIndex = -1;
    let fuse;
    let currentPage = 1;
    let isShuffleActive = false;
    let skins = [];
    let currentSkinIndex = 0;
    let isRepeatActive = false;
    let userFavorites = [];

    // --- LÓGICA DE INSTALACIÓN ---
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (addToHomeBtn) {
        addToHomeBtn.style.display = 'inline-flex';
      }
    });

    if(addToHomeBtn) {
        addToHomeBtn.addEventListener('click', async () => {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          console.log(`El usuario respondió: ${outcome}`);
          deferredInstallPrompt = null;
          addToHomeBtn.style.display = 'none';
        });
    }

    // --- FUNCIONES DEL REPRODUCTOR ---
    const loadUserSettings = () => { /* ... */ };
    // (Aquí van todas tus funciones: loadUserSettings, renderCategoryTabs, etc. tal cual estaban)

    // Pegamos aquí todo el resto del código JS que ya teníamos y funcionaba.
    // Para brevedad, el código completo está al final de esta respuesta.
    // ...
    // ...

    async function init() {
        loadUserSettings();
        await loadSkins();

        try {
            const response = await fetch(`${googleSheetCsvUrl}&_=${new Date().getTime()}`);
            const csvText = await response.text();
            const rows = csvText.trim().replace(/\r/g, '').split('\n').slice(1);
            
            rows.reverse();

            rows.forEach(row => {
                const [title, artist, category, publicId, cover, information] = parseCsvRow(row);
                if (!category || !publicId || !title) return;
                const finalCloudinaryUrl = `${cloudinaryBaseUrl}${publicId}`;
                const songObject = { title, artist, category, publicId, cover, information, publicUrl: finalCloudinaryUrl };
                if (!playlistsData[category]) playlistsData[category] = [];
                playlistsData[category].push(songObject);
                allSongs.push(songObject);
            });
            
            fuse = new Fuse(allSongs, { keys: ['title', 'artist'], threshold: 0.4 });
            
            if (allSongs.length > 0) {
                renderCategoryTabs();
                const urlParams = new URLSearchParams(window.location.search);
                const songIdFromUrl = urlParams.get('song');
                
                if (songIdFromUrl) {
                    const songToPlay = allSongs.find(s => s.publicId === songIdFromUrl);
                    if (songToPlay) {
                        loadCategory(songToPlay.category);
                        const indexToPlay = currentPlaylist.findIndex(s => s.publicId === songIdFromUrl);
                        if (indexToPlay !== -1) loadSong(indexToPlay, true);
                    } else {
                        loadCategory(Object.keys(playlistsData)[0]);
                    }
                } else {
                    loadCategory(Object.keys(playlistsData)[0]);
                }
            } else {
                 songTitleEl.textContent = "Sin datos";
                 songArtistEl.textContent = "La base de datos está vacía.";
            }

            audioPlayer.addEventListener('ended', handleSongEnd);
            playlistViewContainer.addEventListener('click', (e) => {
                const targetLi = e.target.closest('li');
                if (targetLi) {
                    const globalIndex = parseInt(targetLi.dataset.globalIndex);
                    const clickedSong = allSongs[globalIndex];
                    if (!clickedSong) return;
                    if (clickedSong.category !== currentCategory) {
                        loadCategory(clickedSong.category);
                    }
                    const localIndex = currentPlaylist.findIndex(s => s.publicId === clickedSong.publicId);
                    if (localIndex !== -1) loadSong(localIndex);
                }
            });
            songArtistEl.addEventListener('click', () => {
                const artistName = songArtistEl.textContent;
                if (!artistName || artistName === 'para comenzar') return;
                const artistSongs = allSongs.filter(song => song.artist === artistName);
                if (artistSongs.length > 0) {
                    const artistCategoryName = `Artista: ${artistName}`;
                    playlistsData[artistCategoryName] = artistSongs;
                    renderCategoryTabs();
                    loadCategory(artistCategoryName);
                }
            });
            categoryTabsContainer.addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn) loadCategory(btn.dataset.category) });
            prevBtn.addEventListener('click', playPrevSong);
            nextBtn.addEventListener('click', playNextSong);
            shuffleBtn.addEventListener('click', toggleShuffle);
            repeatBtn.addEventListener('click', toggleRepeat);
            shareBtn.addEventListener('click', shareSong);
            addToFavoritesBtn.addEventListener('click', toggleFavorite);
            searchInput.addEventListener('input', () => { currentPage = 1; updatePaginatedView(); });
            paginationControlsContainer.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button || button.disabled) return;
                let playlistToPaginate = currentPlaylist;
                if (searchInput.value.trim()){
                     const searchResults = fuse.search(searchInput.value.trim());
                     const searchResultIds = new Set(searchResults.map(result => result.item.publicId));
                     playlistToPaginate = currentPlaylist.filter(song => searchResultIds.has(song.publicId));
                }
                const totalPages = Math.ceil(playlistToPaginate.length / songsPerPage);
                const pageAction = button.dataset.page;
                if (pageAction === 'prev' && currentPage > 1) currentPage--;
                else if (pageAction === 'next' && currentPage < totalPages) currentPage++;
                else if (!isNaN(pageAction)) currentPage = parseInt(pageAction);
                updatePaginatedView();
            });

            // Comprobación para evitar errores en player.html
            if (aboutToggleBtn) {
                aboutToggleBtn.addEventListener('click', () => {
                    if(aboutContent) aboutContent.classList.toggle('is-open');
                });
            }

            songInfoToggleBtn.addEventListener('click', () => { songInformationEl.classList.toggle('is-open'); });
            adventureModeBtn.addEventListener('click', () => {
                const adventureCategoryName = 'Aventura Musical';
                playlistsData[adventureCategoryName] = shuffleArray(allSongs);
                renderCategoryTabs();
                loadCategory(adventureCategoryName);
            });
            
            changeSkinBtn.addEventListener('click', () => {
                if(skins.length === 0) return;
                currentSkinIndex = (currentSkinIndex + 1) % skins.length;
                localStorage.setItem('kaylum_skinIndex', currentSkinIndex);
                const newSkinSrc = skins[currentSkinIndex];
                const extension = newSkinSrc.split('.').pop().toLowerCase();
                backgroundVideo.style.opacity = 0;
                setTimeout(() => {
                    if (['webm', 'mp4'].includes(extension)) {
                        backgroundVideo.style.backgroundImage = 'none';
                        backgroundVideo.innerHTML = `<source src="${newSkinSrc}" type="video/${extension}">`;
                        backgroundVideo.load();
                        backgroundVideo.play().catch(e => {});
                    } else if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
                        backgroundVideo.innerHTML = '';
                        backgroundVideo.style.backgroundImage = `url('${newSkinSrc}')`;
                    }
                    backgroundVideo.style.opacity = 1;
                }, 500);
            });
            
            colorPicker.addEventListener('input', (e) => {
                const newColor = e.target.value;
                document.documentElement.style.setProperty('--text-color', newColor);
                localStorage.setItem('kaylum_textColor', newColor);
            });

            document.addEventListener('keydown', (e) => {
                if (document.activeElement === searchInput) return;
                if (e.code === 'Space') {
                    e.preventDefault();
                    togglePlayPause();
                }
            });

            if ('mediaSession' in navigator) {
                navigator.mediaSession.setActionHandler('play', () => audioPlayer.play());
                navigator.mediaSession.setActionHandler('pause', () => audioPlayer.pause());
                navigator.mediaSession.setActionHandler('previoustrack', playPrevSong);
                navigator.mediaSession.setActionHandler('nexttrack', playNextSong);
            }

        } catch (error) {
            console.error("Error al inicializar:", error);
            songTitleEl.textContent = "Error al cargar";
            songArtistEl.textContent = "No se pudo conectar a la base de datos.";
        }
    }
    
    // El resto de funciones auxiliares aquí
    function loadUserSettings() { const savedColor = localStorage.getItem('kaylum_textColor'); if (savedColor) { document.documentElement.style.setProperty('--text-color', savedColor); colorPicker.value = savedColor; } const savedSkinIndex = localStorage.getItem('kaylum_skinIndex'); if (savedSkinIndex !== null) { currentSkinIndex = parseInt(savedSkinIndex, 10); } const savedFavorites = localStorage.getItem('kaylum_favorites'); if (savedFavorites) { userFavorites = JSON.parse(savedFavorites); } if (userFavorites.length > 0) { playlistsData['Favoritos'] = []; } }
    function renderCategoryTabs() { const categories = Object.keys(playlistsData); categoryTabsContainer.innerHTML = categories.map(c => { if (c === 'Favoritos') { return `<button data-category="Favoritos"><i class="bi bi-star"></i> Favoritos</button>`; } return `<button data-category="${c}">${c}</button>`; }).join(''); document.querySelectorAll('.category-tabs button').forEach(btn => { btn.classList.toggle('active', btn.dataset.category === currentCategory); }); }
    function toggleFavorite() { if (currentSongIndex < 0) return; const songId = currentPlaylist[currentSongIndex].publicId; const favoriteIndex = userFavorites.indexOf(songId); const hadFavoritesBefore = userFavorites.length > 0; if (favoriteIndex > -1) { userFavorites.splice(favoriteIndex, 1); } else { userFavorites.push(songId); } localStorage.setItem('kaylum_favorites', JSON.stringify(userFavorites)); const hasFavoritesNow = userFavorites.length > 0; if (hasFavoritesNow && !hadFavoritesBefore) { playlistsData['Favoritos'] = []; renderCategoryTabs(); } else if (!hasFavoritesNow && hadFavoritesBefore) { delete playlistsData['Favoritos']; if (currentCategory === 'Favoritos') { const firstCategory = Object.keys(playlistsData)[0]; if (firstCategory) loadCategory(firstCategory); } else { renderCategoryTabs(); } } updateFavoriteButton(); }
    function updateFavoriteButton() { if (currentSongIndex < 0) { addToFavoritesBtn.innerHTML = '<i class="bi bi-heart"></i>'; addToFavoritesBtn.classList.remove('is-favorite'); return; } const songId = currentPlaylist[currentSongIndex].publicId; const isFavorite = userFavorites.includes(songId); addToFavoritesBtn.innerHTML = isFavorite ? '<i class="bi bi-heart-fill"></i>' : '<i class="bi bi-heart"></i>'; addToFavoritesBtn.classList.toggle('is-favorite', isFavorite); }
    const shuffleArray = (array) => { let newArr = [...array]; for (let i = newArr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [newArr[i], newArr[j]] = [newArr[j], newArr[i]]; } return newArr; };
    const parseCsvRow = (row) => { const c = []; let d = ''; let e = !1; for (let f = 0; f < row.length; f++) { const g = row[f]; if ('"' === g) e && '"' === row[f + 1] ? (d += '"', f++) : e = !e; else if (',' === g && !e) c.push(d.trim()), d = ''; else d += g } c.push(d.trim()); return c.map(h => h.startsWith('"') && h.endsWith('"') ? h.slice(1, -1) : h) };
    function handleSongEnd() { if (isRepeatActive) { audioPlayer.currentTime = 0; audioPlayer.play(); } else { playNextSong(); } }
    function playNextSong() { if (currentPlaylist.length === 0) return; currentSongIndex = (currentSongIndex + 1) % currentPlaylist.length; loadSong(currentSongIndex); }
    function playPrevSong() { if (currentPlaylist.length === 0) return; currentSongIndex = (currentSongIndex - 1 + currentPlaylist.length) % currentPlaylist.length; loadSong(currentSongIndex); }
    function toggleShuffle() { isShuffleActive = !isShuffleActive; shuffleBtn.classList.toggle('active', isShuffleActive); const currentlyPlayingSong = currentPlaylist[currentSongIndex]; let originalPlaylist; if (currentCategory === 'Favoritos') { originalPlaylist = allSongs.filter(song => userFavorites.includes(song.publicId)); } else { originalPlaylist = playlistsData[currentCategory] || allSongs; } currentPlaylist = isShuffleActive ? shuffleArray(originalPlaylist) : [...originalPlaylist]; if (currentlyPlayingSong) { const newIndex = currentPlaylist.findIndex(song => song.publicId === currentlyPlayingSong.publicId); currentSongIndex = newIndex !== -1 ? newIndex : 0; } else { currentSongIndex = 0; } updatePaginatedView(); }
    function toggleRepeat() { isRepeatActive = !isRepeatActive; repeatBtn.classList.toggle('active', isRepeatActive); }
    function shareSong() { if (currentSongIndex < 0) { alert("Selecciona una canción para compartir."); return; } const songId = currentPlaylist[currentSongIndex].publicId; const shareUrl = `${window.location.origin}${window.location.pathname}?song=${songId}`; navigator.clipboard.writeText(shareUrl).then(() => { const originalHTML = shareBtn.innerHTML; shareBtn.innerHTML = '<i class="bi bi-check-lg"></i>'; setTimeout(() => { shareBtn.innerHTML = originalHTML; }, 2000); }).catch(err => { console.error('Error al copiar el enlace: ', err); alert("No se pudo copiar el enlace."); }); }
    function loadSong(playlistIndex, fromUrl = false) { if (playlistIndex < 0 || playlistIndex >= currentPlaylist.length) return; currentSongIndex = playlistIndex; const song = currentPlaylist[playlistIndex]; songTitleEl.textContent = song.title; songArtistEl.textContent = song.artist; albumArtEl.src = (song.cover && song.cover.trim() !== '') ? song.cover : defaultCover; songInformationEl.classList.remove('is-open'); if (song.information && song.information.trim() !== '') { songInformationEl.textContent = song.information; songInfoToggleBtn.style.display = 'block'; } else { songInfoToggleBtn.style.display = 'none'; } updatePlaylistHighlight(); updateFavoriteButton(); audioPlayer.src = song.publicUrl; audioPlayer.play().catch(e => console.warn("Autoplay bloqueado. Se requiere interacción del usuario.")); if ('mediaSession' in navigator) { navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: `KAYLUM: ${song.category}`, artwork: [{ src: albumArtEl.src, sizes: '250x250', type: 'image/jpeg' },] }); } if (fromUrl) { const newUrl = `${window.location.origin}${window.location.pathname}`; window.history.replaceState({ path: newUrl }, '', newUrl); } }
    function loadCategory(category) { currentCategory = category; if (category === 'Favoritos') { currentPlaylist = allSongs.filter(song => userFavorites.includes(song.publicId)); } else { const categorySongs = playlistsData[category] || []; currentPlaylist = isShuffleActive ? shuffleArray(categorySongs) : [...categorySongs]; } currentSongIndex = -1; currentPage = 1; renderCategoryTabs(); updatePaginatedView(); if (currentPlaylist.length > 0) { loadSong(0); } else { songTitleEl.textContent = "Sin canciones"; songArtistEl.textContent = "Categoría vacía"; audioPlayer.src = ""; albumArtEl.src = defaultCover; songInfoToggleBtn.style.display = 'none'; updatePlaylistHighlight(); updateFavoriteButton(); } }
    function updatePaginatedView() { let playlistToDisplay = currentPlaylist; if (searchInput.value.trim()) { const searchResults = fuse.search(searchInput.value.trim()); const searchResultIds = new Set(searchResults.map(result => result.item.publicId)); playlistToDisplay = currentPlaylist.filter(song => searchResultIds.has(song.publicId)); } const startIndex = (currentPage - 1) * songsPerPage; const paginatedSongs = playlistToDisplay.slice(startIndex, startIndex + songsPerPage); renderPlaylistView(paginatedSongs); renderPaginationControls(playlistToDisplay.length); }
    function renderPlaylistView(playlistToRender) { if (!playlistToRender || playlistToRender.length === 0) { playlistViewContainer.innerHTML = `<p style="text-align:center; padding: 20px 0; color:var(--secondary-text-color);">${searchInput.value.trim() ? 'No se encontraron resultados.' : 'No hay canciones en esta categoría.'}</p>`; return; } const listHTML = `<ol>${playlistToRender.map((song) => { const originalIndex = allSongs.findIndex(s => s.publicId === song.publicId); return `<li data-global-index="${originalIndex}"><i class="bi bi-music-note-beamed icon"></i><div class="track-details"><div class="title">${song.title}</div><div class="artist">${song.artist}</div></div></li>`; }).join('')}</ol>`; playlistViewContainer.innerHTML = listHTML; updatePlaylistHighlight(); }
    function renderPaginationControls(totalItems) { const totalPages = Math.ceil(totalItems / songsPerPage); paginationControlsContainer.style.display = totalPages > 1 ? 'flex' : 'none'; if (totalPages <= 1) { paginationControlsContainer.innerHTML = ''; return; } let buttonsHTML = `<button data-page="prev" ${currentPage === 1 ? 'disabled' : ''}><</button>`; let startPage, endPage; if (totalPages <= 3) { startPage = 1; endPage = totalPages; } else { if (currentPage <= 2) { startPage = 1; endPage = 3; } else if (currentPage >= totalPages - 1) { startPage = totalPages - 2; endPage = totalPages; } else { startPage = currentPage - 1; endPage = currentPage + 1; } } for (let i = startPage; i <= endPage; i++) { buttonsHTML += `<button data-page="${i}" class="${i === currentPage ? 'active' : ''}">${i}</button>`; } buttonsHTML += `<button data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>></button>`; paginationControlsContainer.innerHTML = buttonsHTML; }
    function updatePlaylistHighlight() { if (currentSongIndex < 0) { document.querySelectorAll('.playlist-view li').forEach(li => li.classList.remove('playing')); return; }; const currentSong = currentPlaylist[currentSongIndex]; if (!currentSong) return; const globalIndex = allSongs.findIndex(s => s.publicId === currentSong.publicId); document.querySelectorAll('.playlist-view li').forEach(li => { li.classList.toggle('playing', parseInt(li.dataset.globalIndex) === globalIndex); }); }
    async function loadSkins() { try { const response = await fetch(`${skinsPath}skins.json?_=${new Date().getTime()}`); if (!response.ok) throw new Error('No se encontró skins.json'); const skinFiles = await response.json(); skins = skinFiles.map(file => `${skinsPath}${file}`); if (skins.length > 0) { if (isNaN(currentSkinIndex) || currentSkinIndex < 0 || currentSkinIndex >= skins.length) { currentSkinIndex = 0; } const initialSkin = skins[currentSkinIndex]; const extension = initialSkin.split('.').pop(); if (['webm', 'mp4'].includes(extension)) { backgroundVideo.innerHTML = `<source src="${initialSkin}" type="video/${extension}">`; } else if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) { backgroundVideo.style.backgroundImage = `url('${initialSkin}')`; backgroundVideo.innerHTML = ''; } backgroundVideo.load(); backgroundVideo.play().catch(e => {}); } } catch (error) { console.warn("No se pudo cargar la lista de skins:", error.message); backgroundVideo.innerHTML = `<source src="assets/img/labplay/skins/skin03.webm" type="video/webm">`; backgroundVideo.load(); } }
    function togglePlayPause() { if (audioPlayer.paused) { audioPlayer.play().catch(e => console.error("Error al reproducir:", e)); } else { audioPlayer.pause(); } }

    init();
});
