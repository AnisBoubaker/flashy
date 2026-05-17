# CSV Data

Add or edit cards in `cards.csv`.

Required columns:

- `week`: course week number
- `theme`: topic or subject
- `chinese`: Chinese word or sentence
- `pinyin`: pronunciation
- `french`: French translation

Optional column:

- `notes`: private reminder or context
- `audio`: optional local audio file path, for example `/audio/ni-hao.mp3`

If `audio` is empty, the app uses the browser's built-in Chinese speech voice.

If a value contains a comma, wrap it in quotes:

```csv
4,Restaurant,"请给我菜单","qǐng gěi wǒ cài dān","donnez-moi le menu, s'il vous plaît",,/audio/menu.mp3
```
