# Long note

Over the 192-block threshold, so this note opens in the **bounded editor**: only
a window of blocks is in the document at once, and scrolling swaps the window.
It is the least-travelled path in the editor and the one most likely to lose
text, so treat any change here as serious.

Blocks are numbered. If a number is ever missing, out of order, or duplicated
after scrolling, that is a real bug.

## What to check

- Scroll to the very bottom and back to the top; numbering stays 1 to 400
- The scrollbar does not jump around as windows swap
- `Mod-a` then copy gives you the **whole** note, not just the visible window
- Search finds text far outside the current window and scrolls to it
- Undo after an edit near a window boundary restores the right text
- `Tab` reaches the accessible full-text copy of the note

## Drag handles here

Reordering only works **within the visible window**. Blocks outside it are not
in the document, so there is nothing to drop onto. This is a known limitation,
not a bug. What must not happen:

- Scrolling during a drag must not cancel it or corrupt the document
- `Alt-Arrow` at a window edge must not silently do nothing surprising

## Blocks


Block 1. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 2. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 3, a list item
- Block 3, second item

Block 4. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 5, a blockquote.

Block 6. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 7, a heading

Block 8. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block9 = 9;
```

Block 10. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 11. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 12. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 13, a list item
- Block 13, second item

Block 14. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 15, a blockquote.

Block 16. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 17, a heading

Block 18. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block19 = 19;
```

Block 20. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 21. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 22. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 23, a list item
- Block 23, second item

Block 24. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 25, a blockquote.

Block 26. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 27, a heading

Block 28. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block29 = 29;
```

Block 30. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 31. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 32. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 33, a list item
- Block 33, second item

Block 34. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 35, a blockquote.

Block 36. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 37, a heading

Block 38. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block39 = 39;
```

Block 40. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 41. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 42. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 43, a list item
- Block 43, second item

Block 44. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 45, a blockquote.

Block 46. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 47, a heading

Block 48. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block49 = 49;
```

Block 50. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 51. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 52. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 53, a list item
- Block 53, second item

Block 54. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 55, a blockquote.

Block 56. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 57, a heading

Block 58. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block59 = 59;
```

Block 60. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 61. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 62. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 63, a list item
- Block 63, second item

Block 64. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 65, a blockquote.

Block 66. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 67, a heading

Block 68. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block69 = 69;
```

Block 70. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 71. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 72. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 73, a list item
- Block 73, second item

Block 74. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 75, a blockquote.

Block 76. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 77, a heading

Block 78. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block79 = 79;
```

Block 80. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 81. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 82. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 83, a list item
- Block 83, second item

Block 84. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 85, a blockquote.

Block 86. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 87, a heading

Block 88. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block89 = 89;
```

Block 90. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 91. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 92. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 93, a list item
- Block 93, second item

Block 94. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 95, a blockquote.

Block 96. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 97, a heading

Block 98. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block99 = 99;
```

Block 100. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 101. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 102. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 103, a list item
- Block 103, second item

Block 104. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 105, a blockquote.

Block 106. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 107, a heading

Block 108. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block109 = 109;
```

Block 110. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 111. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 112. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 113, a list item
- Block 113, second item

Block 114. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 115, a blockquote.

Block 116. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 117, a heading

Block 118. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block119 = 119;
```

Block 120. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 121. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 122. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 123, a list item
- Block 123, second item

Block 124. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 125, a blockquote.

Block 126. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 127, a heading

Block 128. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block129 = 129;
```

Block 130. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 131. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 132. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 133, a list item
- Block 133, second item

Block 134. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 135, a blockquote.

Block 136. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 137, a heading

Block 138. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block139 = 139;
```

Block 140. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 141. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 142. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 143, a list item
- Block 143, second item

Block 144. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 145, a blockquote.

Block 146. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 147, a heading

Block 148. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block149 = 149;
```

Block 150. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 151. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 152. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 153, a list item
- Block 153, second item

Block 154. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 155, a blockquote.

Block 156. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 157, a heading

Block 158. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block159 = 159;
```

Block 160. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 161. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 162. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 163, a list item
- Block 163, second item

Block 164. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 165, a blockquote.

Block 166. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 167, a heading

Block 168. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block169 = 169;
```

Block 170. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 171. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 172. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 173, a list item
- Block 173, second item

Block 174. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 175, a blockquote.

Block 176. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 177, a heading

Block 178. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block179 = 179;
```

Block 180. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 181. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 182. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 183, a list item
- Block 183, second item

Block 184. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 185, a blockquote.

Block 186. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 187, a heading

Block 188. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block189 = 189;
```

Block 190. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 191. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 192. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 193, a list item
- Block 193, second item

Block 194. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 195, a blockquote.

Block 196. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 197, a heading

Block 198. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block199 = 199;
```

Block 200. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 201. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 202. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 203, a list item
- Block 203, second item

Block 204. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 205, a blockquote.

Block 206. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 207, a heading

Block 208. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block209 = 209;
```

Block 210. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 211. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 212. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 213, a list item
- Block 213, second item

Block 214. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 215, a blockquote.

Block 216. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 217, a heading

Block 218. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block219 = 219;
```

Block 220. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 221. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 222. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 223, a list item
- Block 223, second item

Block 224. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 225, a blockquote.

Block 226. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 227, a heading

Block 228. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block229 = 229;
```

Block 230. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 231. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 232. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 233, a list item
- Block 233, second item

Block 234. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 235, a blockquote.

Block 236. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 237, a heading

Block 238. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block239 = 239;
```

Block 240. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 241. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 242. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 243, a list item
- Block 243, second item

Block 244. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 245, a blockquote.

Block 246. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 247, a heading

Block 248. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block249 = 249;
```

Block 250. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 251. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 252. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 253, a list item
- Block 253, second item

Block 254. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 255, a blockquote.

Block 256. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 257, a heading

Block 258. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block259 = 259;
```

Block 260. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 261. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 262. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 263, a list item
- Block 263, second item

Block 264. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 265, a blockquote.

Block 266. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 267, a heading

Block 268. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block269 = 269;
```

Block 270. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 271. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 272. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 273, a list item
- Block 273, second item

Block 274. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 275, a blockquote.

Block 276. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 277, a heading

Block 278. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block279 = 279;
```

Block 280. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 281. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 282. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 283, a list item
- Block 283, second item

Block 284. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 285, a blockquote.

Block 286. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 287, a heading

Block 288. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block289 = 289;
```

Block 290. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 291. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 292. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 293, a list item
- Block 293, second item

Block 294. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 295, a blockquote.

Block 296. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 297, a heading

Block 298. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block299 = 299;
```

Block 300. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 301. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 302. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 303, a list item
- Block 303, second item

Block 304. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 305, a blockquote.

Block 306. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 307, a heading

Block 308. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block309 = 309;
```

Block 310. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 311. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 312. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 313, a list item
- Block 313, second item

Block 314. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 315, a blockquote.

Block 316. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 317, a heading

Block 318. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block319 = 319;
```

Block 320. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 321. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 322. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 323, a list item
- Block 323, second item

Block 324. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 325, a blockquote.

Block 326. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 327, a heading

Block 328. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block329 = 329;
```

Block 330. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 331. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 332. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 333, a list item
- Block 333, second item

Block 334. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 335, a blockquote.

Block 336. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 337, a heading

Block 338. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block339 = 339;
```

Block 340. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 341. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 342. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 343, a list item
- Block 343, second item

Block 344. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 345, a blockquote.

Block 346. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 347, a heading

Block 348. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block349 = 349;
```

Block 350. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 351. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 352. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 353, a list item
- Block 353, second item

Block 354. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 355, a blockquote.

Block 356. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 357, a heading

Block 358. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block359 = 359;
```

Block 360. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 361. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 362. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 363, a list item
- Block 363, second item

Block 364. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 365, a blockquote.

Block 366. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 367, a heading

Block 368. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block369 = 369;
```

Block 370. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 371. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 372. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 373, a list item
- Block 373, second item

Block 374. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 375, a blockquote.

Block 376. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 377, a heading

Block 378. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block379 = 379;
```

Block 380. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 381. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 382. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 383, a list item
- Block 383, second item

Block 384. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 385, a blockquote.

Block 386. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 387, a heading

Block 388. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block389 = 389;
```

Block 390. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 391. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

Block 392. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

- Block 393, a list item
- Block 393, second item

Block 394. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

> Block 395, a blockquote.

Block 396. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

### Block 397, a heading

Block 398. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.

```ts
const block399 = 399;
```

Block 400. A plain paragraph carrying enough words that it wraps onto a second line on a normal window width.


## Checklist

- [ ] Numbering runs 1 to 400 with no gaps after scrolling both ways
- [ ] `Mod-a` copies the whole note
- [ ] Search reaches text outside the window
- [ ] Undo near a boundary restores correctly
- [ ] Dragging within a window works; scrolling mid-drag does not corrupt
- [ ] Reopening changes nothing
