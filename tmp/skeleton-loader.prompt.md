vWhen we restart the appliciation we get a empty screen which only renders this:
```
        <EmptyState
          message="Initializing storage..."
          submessage="Please wait while we set up your workspace"
        />

        ```
        comming from app/providers/index.tsx

We rather want no layout shift thus we want a screen that has our entire UI layout rendered instantly as it can be served as html and at the places where data needs to be fetched or iniitalized we should have skeletons in our themes style at that spot mocking the data 1:1 preventing layout shift.
wh
The loading should never be blocking, if there are three sections loading with skeletons, and section 2 is done but 1 and 3 is still loading, we should show the skeletons for 1 and 3 as 2 is done. We don't want to block the user from interacting with the UI and let them do so as soon as possible.

We have  a layouts directory which might need to be refactored and have some seperation of concerns with static and stateless layouts in which smaller components can be rendered.

Use modern techniques without any DRY. Use one modular well rounded skeleton component which u can re-use to build all skeletons needed. Write all skeletons for each section that needs it in layouts/skeletons. The stateless layouts can go in either layout(s)/ or maybe layout(s)/shell. Just make sure we don't get incredibly big files and everything remains performant and scalable + accessible.

Use modern techniques with rendering, where appropiate do flags, lazy loading, dynamic imports or suspense with fallbacks.
