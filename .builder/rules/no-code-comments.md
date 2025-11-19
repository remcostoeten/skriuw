## no code comments

Code should be self explanitory therefor code comments only cause mess. Function names, variable, types and constant names should be self descriptive and code should be easy to read. Prevent writing two+ nested ternary operators for example.

```ts
//NO GO / BAD example

// type for the props
type TheCardPropsType= {
    ...
}

// GOOD

type props = {
    ....
}
``` 

it sclear for everyone that there will be a type edifned by the language type keyword.