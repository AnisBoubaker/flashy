import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Menu,
  MessageCircle,
  X,
  RefreshCcw,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import './styles.css';

const CSV_URL = `${import.meta.env.BASE_URL}data/cards.csv`;
const NO_DIALOGUE = 'all';
const STORAGE_KEY = 'flashy-chinese-state-v1';

function loadSavedState() {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function inferDialogue(theme) {
  const normalized = theme?.trim() ?? '';
  if (/^(du[iì]\s*hu[aà]|对话)\s*\d+/i.test(normalized)) return normalized;
  return '';
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (insideQuotes && char === '"' && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);

  const [header = [], ...body] = rows;
  const keys = header.map((key) => key.trim().toLowerCase());

  return body.map((cells, index) => {
    const item = Object.fromEntries(keys.map((key, cellIndex) => [key, cells[cellIndex] ?? '']));
    const dialogue = item.dialogue || inferDialogue(item.theme);
    const order = Number.parseInt(item.order || item.position || item.line, 10);

    return {
      id: `${item.week}-${item.theme}-${item.chinese}-${index}`,
      csvIndex: index,
      week: Number.parseInt(item.week, 10) || 0,
      theme: item.theme,
      dialogue,
      order: Number.isFinite(order) ? order : index + 1,
      chinese: item.chinese,
      pinyin: item.pinyin,
      french: item.french,
      notes: item.notes,
      audio: item.audio,
    };
  });
}

function findChineseVoice(voices) {
  const preferredLanguages = ['zh-CN', 'zh-Hans', 'zh-SG', 'zh-TW', 'zh-HK'];
  return (
    preferredLanguages
      .map((language) => voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()))
      .find(Boolean) ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('zh'))
  );
}

function speakWithBrowser(text, voice) {
  if (!('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang ?? 'zh-CN';
  utterance.rate = 0.82;
  utterance.pitch = 1;
  if (voice) utterance.voice = voice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'fr', { numeric: true }),
  );
}

function shuffleCards(cards) {
  return [...cards]
    .map((card) => ({ card, rank: Math.random() }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ card }) => card);
}

function orderCardsByIds(cards, ids) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const seen = new Set(ordered.map((card) => card.id));
  const missing = cards.filter((card) => !seen.has(card.id));
  return [...ordered, ...missing];
}

function sortCardsForStudy(cards, selectedDialogue) {
  if (selectedDialogue === NO_DIALOGUE) return cards;

  return [...cards].sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week;
    if (a.order !== b.order) return a.order - b.order;
    return a.csvIndex - b.csvIndex;
  });
}

function App() {
  const savedStateRef = useRef(loadSavedState());
  const didMountRef = useRef(false);
  const [cards, setCards] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [selectedTheme, setSelectedTheme] = useState(() => savedStateRef.current.selectedTheme || 'all');
  const [selectedWeek, setSelectedWeek] = useState(() => savedStateRef.current.selectedWeek || 'all');
  const [selectedDialogue, setSelectedDialogue] = useState(() => savedStateRef.current.selectedDialogue || NO_DIALOGUE);
  const [studyDirection, setStudyDirection] = useState(() => savedStateRef.current.studyDirection || 'zh-fr');
  const [viewMode, setViewMode] = useState(() => savedStateRef.current.viewMode || 'card');
  const [isMenuOpen, setIsMenuOpen] = useState(() => Boolean(savedStateRef.current.isMenuOpen));
  const [showPinyin, setShowPinyin] = useState(() => savedStateRef.current.showPinyin ?? true);
  const [isFlipped, setIsFlipped] = useState(() => Boolean(savedStateRef.current.isFlipped));
  const [flippedListCards, setFlippedListCards] = useState(() => new Set(savedStateRef.current.flippedListCards || []));
  const [currentIndex, setCurrentIndex] = useState(() => savedStateRef.current.currentIndex || 0);
  const [isShuffled, setIsShuffled] = useState(() => Boolean(savedStateRef.current.isShuffled));
  const [shuffledCardIds, setShuffledCardIds] = useState(() => savedStateRef.current.shuffledCardIds || []);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [voices, setVoices] = useState([]);
  const cardRef = useRef(null);

  useEffect(() => {
    fetch(CSV_URL)
      .then((response) => {
        if (!response.ok) throw new Error('CSV file could not be loaded.');
        return response.text();
      })
      .then((text) => {
        setCards(parseCsv(text));
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;

    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const weeks = useMemo(() => uniqueSorted(cards.map((card) => card.week)), [cards]);
  const weekCards = useMemo(
    () => cards.filter((card) => selectedWeek === 'all' || String(card.week) === selectedWeek),
    [cards, selectedWeek],
  );
  const themes = useMemo(() => uniqueSorted(weekCards.map((card) => card.theme)), [weekCards]);
  const dialogues = useMemo(() => {
    return uniqueSorted(weekCards.map((card) => card.dialogue));
  }, [weekCards]);

  const orderedFilteredCards = useMemo(() => {
    return cards.filter((card) => {
      const themeMatches = selectedTheme === 'all' || card.theme === selectedTheme;
      const weekMatches = selectedWeek === 'all' || String(card.week) === selectedWeek;
      const dialogueMatches = selectedDialogue === NO_DIALOGUE || card.dialogue === selectedDialogue;
      return themeMatches && weekMatches && dialogueMatches;
    });
  }, [cards, selectedTheme, selectedWeek, selectedDialogue]);

  const filteredCards = useMemo(() => {
    const filtered = orderedFilteredCards;
    if (selectedDialogue !== NO_DIALOGUE) return sortCardsForStudy(filtered, selectedDialogue);
    return isShuffled ? orderCardsByIds(filtered, shuffledCardIds) : filtered;
  }, [orderedFilteredCards, selectedDialogue, isShuffled, shuffledCardIds]);

  const currentCard = filteredCards[currentIndex] ?? null;
  const total = filteredCards.length;
  const frontIsChinese = studyDirection === 'zh-fr';
  const chineseVoice = useMemo(() => findChineseVoice(voices), [voices]);
  const isDialogueMode = selectedDialogue !== NO_DIALOGUE;

  useEffect(() => {
    if (!isShuffled || selectedDialogue !== NO_DIALOGUE || !orderedFilteredCards.length) return;

    const filteredIds = new Set(orderedFilteredCards.map((card) => card.id));
    const keptIds = shuffledCardIds.filter((id) => filteredIds.has(id));
    const missingIds = orderedFilteredCards.map((card) => card.id).filter((id) => !keptIds.includes(id));
    const hasValidOrder = keptIds.length > 0 && missingIds.length === 0 && keptIds.length === shuffledCardIds.length;

    if (!hasValidOrder) {
      setShuffledCardIds(keptIds.length ? [...keptIds, ...missingIds] : shuffleCards(orderedFilteredCards).map((card) => card.id));
    }
  }, [isShuffled, orderedFilteredCards, selectedDialogue, shuffledCardIds]);

  useEffect(() => {
    const savedCardId = savedStateRef.current.currentCardId;
    if (!savedCardId || !filteredCards.length) return;

    const restoredIndex = filteredCards.findIndex((card) => card.id === savedCardId);
    if (restoredIndex >= 0) {
      setCurrentIndex(restoredIndex);
      savedStateRef.current.currentCardId = '';
    }
  }, [filteredCards]);

  useEffect(() => {
    if (loadState !== 'ready') return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selectedTheme,
          selectedWeek,
          selectedDialogue,
          studyDirection,
          viewMode,
          isMenuOpen,
          showPinyin,
          isFlipped,
          flippedListCards: [...flippedListCards],
          currentIndex,
          currentCardId: currentCard?.id || '',
          isShuffled,
          shuffledCardIds,
        }),
      );
    } catch {
      // localStorage can be unavailable in some private browsing contexts.
    }
  }, [
    currentCard?.id,
    currentIndex,
    flippedListCards,
    isFlipped,
    isMenuOpen,
    isShuffled,
    loadState,
    selectedDialogue,
    selectedTheme,
    selectedWeek,
    showPinyin,
    shuffledCardIds,
    studyDirection,
    viewMode,
  ]);

  useEffect(() => {
    if (selectedTheme !== 'all' && !themes.includes(selectedTheme)) {
      setSelectedTheme('all');
    }
  }, [themes, selectedTheme]);

  useEffect(() => {
    if (selectedDialogue !== NO_DIALOGUE && !dialogues.includes(selectedDialogue)) {
      setSelectedDialogue(NO_DIALOGUE);
    }
  }, [dialogues, selectedDialogue]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    setCurrentIndex(0);
    setIsFlipped(false);
    setFlippedListCards(new Set());
  }, [selectedTheme, selectedWeek, selectedDialogue, studyDirection, showPinyin, isShuffled, shuffleKey, viewMode]);

  useEffect(() => {
    if (currentIndex > Math.max(total - 1, 0)) {
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  }, [currentIndex, total]);

  function moveCard(direction) {
    if (!total) return;
    setCurrentIndex((index) => (index + direction + total) % total);
    setIsFlipped(false);
  }

  function handleTouchEnd(event) {
    if (touchStart === null) return;
    const delta = event.changedTouches[0].clientX - touchStart;
    if (Math.abs(delta) > 56) {
      moveCard(delta < 0 ? 1 : -1);
    }
    setTouchStart(null);
  }

  function playCardChinese(card, event) {
    event.stopPropagation();
    if (!card) return;

    if (card.audio) {
      const audio = new Audio(card.audio);
      audio.play().catch(() => speakWithBrowser(card.chinese, chineseVoice));
      return;
    }

    speakWithBrowser(card.chinese, chineseVoice);
  }

  function playChinese(event) {
    playCardChinese(currentCard, event);
  }

  function toggleListCard(cardId) {
    setFlippedListCards((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function toggleShuffle() {
    if (!isShuffled) {
      setShuffledCardIds(shuffleCards(orderedFilteredCards).map((card) => card.id));
      setShuffleKey((value) => value + 1);
    }
    setIsShuffled((current) => !current);
  }

  const front = frontIsChinese ? 'chinese' : 'french';
  const back = frontIsChinese ? 'french' : 'chinese';
  const visibleSide = isFlipped ? back : front;

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="App summary">
        <div>
          <h1>Flashy Chinese</h1>
        </div>
        <div className="top-actions">
          <div className="count-pill" aria-label={`${total} cartes disponibles`}>
            <BookOpen size={18} />
            <span>{total}</span>
          </div>
          <button
            className="menu-button"
            type="button"
            onClick={() => setIsMenuOpen((value) => !value)}
            aria-expanded={isMenuOpen}
            aria-controls="settings-panel"
            aria-label={isMenuOpen ? 'Fermer les réglages' : 'Ouvrir les réglages'}
          >
            {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </section>

      {isMenuOpen && (
        <section className="settings-panel" id="settings-panel" aria-label="Réglages">
          <div className="controls" aria-label="Study controls">
            <label>
              <span>Thème</span>
              <select value={selectedTheme} onChange={(event) => setSelectedTheme(event.target.value)}>
                <option value="all">Tous</option>
                {themes.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Semaine</span>
              <select value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)}>
                <option value="all">Toutes</option>
                {weeks.map((week) => (
                  <option key={week} value={week}>
                    Semaine {week}
                  </option>
                ))}
              </select>
            </label>

            <label className="dialogue-select">
              <span>Dialogue</span>
              <select value={selectedDialogue} onChange={(event) => setSelectedDialogue(event.target.value)}>
                <option value={NO_DIALOGUE}>Aucun</option>
                {dialogues.map((dialogue) => (
                  <option key={dialogue} value={dialogue}>
                    {dialogue}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mode-panel" aria-label="Display options">
            <div className="segmented" role="group" aria-label="Study direction">
              <button
                className={studyDirection === 'zh-fr' ? 'active' : ''}
                type="button"
                onClick={() => setStudyDirection('zh-fr')}
              >
                中文 → FR
              </button>
              <button
                className={studyDirection === 'fr-zh' ? 'active' : ''}
                type="button"
                onClick={() => setStudyDirection('fr-zh')}
              >
                FR → 中文
              </button>
            </div>

            <div className="segmented" role="group" aria-label="View mode">
              <button
                className={viewMode === 'card' ? 'active' : ''}
                type="button"
                onClick={() => setViewMode('card')}
              >
                Carte
              </button>
              <button
                className={viewMode === 'list' ? 'active' : ''}
                type="button"
                onClick={() => setViewMode('list')}
              >
                Liste
              </button>
            </div>

            <div className="tool-row">
              <button className="icon-button" type="button" onClick={() => setShowPinyin((value) => !value)}>
                {showPinyin ? <Eye size={19} /> : <EyeOff size={19} />}
                <span>{showPinyin ? 'Pinyin' : 'Masqué'}</span>
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={toggleShuffle}
                disabled={isDialogueMode || viewMode === 'list'}
              >
                <Shuffle size={19} />
                <span>{isShuffled && !isDialogueMode && viewMode !== 'list' ? 'Mélangés' : 'Non mélangés'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="study-area" aria-live="polite">
        {loadState === 'loading' && <p className="empty-state">Chargement des cartes...</p>}
        {loadState === 'error' && <p className="empty-state">Impossible de lire `public/data/cards.csv`.</p>}
        {loadState === 'ready' && !currentCard && (
          <p className="empty-state">Aucune carte ne correspond à ces filtres.</p>
        )}

        {currentCard && viewMode === 'card' && (
          <>
            <div className="card-meta">
              <span>
                <Layers size={15} />
                {currentCard.theme}
              </span>
              <span>
                <SlidersHorizontal size={15} />
                Semaine {currentCard.week}
              </span>
              {currentCard.dialogue && (
                <span>
                  <MessageCircle size={15} />
                  {currentCard.dialogue}
                </span>
              )}
            </div>

            <button
              ref={cardRef}
              className={`flash-card ${isFlipped ? 'flipped' : ''}`}
              type="button"
              onClick={() => setIsFlipped((value) => !value)}
              onTouchStart={(event) => setTouchStart(event.touches[0].clientX)}
              onTouchEnd={handleTouchEnd}
              aria-label="Flip flashcard"
            >
              <CardFace card={currentCard} side={visibleSide} showPinyin={showPinyin} />
            </button>

            <div className="card-footer">
              <button className="round-button" type="button" onClick={() => moveCard(-1)} aria-label="Previous card">
                <ChevronLeft size={24} />
              </button>
              <button className="listen-button" type="button" onClick={playChinese} aria-label="Listen to Chinese">
                <Volume2 size={19} />
                <span>Écouter</span>
              </button>
              <button className="flip-button" type="button" onClick={() => setIsFlipped((value) => !value)}>
                {isFlipped ? <RotateCcw size={19} /> : <RefreshCcw size={19} />}
                <span>{isFlipped ? 'Recto' : 'Retourner'}</span>
              </button>
              <button className="round-button" type="button" onClick={() => moveCard(1)} aria-label="Next card">
                <ChevronRight size={24} />
              </button>
            </div>

            <div className="progress-wrap" aria-label={`Carte ${currentIndex + 1} sur ${total}`}>
              <span>
                {currentIndex + 1} / {total}
              </span>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
              </div>
            </div>
          </>
        )}

        {currentCard && viewMode === 'list' && (
          <div className="list-mode" aria-label="Liste des cartes">
            {orderedFilteredCards.map((card) => {
              const isListFlipped = flippedListCards.has(card.id);
              const side = isListFlipped ? back : front;

              return (
                <article className={`list-card ${isListFlipped ? 'flipped' : ''}`} key={card.id}>
                  <button
                    className="list-speaker"
                    type="button"
                    onClick={(event) => playCardChinese(card, event)}
                    aria-label={`Écouter ${card.chinese}`}
                  >
                    <Volume2 size={20} />
                  </button>
                  <button className="list-card-body" type="button" onClick={() => toggleListCard(card.id)}>
                    <ListCardFace card={card} side={side} showPinyin={showPinyin} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function ListCardFace({ card, side, showPinyin }) {
  if (side === 'french') {
    return (
      <span className="list-face french-list-face">
        <strong>{card.french}</strong>
        {card.notes && <small>{card.notes}</small>}
      </span>
    );
  }

  return (
    <span className="list-face chinese-list-face">
      <strong>{card.chinese}</strong>
      {showPinyin && <em>{card.pinyin}</em>}
    </span>
  );
}

function CardFace({ card, side, showPinyin }) {
  if (side === 'french') {
    return (
      <span className="face-content french-face">
        <span className="face-label">Français</span>
        <strong>{card.french}</strong>
        {card.notes && <small>{card.notes}</small>}
      </span>
    );
  }

  return (
    <span className="face-content chinese-face">
      <span className="face-label">中文</span>
      <strong>{card.chinese}</strong>
      {showPinyin && <em>{card.pinyin}</em>}
    </span>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
