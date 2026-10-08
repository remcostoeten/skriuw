# Math

Write equations alongside your notes. Skriuw renders TeX with KaTeX, using fonts bundled with the app.

## Inside a sentence

The area of a circle is $A = \pi r^2$. With $r = 3$, the area is $9\pi$.

Choose `/inline` to insert an inline equation, or select TeX and press `Ctrl+Alt+E` (`Cmd+Alt+E` on macOS). Click an equation to edit its source; Enter applies the change.

## Equations on their own line

Choose `/math`, or type `$$` on an empty line and press Enter. Click the block to edit the TeX. Escape returns to the text.

The quadratic formula:

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

A definite integral:

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

A matrix:

$$
\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
$$

## Take the source with you

Exported Markdown uses `$...$` for inline equations and `$$` lines around display equations. Both forms also work when importing Markdown.

Typing `$` still opens the people menu. Use the math commands to create an equation while writing.

[[Writing]] has the other editor shortcuts.
