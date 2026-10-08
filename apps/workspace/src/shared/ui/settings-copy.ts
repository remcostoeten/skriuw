export const settingsCopy = {
  appearance: {
    chooseHowTheWorkspaceLooksAnd: "Choose how the workspace looks and behaves.",
    appliedAcrossTheWorkspace: "Applied across the workspace.",
    useTighterSpacingInTheNotes: "Use tighter spacing in the notes tree.",
    showTreeGuides: "Show tree guides",
    drawIndentGuidesForNestedNotes: "Draw indent guides for nested notes and folders.",
    howMuchSpaceEachResultIn: "How much space each result in the command palette takes.",
    playABriefAnimationWhenThe:
      "Play a brief animation when the pointer rests on a rail or toolbar icon.",
    rememberLastNote: "Remember last note",
    returnToTheLastOpenNote: "Return to the last open note when the workspace starts.",
    showToastNotifications: "Show toast notifications",
    showBriefNoticesLikeMovedTo:
      "Show brief notices like “Moved to trash”. The undo shortcut keeps working while hidden.",
    addAiProviderSettingsAndWriting:
      "Add AI provider settings and writing tools to the workspace. Enabling this does not install or connect anything.",
    finetuneTheSizeOfWorkspaceSurfaces: "Fine-tune the size of workspace surfaces.",
    commandPaletteSize: "Command palette size",
    howTallAndWideTheCommand: "How tall and wide the command palette opens on larger screens.",
    restoresAppearanceEditorAndKeyboardShortcuts:
      "Restores appearance, editor, and keyboard shortcuts to their defaults. Notes and workspace data are not affected.",
    turnOffAiFeatures: "Turn off AI features?",
    aiToolsAndSettingsWillDisappear:
      "AI tools and settings will disappear immediately, and any request in progress will stop.",
    savedProviderKeysHistoryAndPrompts:
      "Saved provider keys, history, and prompts stay on this device unless you delete them separately.",
    turnOffAi: "Turn off AI",
  },
  editor: {
    mathMacros: "Math macros",
    mathMacrosDescription:
      "Define workspace TeX commands, one per line: \\R = \\mathbb{R}. Use #1 through #9 for arguments. Macros sync with your workspace.",
    mathMacrosPortability:
      "Markdown exports keep macro commands. Other editors need the same definitions; chemistry uses mhchem.",
    tuneTheWritingSurfaceWithoutChanging: "Tune the writing surface without changing note content.",
    usedForNoteContentInThe: "Used for note content in the rendered editor.",
    howMuchRoomEachLineOf: "How much room each line of text gets.",
    defaultToRawMarkdown: "Default to raw Markdown",
    newNotesOpenInTheRaw: "New notes open in the raw Markdown editor. Toggle any note with mod+m.",
    modalEditingInBothEditorsNormal:
      "Modal editing in both editors: normal, insert, and visual modes with counts, operators, text objects, registers, dot repeat, and : commands. Toggle anywhere with mod+alt+i.",
    theCursorShapeUsedInNormal: "The cursor shape used in normal and visual modes.",
    blinkVimCursor: "Blink Vim cursor",
    blinkTheNormalmodeCursorInBoth:
      "Blink the normal-mode cursor in both rendered and raw Markdown editors.",
    keepTheLineYouAreTyping:
      "Keep the line you are typing on in the middle of the screen, in both editors. Toggle anywhere with mod+shift+y.",
    dimOtherParagraphsInFocusMode: "Dim other paragraphs in focus mode",
    focusModeModshiftfFadesEveryBlock:
      "Focus mode (mod+shift+f) fades every block except the one holding the caret. Applies to the rendered editor.",
    blockHandleOnHover: "Block handle on hover",
    hoveringABlockShowsAGutter:
      "Hovering a block shows a gutter to drag it somewhere else, insert below it, or open its actions. Alt+Arrow and the slash menu keep working when this is off.",
    openNotesInTabs: "Open notes in tabs",
    everyNoteYouOpenGetsIts:
      "Every note you open gets its own tab. When off, opening a note replaces the current tab.",
    openLinksInSkriuw: "Open links in Skriuw",
    linksOpenInASkriuwBrowser:
      "Links open in a Skriuw browser window instead of your system browser. The link menu always offers the other one too.",
    emptyNotePrompt: "Empty note prompt",
    shownBeforeANoteHasContent: "Shown before a note has content.",
    dailyWordGoal: "Daily word goal",
    showsQuietProgressInTheJournal:
      "Shows quiet progress in the journal day header and counts goal days in the stats. A change applies from today; earlier days keep the goal they had.",
    mathMacrosSaved: "Math macros saved.",
    mathMacrosCouldNotBeSaved: "Math macros could not be saved. Try again.",
    rMathbbrnormLeftlvert1Rightrvert: "\\R = \\mathbb{R}\n\\norm = \\left\\lVert #1 \\right\\rVert",
    saveMathMacros: "Save math macros",
    georgiaTimesNewRomanSerif: 'Georgia, "Times New Roman", serif',
    customDailyWordGoal: "Custom daily word goal",
  },
  ai: {
    theModelSkriuwUsesForWriting: "The model Skriuw uses for writing tools.",
    defaultAiModel: "Default AI model",
    pullAModelFromOllamaThen:
      "Pull a model from Ollama, then choose which local model future AI actions use.",
    noLocalModelsYetEnterA: "No local models yet. Enter a model name to pull one.",
    theInstructionsBehindEachWritingAction:
      "The instructions behind each writing action. Edit a built-in to make your own copy of it; reset puts the shipped one back. Prompts hold no keys and sync with the rest of your workspace.",
    tellTheModelWhatToDo: "Tell the model what to do with the text.",
    maxOutputBytes: "Max output bytes",
    bringYourOwnKeyKeysGo:
      "Bring your own key. Keys go straight to this device's credential store and are never readable from Skriuw again.",
    noModelsAreListedForThis: "No models are listed for this provider in the catalog.",
    thisSessionOnly: "This session only",
    chooseAModelForWritingTools:
      "Choose a model for writing tools. Open the other sections only when you need them.",
    tryAPrompt: "Try a prompt",
    testTheSelectedModelWithoutChanging: "Test the selected model without changing a note.",
    historyAndUsage: "History and usage",
    everyAiRunThisDeviceMade:
      "Every AI run this device made, recorded locally. Nothing here syncs, exports, or leaves the machine.",
    costIsCalculatedFromTheCatalogue: "Cost is calculated from the catalogue priced ",
    NotFromAProviderInvoice: ", not from a provider invoice.",
    filterByProvider: "Filter by provider",
    filterByModel: "Filter by model",
    filterByState: "Filter by state",
    noRunsRecordedForThisPeriod: "No runs recorded for this period and filter.",
    rerunInPlayground: "Rerun in playground",
    promptTextWasNotRetainedFor: "Prompt text was not retained for this run.",
    keepPromptText: "Keep prompt text",
    offRecordsOnlyMetadataProviderModel:
      "Off records only metadata — provider, model, state, timing, tokens, and cost.",
    olderRunsAndRunsBeyondThe:
      "Older runs and runs beyond the cap are pruned as new runs are recorded.",
    deletesEveryRecordedRunAndIts:
      "Deletes every recorded run and its prompt text from this device.",
    setUpAModelBelow: "Set up a model below",
    chooseAModel: "Choose a model",
    openLocalAiOrOnlineProviders: "Open Local AI or Online providers to get started.",
    chooseTheModelYouWantTo: "Choose the model you want to use.",
    noProcessOrNetworkWorkRuns: "No process or network work runs until this page opens.",
    localAiModel: "Local AI model",
    anythingYouType: "Anything you type",
    acceptAndContinue: "Accept and continue",
    reviewAndAccept: "Review and accept",
    replaceStoredKey: "Replace stored key",
    pasteApiKey: "Paste API key",
    runPrivateModelsOnThisDevice: "Run private models on this device with Ollama.",
    bringYourOwnApiKeyFor:
      "Bring your own API key for Gemini, Groq, DeepSeek, Kimi, GLM, Qwen, or AI/ML API.",
    customizeTheInstructionsBehindEachWriting:
      "Customize the instructions behind each writing action.",
    reviewLocalRunHistoryTokenCounts: "Review local run history, token counts, and estimated cost.",
    PromptNotRetained: " · prompt not retained",
    noCataloguePriceForThisModel: "no catalogue price for this model",
    noSystemPrompt: "(no system prompt)",
    maximumStoredRuns: "Maximum stored runs",
    maximumRunAgeInDays: "Maximum run age in days",
    deleteEveryRun: "Delete every run",
  },
  shortcuts: {
    clickAShortcutThenPressA:
      "Click a shortcut, then press a new key combination. Enter or clicking elsewhere keeps the current one, Escape cancels.",
    noShortcutsMatch: "No shortcuts match “",
    reservedForQuit: "Reserved for “Quit”",
    twoOrThreeKeysHoldingCtrl:
      "Two or three keys holding Ctrl or Cmd. Quit wins over any other shortcut on the same keys.",
    unboundWhileQuitUsesTheSame: "Unbound while Quit uses the same keys.",
    resetAllShortcutsToDefaults: "Reset all shortcuts to defaults",
    quitWithAKeyboardShortcut: "Quit with a keyboard shortcut",
  },
  account: {
    encryptThisWorkspace: "Encrypt this workspace",
    losingItMeansLosingTheCloud:
      "Losing it means losing the cloud copy. The notes on this device are unaffected.",
    iWroteItDown: "I wrote it down",
    enterTheCodeThisWorkspaceShowed:
      "Enter the code this workspace showed when encryption was turned on.",
    changesMadeBeforeEncryptionWasTurned:
      "Changes made before encryption was turned on stay in the cloud until the next encrypted checkpoint replaces them. Keep this device online until sync reports it is up to date.",
    signInForCloudCapabilitiesYour:
      "Sign in for cloud capabilities. Your local workspace remains available without an account.",
    notesOnThisDevice: "Notes on this device",
    deleteAccountAndAllData: "Delete account and all data",
    permanentlyDeletesYourCloudAccountSynced:
      "Permanently deletes your cloud account, synced workspace, shared notes, and all Skriuw workspaces and recovery files on this device. This cannot be undone.",
    showTheFaceGeneratedForYour:
      "Show the face generated for your account. Turn off to show your initials instead.",
    ItNeverUploadedAndOther: "; it never uploaded and other devices will not receive it.",
    showMyRecoveryCode: "Show my recovery code",
    theCodeIsShownOnceWithout:
      "The code is shown once. Without it, the cloud copy cannot be opened again.",
    workspaceRecoveryCode: "Workspace recovery code",
    couldNotReadTheActiveWorkspace: "could not read the active workspace",
    notSignedIn: "Not signed in",
    useEmailAndPasswordToSign: "Use email and password to sign in or create an account.",
    thisPermanentlyRemovesYourCloudAccount:
      "This permanently removes your cloud account and local Skriuw data. Export anything you want to keep first.",
    blockedSyncChanges: "Blocked sync changes",
    discardedSyncChanges: "Discarded sync changes",
    itWillNeverReachYourOther: "It will never reach your other devices.",
    sharedByEveryAccountThatSigns: "Shared by every account that signs in on this device.",
    linkedToThisAccountAnotherAccount:
      "Linked to this account. Another account that signs in here opens a workspace of its own, and these notes stay here for you.",
    notLinkedToAnAccountYet:
      "Not linked to an account yet. The first account to sign in keeps these notes.",
    linkedToACloudAccountSign:
      "Linked to a cloud account. Sign back into it to keep working on these notes; a different account opens a workspace of its own.",
  },
  lock: {
    privacyLock: "Privacy & lock",
    lockSingleNotesOrWholeFolders:
      "Lock single notes or whole folders behind one PIN or passphrase. Locked bodies are encrypted on disk and stay out of search, links, tasks, and history until unlocked.",
    setUpLock: "Set up lock…",
    lockAgainAutomatically: "Lock again automatically",
    afterThisLongWithoutTypingClicking:
      "After this long without typing, clicking, or scrolling, locked notes close again.",
    lockWhenTheWindowLosesFocus: "Lock when the window loses focus",
    closesLockedNotesTheMomentYou:
      "Closes locked notes the moment you switch to another app or tab.",
    removeTheLock: "Remove the lock",
    unlocksEveryLockedNoteForGood: "Unlocks every locked note for good and forgets the ",
    andRecoveryCode: " and recovery code.",
    noLockSetUpLockA: "No lock set up. Lock a note from its context menu or set one up here.",
    text1LockedNote: "1 locked note",
    privacyAndLockPreferences: "Privacy and lock preferences",
    notSetUp: "Not set up",
    everyLockedNoteBecomesReadableAgain:
      "Every locked note becomes readable again on every device.",
    removingTheLock: "Removing the lock",
  },
  data: {
    dataRecovery: "Data & recovery",
    importsStoragePortableArchivesBackupsAnd:
      "Imports, storage, portable archives, backups, and recovery for this workspace.",
    storedDurablyInThisBrowsersPrivate:
      "Stored durably in this browser’s private site storage (OPFS) on this device. Clearing site data for this origin deletes it, so keep a recent exported archive outside the browser.",
    addsSkriuwToYourHomeScreen:
      "Adds Skriuw to your home screen or app list with its own window, and tells the browser this storage is worth keeping.",
    showInFileManager: "Show in file manager",
    copiesTheDatabaseImagesHistoryAnd:
      "Copies the database, images, history, and backups to a new folder, then restarts the app using it.",
    importExport: "Import & export",
    importNotesFromAFolder: "Import notes from a folder",
    markdownTextObsidianVaultsExtractedNotion:
      "Markdown, text, Obsidian vaults, extracted Notion exports, or TextBundles. Shows a preview before anything changes.",
    importAProviderExport: "Import a provider export",
    zipEvernoteEnexJoplinGoogleKeep:
      "ZIP, Evernote ENEX, Joplin, Google Keep, Standard Notes, Bear .bear2bk, Simplenote JSON, Notion CSV, Markdown, or text files. Shows a preview before anything changes.",
    remoteImagesInImports: "Remote images in imports",
    imagesThatMarkdownLinksFromThe:
      "Images that Markdown links from the web, such as README badges. Downloading fetches each one once during import and stores it in the workspace; notes never load them from the web when opened.",
    backupsRecovery: "Backups & recovery",
    verifiedScheduledBackupsRunInThe:
      "Verified scheduled backups run in the desktop app. In the browser, an exported archive is the backup: download one regularly and keep it outside this browser.",
    theDesktopAppTakesAVerified:
      "The desktop app takes a verified backup every six hours while it runs.",
    replaceWorkspaceFromArchive: "Replace workspace from archive",
    replacesEveryNoteInThisWorkspace:
      "Replaces every note in this workspace with the contents of a previously exported archive file.",
    clearAllData: "Clear all data",
    permanentlyDeletesNotesSettingsAnd: "Permanently deletes notes, settings, and",
    fromThisDeviceThen: "from this device, then",
    aFreshWorkspaceYouWillAlso: " a fresh workspace. You will also be signed out.",
    couldNotClearAllData: "Could not clear all data: ",
    clearAllData2: "Clear all data…",
    backupsCouldNotBeListed: "Backups could not be listed.",
    noBackupsYetUseBackUp:
      "No backups yet. Use “Back up now” or wait for the next scheduled backup.",
    keptAfterRestores: "Kept after restores",
    wasCancelledNothingChanged: " was cancelled. Nothing changed.",
    backupNotDueYetNextScheduled: "Backup not due yet. Next scheduled backup",
    backUpAnyway: "Back up anyway",
    noNotesWithoutContentPinnedLocked:
      "No notes without content. Pinned, locked and journal notes are never touched.",
    importingReplacesEveryNoteFolderAnd:
      "Importing replaces every note, folder, and setting in this workspace with the archive contents. A safety backup of the current database is created first.",
    moveWorkspaceStorage: "Move workspace storage",
    moveAndRestart: "Move and restart",
    storagePathLookupRejected: "storage path lookup rejected",
    chooseAWorkspaceArchive: "Choose a workspace archive",
    archivePickRejected: "archive pick rejected",
    chooseANewStorageFolder: "Choose a new storage folder",
    storageFolderPickRejected: "storage folder pick rejected",
    dataAndRecovery: "Data and recovery",
    revealStorageRejected: "reveal storage rejected",
    downloadsAPortableJsonArchiveOf: "Downloads a portable JSON archive of this workspace.",
    writesAPortableJsonArchiveInto:
      "Writes a portable JSON archive into the exports folder next to the database.",
    backUpNow: "Back up now",
    aSafetyCopyOfTheCurrent: " A safety copy of the current workspace is downloaded first.",
    browserownedSqliteAndMediaStorage: "browser-owned SQLite and media storage",
    sqliteDataMarkdownHistoryMediaBackups:
      "SQLite data, Markdown history, media, backups, and generated exports",
    thisCannotBeUndoneExportAnything:
      "This cannot be undone. Export anything you want to keep first.",
  },
  about: {
    versionDetailsUpdatesAndWhereTo: "Version details, updates, and where to go for help.",
    browseTheCodeAndOpenPull: "Browse the code and open pull requests.",
    seeWhatChangedInEachRelease: "See what changed in each release.",
    reportAnIssue: "Report an issue",
    fileABugOrRequestA: "File a bug or request a feature.",
    automaticUpdatesArentSetUpFor: "Automatic updates aren’t set up for this build yet.",
    youreOnTheLatestVersion: "You’re on the latest version.",
    checkForUpdates: "Check for updates",
    openExternalUrlRejected: "open external url rejected",
  },
  media: {
    everyImageStoredInThisWorkspace:
      "Every image stored in this workspace, with the notes that use it. Unused images stay until you delete them.",
    StoredOncePerUniqueFile:
      ". Stored once per unique file in the blobs folder next to the database.",
    showInFileManager: "Show in file manager",
    removeAllUnused: "Remove all unused",
    deletesEveryImageThatNoNote:
      "Deletes every image that no note references. This cannot be undone.",
    selectAllDeletable: "Select all deletable (",
    theMediaLibraryCouldNotBe: "The media library could not be listed.",
    altTextForScreenReaders: "Alt text for screen readers",
    nothingRemovedImagesAddedInThe:
      "Nothing removed. Images added in the last minute are kept as a safety margin.",
    revealImagesRejected: "reveal images rejected",
    thisCannotBeUndone: "This cannot be undone.",
    noImagesStoredYetPasteOr:
      "No images stored yet. Paste or drop an image into a note, or use “Add images…”.",
    noMediaMatchesThisFilter: "No media matches this filter.",
    nameThisFile: "Name this file",
    renameThisFile: "Rename this file",
    FileMissing: " · file missing",
  },
} as const;
