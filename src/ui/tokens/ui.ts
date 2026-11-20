export const UI_TOKENS = {
  layout: {
    appHeader:
      'relative h-12 border-b border-border-main bg-surface flex items-center justify-between px-3 shrink-0 z-30 text-text-main select-none',
    leftPanelBase: 'flex flex-col bg-surface border-border-main z-10 text-text-main',
    rightPanelBase: 'bg-app flex flex-col overflow-hidden relative',
    sectionTitle: 'text-xs font-black uppercase tracking-[0.2em] text-text-faint',
    sectionTitleMini: 'text-[10px] font-black uppercase tracking-[0.2em] text-text-faint',
  },

  modal: {
    overlay:
      'fixed inset-0 z-[110] flex items-center justify-center p-4 bg-overlay-bg backdrop-blur-sm',
    overlayHeavy:
      'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-overlay-heavy backdrop-blur-sm',
    containerSm:
      'bg-surface w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden border border-border-main text-text-main',
    containerMd:
      'bg-surface w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-border-main text-text-main',
    containerLg:
      'bg-surface w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-border-main text-text-main',
    header:
      'flex items-center justify-between px-4 py-3.5 md:px-5 md:py-4 border-b border-border-subtle bg-surface-subtle shrink-0 text-text-main',
    footer:
      'px-6 py-3 border-t border-border-subtle bg-surface-subtle flex justify-end shrink-0',
    title: 'text-lg font-bold text-text-main',
    description: 'text-sm text-text-muted mt-2',
  },

  dropdown: {
    menu: 'absolute top-full left-0 mt-2 w-48 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle',
    menuLeftWide:
      'absolute top-full left-0 mt-2 w-60 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle',
    menuRight:
      'absolute top-full right-0 mt-2 w-48 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle',
    menuWide:
      'absolute top-full right-0 mt-2 w-64 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle',
    header: 'px-3 py-2 bg-surface-subtle border-b border-border-subtle flex items-center justify-between',
    headerText: 'text-[10px] font-semibold text-text-faint tracking-wider uppercase',
    item: 'w-full text-left px-3 py-2 text-xs font-medium hover:bg-surface-subtle flex items-center justify-between transition-colors text-text-body hover:text-text-main cursor-pointer',
    itemActive:
      'w-full text-left px-3 py-2 text-xs font-semibold bg-surface-muted text-text-main flex items-center justify-between transition-colors cursor-pointer',
  },

  button: {
    primary:
      'px-4 py-2 bg-btn-primary-bg text-btn-primary-text rounded-xl text-xs font-semibold hover:bg-btn-primary-hover transition-colors active:scale-95 shadow-xs cursor-pointer whitespace-nowrap shrink-0',
    secondary:
      'px-3.5 py-2 bg-btn-secondary-bg text-btn-secondary-text rounded-xl text-xs font-semibold hover:bg-btn-secondary-hover transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0',
    danger:
      'px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-semibold hover:bg-red-600 transition-colors active:scale-95 shadow-xs cursor-pointer whitespace-nowrap shrink-0',
    actionPill:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface hover:bg-surface-subtle text-text-body rounded-lg text-xs font-medium transition-colors active:scale-95 border border-border-main shadow-2xs cursor-pointer whitespace-nowrap shrink-0',
    actionPillActive:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-btn-primary-bg text-btn-primary-text rounded-lg text-xs font-medium transition-colors active:scale-95 border border-btn-primary-bg shadow-2xs cursor-pointer whitespace-nowrap shrink-0',
    filePill:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface hover:bg-surface-subtle text-text-body hover:text-text-main rounded-xl text-xs font-medium transition-colors active:scale-95 border border-border-main shadow-2xs cursor-pointer whitespace-nowrap shrink-0',
    filePillActive:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-muted text-text-main rounded-xl text-xs font-medium transition-colors active:scale-95 border border-border-main shadow-inner cursor-pointer whitespace-nowrap shrink-0',
    forkPill:
      'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-surface-subtle hover:bg-surface-hover text-text-main border border-border-main shadow-2xs hover:shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0',
    segmentedGroup:
      'flex items-center bg-surface-muted p-0.5 rounded-xl border border-border-main shadow-2xs shrink-0',
    segmentedItem:
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-text-muted hover:text-text-main hover:bg-surface/60 transition-colors active:scale-95 cursor-pointer whitespace-nowrap shrink-0',
    segmentedItemActive:
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface text-text-main shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0',
    iconClose:
      'p-1.5 hover:bg-surface-muted rounded-full transition-colors active:scale-90 text-text-faint hover:text-text-main cursor-pointer',
    iconGhost:
      'inline-flex items-center justify-center p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-muted transition-colors active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted disabled:cursor-not-allowed cursor-pointer shrink-0',
  },

  input: {
    search:
      'w-full pl-9 pr-8 py-2 bg-surface-muted hover:bg-surface-subtle focus:bg-surface text-xs text-text-body placeholder-text-placeholder rounded-xl border border-transparent focus:border-border-main shadow-inner focus:shadow-none transition-all outline-none',
    numberBox:
      'w-full bg-surface border border-border-main text-text-main rounded-xl px-2 py-1.5 text-xs font-mono focus:outline-none',
    label: 'text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint ml-1',
    labelMini: 'text-[10px] font-semibold uppercase tracking-wider text-text-faint',
  },
} as const;
