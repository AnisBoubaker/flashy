# CSV Data

Add or edit cards in `cards.csv`.

Required columns:

- `week`: course week number
- `theme`: topic or subject
- `dialogue`: optional dialogue name, for example `duì huà 1`
- `order`: sentence order inside a dialogue
- `chinese`: Chinese word or sentence
- `pinyin`: pronunciation
- `french`: French translation

Optional column:

- `notes`: private reminder or context
- `audio`: optional local audio file path, for example `/audio/ni-hao.mp3`

If `audio` is empty, the app uses the browser's built-in Chinese speech voice.

Dialogue rows are still normal flashcards. They can appear when studying by theme or week.
When you select a dialogue in the app, the rows are shown in `order` instead of shuffled.
If your `theme` is named like `duì huà 1`, the app can infer the dialogue name even if the `dialogue` column is empty.

If a value contains a comma, wrap it in quotes:

```csv
4,Restaurant,,1,"请给我菜单","qǐng gěi wǒ cài dān","donnez-moi le menu, s'il vous plaît",,/audio/menu.mp3
4,duì huà 3,duì huà 3,1,"你想吃什么？","nǐ xiǎng chī shén me?","qu'est-ce que tu veux manger ?",,
4,duì huà 3,duì huà 3,2,"我想吃米饭。","wǒ xiǎng chī mǐ fàn.","je voudrais manger du riz.",,
```
