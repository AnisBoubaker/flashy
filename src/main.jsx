import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  RefreshCcw,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import './styles.css';

const CSV_URL = `${import.meta.env.BASE_URL}data/cards.csv`;

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
    return {
      id: `${item.week}-${item.theme}-${item.chinese}-${index}`,
      week: Number.parseInt(item.week, 10) || 0,
      theme: item.theme,
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

function App() {
  const [cards, setCards] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [selectedTheme, setSelectedTheme] = useState('all');
  const [selectedWeek, setSelectedWeek] = useState('all');
  const [studyDirection, setStudyDirection] = useState('zh-fr');
  const [showPinyin, setShowPinyin] = useState(true);
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
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

  const themes = useMemo(() => uniqueSorted(cards.map((card) => card.theme)), [cards]);
  const weeks = useMemo(() => uniqueSorted(cards.map((card) => card.week)), [cards]);

  const filteredCards = useMemo(() => {
    const filtered = cards.filter((card) => {
      const themeMatches = selectedTheme === 'all' || card.theme === selectedTheme;
      const weekMatches = selectedWeek === 'all' || String(card.week) === selectedWeek;
      return themeMatches && weekMatches;
    });

    return shuffleKey ? shuffleCards(filtered) : filtered;
  }, [cards, selectedTheme, selectedWeek, shuffleKey]);

  const currentCard = filteredCards[currentIndex] ?? null;
  const total = filteredCards.length;
  const frontIsChinese = studyDirection === 'zh-fr';
  const chineseVoice = useMemo(() => findChineseVoice(voices), [voices]);

  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [selectedTheme, selectedWeek, studyDirection, showPinyin, shuffleKey]);

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

  function playChinese(event) {
    event.stopPropagation();
    if (!currentCard) return;

    if (currentCard.audio) {
      const audio = new Audio(currentCard.audio);
      audio.play().catch(() => speakWithBrowser(currentCard.chinese, chineseVoice));
      return;
    }

    speakWithBrowser(currentCard.chinese, chineseVoice);
  }

  const front = frontIsChinese ? 'chinese' : 'french';
  const back = frontIsChinese ? 'french' : 'chinese';
  const visibleSide = isFlipped ? back : front;

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="App summary">
        <div>
          <p className="eyebrow">Flashy Chinese</p>
          <h1>Cartes de cours</h1>
        </div>
        <div className="count-pill" aria-label={`${total} cartes disponibles`}>
          <BookOpen size={18} />
          <span>{total}</span>
        </div>
      </section>

      <section className="controls" aria-label="Study controls">
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
      </section>

      <section className="mode-panel" aria-label="Display options">
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

        <div className="tool-row">
          <button className="icon-button" type="button" onClick={() => setShowPinyin((value) => !value)}>
            {showPinyin ? <Eye size={19} /> : <EyeOff size={19} />}
            <span>{showPinyin ? 'Pinyin' : 'Masqué'}</span>
          </button>
          <button className="icon-button" type="button" onClick={() => setShuffleKey((value) => value + 1)}>
            <Shuffle size={19} />
            <span>Mélanger</span>
          </button>
        </div>
      </section>

      <section className="study-area" aria-live="polite">
        {loadState === 'loading' && <p className="empty-state">Chargement des cartes...</p>}
        {loadState === 'error' && <p className="empty-state">Impossible de lire `public/data/cards.csv`.</p>}
        {loadState === 'ready' && !currentCard && (
          <p className="empty-state">Aucune carte ne correspond à ces filtres.</p>
        )}

        {currentCard && (
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
      </section>
    </main>
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
